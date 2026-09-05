#!/usr/bin/env python3
"""Run all integration-bearing packages on disposable, package-isolated Postgres.

No supplied DSN is accepted. Requires Python 3, Go and a Docker daemon.
JSONL, coverage and summary artifacts are retained outside the repository by default.
"""

import argparse
import json
import os
from pathlib import Path
import re
import secrets
import signal
import subprocess
import tempfile
import time


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "blog-backend"
MODULE = "github.com/rushairer/blog-backend/"
IMAGE = "pgvector/pgvector:pg15"


def inventory(root=BACKEND):
    required = {}
    for source in sorted((root / "internal").glob("*/*_integration_test.go")):
        package = source.parent.relative_to(root).as_posix()
        names = re.findall(r"^func (Test\w+)\(t \*testing\.T\)", source.read_text(), re.M)
        if not names:
            raise RuntimeError(f"no test functions discovered in {source}")
        required.setdefault(package, set()).update(names)
    if not required or "internal/migrations" not in required:
        raise RuntimeError("integration inventory is empty or lacks migrations")
    return required


def validate_events(events, package, required, returncode):
    terminal = {}
    package_passed = False
    for event in events:
        if event.get("Package") != MODULE + package:
            continue
        action = event.get("Action")
        if action in ("pass", "fail", "skip"):
            if event.get("Test"):
                terminal[event["Test"]] = action
            elif action == "pass":
                package_passed = True
    missing = sorted(required - terminal.keys())
    skipped = sorted(name for name, result in terminal.items() if result == "skip")
    failed = sorted(name for name, result in terminal.items() if result == "fail")
    result = {
        "package": package,
        "scope": "frozen-connector-observation" if package == "internal/connector" else "core",
        "required": sorted(required),
        "passed": sorted(name for name, action in terminal.items() if action == "pass"),
        "failed": failed, "skipped": skipped, "missing": missing,
        "exit_code": returncode,
    }
    result["ok"] = returncode == 0 and package_passed and not (missing or skipped or failed)
    return result


def command(args, **kwargs):
    return subprocess.run(args, check=True, text=True, **kwargs)


