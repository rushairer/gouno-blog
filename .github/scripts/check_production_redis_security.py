#!/usr/bin/env python3
"""Production Redis privilege contract, checked on resolved Compose configuration."""
import json
import subprocess
import sys
from pathlib import Path


def check(config):
    services = config["services"]
    redis = services["redis"]
    init = services["redis-data-init"]
    assert redis["image"] == init["image"], "init must use identical pinned Redis image"
    assert redis.get("user") == "redis", "long-running Redis must be unprivileged"
    assert redis.get("read_only") is True, "Redis must inherit hardened read-only rootfs"
    assert redis.get("privileged", False) is False
    assert redis.get("cap_drop") == ["ALL"], "Redis must drop all Linux capabilities"
    assert not redis.get("cap_add"), "Redis must not add capabilities"
    assert redis.get("security_opt") == ["no-new-privileges:true"]
    assert redis.get("depends_on", {}).get("redis-data-init", {}).get("condition") == "service_completed_successfully"
    assert redis.get("restart") == "unless-stopped"
    assert init.get("user") == "0:0", "only the short-lived owner migration may run as root"
    assert init.get("restart") == "no", "init container must not restart indefinitely"
    assert init.get("read_only") is True
    assert init.get("cap_drop") == ["ALL"]
    assert init.get("cap_add") == ["CHOWN"], "owner migration needs CHOWN only"
    assert init.get("security_opt") == ["no-new-privileges:true"]
    assert not init.get("ports") and not init.get("networks"), "init container must not expose ports or attach to networks"
    assert redis.get("volumes") == init.get("volumes"), "owner migration must address exactly the Redis persistent volume"
    assert any(m.get("target") == "/data" for m in redis["volumes"])
    assert any(s.get("target") == "/run/secrets/redis_password" for s in redis.get("secrets", []))
    assert any(s.get("target") == "/run/secrets/blog_redis_password" for s in redis.get("secrets", []))


def main():
    root = Path(__file__).resolve().parents[2]
    command = [
        "docker", "compose", "--env-file", str(root / ".env.production.example"),
        "-f", str(root / "docker-compose.production.yml"), "config", "--format", "json",
    ]
    output = subprocess.check_output(command, cwd=root, text=True)
    check(json.loads(output))
    print("Production Redis: non-root daemon, isolated CHOWN-only init and ordered startup verified")


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, KeyError, subprocess.CalledProcessError) as error:
        sys.exit(f"Production Redis privilege contract failed: {error}")