def run_gate(output):
    if os.environ.get("BLOG_TEST_POSTGRES_DSN"):
        raise RuntimeError("unset BLOG_TEST_POSTGRES_DSN; this runner never uses an existing database")
    if output.exists() and any(output.iterdir()):
        raise RuntimeError("artifact directory must be empty; do not mix evidence from different runs")
    required = inventory()
    output.mkdir(parents=True, exist_ok=True)
    container = "blog-ci-" + secrets.token_hex(6)
    password = secrets.token_hex(24)
    env = dict(os.environ, POSTGRES_PASSWORD=password)
    started = time.monotonic()
    summary = {"container": container, "image": IMAGE, "packages": [], "ok": False}
    print(f"Artifacts: {output}\nDisposable container: {container}", flush=True)
    try:
        # No project volumes or network are reused. The only host port is ephemeral
        # and loopback-bound; PGDATA is tmpfs and removed together with the container.
        command(["docker", "run", "--detach", "--name", container,
                 "--label", "gouno.test=q01", "--tmpfs", "/var/lib/postgresql/data",
                 "-e", "POSTGRES_USER=blog_ci", "-e", "POSTGRES_PASSWORD",
                 "-p", "127.0.0.1::5432", IMAGE], env=env, stdout=subprocess.DEVNULL)
        for _ in range(60):
            ready = subprocess.run(["docker", "exec", container, "pg_isready", "-U", "blog_ci"],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if ready.returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError("disposable Postgres did not become ready in 60 seconds")
        mapping = command(["docker", "port", container, "5432/tcp"], capture_output=True).stdout.strip()
        if not re.fullmatch(r"127\.0\.0\.1:\d+", mapping):
            raise RuntimeError("expected a loopback-only ephemeral database port")
        port = mapping.rsplit(":", 1)[1]
        setup = output / "dbsetup"
        command(["go", "build", "-o", str(setup), "./internal/testsupport/dbsetup"], cwd=BACKEND)

        def database(name):
            command(["docker", "exec", container, "createdb", "-U", "blog_ci", name])
            return dict(os.environ, BLOG_TEST_POSTGRES_DSN=
                        f"postgres://blog_ci:{password}@127.0.0.1:{port}/{name}?sslmode=disable&connect_timeout=3")

        # Prove failure propagation against only this owned container.
        negative = database("blog_ci_negative")
        probes = []
        for label, probe_env in [
            ("missing-dsn", {k: v for k, v in negative.items() if k != "BLOG_TEST_POSTGRES_DSN"}),
            ("unknown-database", dict(negative, BLOG_TEST_POSTGRES_DSN=negative["BLOG_TEST_POSTGRES_DSN"].replace("blog_ci_negative?", "blog_ci_absent?"))),
        ]:
            run = subprocess.run([str(setup)], env=probe_env, capture_output=True, text=True)
            probes.append({"name": label, "exit_code": run.returncode})
            if run.returncode == 0:
                raise RuntimeError(f"failure probe unexpectedly succeeded: {label}")
        command(["docker", "exec", container, "psql", "-U", "blog_ci", "-d", "blog_ci_negative",
                 "-v", "ON_ERROR_STOP=1", "-c", "CREATE TABLE posts(id text PRIMARY KEY)"], stdout=subprocess.DEVNULL)
        run = subprocess.run([str(setup)], env=negative, capture_output=True, text=True)
        probes.append({"name": "invalid-schema-migration", "exit_code": run.returncode})
        if run.returncode == 0 or "migrate test database" not in run.stderr:
            raise RuntimeError("invalid-schema probe did not fail during migration")
        summary["failure_probes"] = probes

        for index, (package, names) in enumerate(sorted(required.items(), key=lambda item: (item[0] != "internal/migrations", item[0]))):
            test_env = database(f"blog_ci_{index}")
            prefix = package.replace("/", "-")
            # Migration test must see a genuinely fresh database. Other packages
            # receive real migrations (including their starter data), not SQL mocks.
            if package != "internal/migrations":
                preparation = subprocess.run([str(setup)], env=test_env, capture_output=True, text=True)
                (output / (prefix + "-setup.stderr")).write_text(preparation.stderr)
                if preparation.returncode:
                    result = validate_events([], package, names, preparation.returncode)
                    result["setup_failed"] = True
                    summary["packages"].append(result)
                    print(f"{package}: setup failed; required={len(names)} missing={len(names)}", flush=True)
                    print(preparation.stderr, end="", flush=True)
                    continue
            test = subprocess.run(["go", "test", "-json", "-count=1", "-race", "-timeout=5m",
                                   f"-coverprofile={output / (prefix + '.cover')}", "./" + package],
                                  cwd=BACKEND, env=test_env, capture_output=True, text=True)
            (output / (prefix + ".jsonl")).write_text(test.stdout)
            (output / (prefix + ".stderr")).write_text(test.stderr)
            events = [json.loads(line) for line in test.stdout.splitlines() if line.strip()]
            result = validate_events(events, package, names, test.returncode)
            summary["packages"].append(result)
            print(f"{package}: required={len(names)} pass={len(result['passed'])} "
                  f"fail={len(result['failed'])} skip={len(result['skipped'])} "
                  f"missing={len(result['missing'])} exit={test.returncode}", flush=True)
            if not result["ok"]:
                # Keep failure evidence without hiding it behind retry. Continue
                # independent packages so frozen Connector failures are distinguishable.
                print(test.stderr, end="")
                for event in events:
                    if event.get("Action") == "output":
                        print(event.get("Output", ""), end="")
        summary["ok"] = bool(summary["packages"]) and all(p["ok"] for p in summary["packages"])
        return summary["ok"]
    finally:
        cleanup = subprocess.run(["docker", "rm", "--force", "--volumes", container],
                                 capture_output=True, text=True)
        summary["cleanup_exit_code"] = cleanup.returncode
        if cleanup.returncode:
            summary["ok"] = False
        summary["elapsed_seconds"] = round(time.monotonic() - started, 2)
        (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
        if cleanup.returncode:
            raise RuntimeError(f"cleanup failed; inspect owned container {container}")
        print(f"Removed {container}; elapsed={summary['elapsed_seconds']}s", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="artifact directory (default: new temporary directory)")
    args = parser.parse_args()
    # Turn termination into normal unwinding so finally removes our container.
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    try:
        directory = args.output.resolve() if args.output else Path(tempfile.mkdtemp(prefix="gouno-db-ci-"))
        raise SystemExit(0 if run_gate(directory) else 1)
    except (RuntimeError, subprocess.CalledProcessError) as error:
        print(f"Integration gate failed: {error}", flush=True)
        raise SystemExit(1)
