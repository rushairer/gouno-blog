"""Exercise keyless image identity verification without contacting a registry."""
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("verify_image_signature.sh")
DIGEST = "sha256:" + ("a" * 64)


class VerifyImageSignatureTests(unittest.TestCase):
    def run_script(self, values=None, *, verifier_exit=0):
        with tempfile.TemporaryDirectory() as directory:
            workdir = Path(directory)
            fake_cosign = workdir / "cosign"
            fake_cosign.write_text(
                "#!/usr/bin/env python3\n"
                "import json, os, sys\n"
                "with open(os.environ['COSIGN_ARGS_LOG'], 'w') as out:\n"
                "  json.dump(sys.argv[1:], out)\n"
                "sys.exit(int(os.environ.get('COSIGN_TEST_EXIT', '0')))\n",
                encoding="utf-8",
            )
            fake_cosign.chmod(0o755)
            log_path = workdir / "args.json"
            env = dict(os.environ)
            env.update({
                "PATH": str(workdir) + os.pathsep + env.get("PATH", ""),
                "COSIGN_ARGS_LOG": str(log_path),
                "COSIGN_TEST_EXIT": str(verifier_exit),
                "GITHUB_REPOSITORY": "rushairer/gouno-blog",
                "GITHUB_REF": "refs/heads/main",
                "GITHUB_WORKFLOW_REF": "rushairer/gouno-blog/.github/workflows/publish-images.yml@refs/heads/main",
                "IMAGE_KIND": "frontend",
                "IMAGE": "ghcr.io/rushairer/gouno-blog-frontend",
                "DIGEST": DIGEST,
            })
            for key, value in (values or {}).items():
                if value is None:
                    env.pop(key, None)
                else:
                    env[key] = value
            proc = subprocess.run(
                ["bash", str(SCRIPT)],
                env=env,
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
            arguments = json.loads(log_path.read_text()) if log_path.exists() else None
            return proc, arguments

    def test_main_image_exact_identity(self):
        result, arguments = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(arguments, [
            "verify",
            "--certificate-identity",
            "https://github.com/rushairer/gouno-blog/.github/workflows/publish-images.yml@refs/heads/main",
            "--certificate-oidc-issuer",
            "https://token.actions.githubusercontent.com",
            "ghcr.io/rushairer/gouno-blog-frontend@" + DIGEST,
        ])

    def test_approved_master_and_release_tags(self):
        for ref in ("refs/heads/master", "refs/tags/v1.2.3", "refs/tags/v1.2.3-rc.2"):
            with self.subTest(ref=ref):
                result, args = self.run_script({
                    "GITHUB_REF": ref,
                    "GITHUB_WORKFLOW_REF": "rushairer/gouno-blog/.github/workflows/publish-images.yml@" + ref,
                })
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("@" + ref, args[2])

    def test_all_approved_image_targets(self):
        for kind in ("backend", "frontend", "seed"):
            with self.subTest(kind=kind):
                result, args = self.run_script({
                    "IMAGE_KIND": kind,
                    "IMAGE": "ghcr.io/rushairer/gouno-blog-" + kind,
                })
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(args[-1], f"ghcr.io/rushairer/gouno-blog-{kind}@{DIGEST}")

    def test_rejects_untrusted_context_without_calling_cosign(self):
        for values in (
            {"GITHUB_REPOSITORY": "attacker/gouno-blog"},
            {"GITHUB_REPOSITORY": ""},
            {"GITHUB_REF": "refs/heads/develop"},
            {"GITHUB_REF": "refs/tags/vfoo"},
            {"GITHUB_REF": "refs/tags/v1.2.3;true"},
            {"GITHUB_WORKFLOW_REF": "rushairer/gouno-blog/.github/workflows/other.yml@refs/heads/main"},
            {"GITHUB_WORKFLOW_REF": None},
            {"IMAGE_KIND": "unlisted"},
            {"IMAGE": "ghcr.io/attacker/gouno-blog-frontend"},
            {"IMAGE": "ghcr.io/rushairer/gouno-blog-frontend:main"},
            {"DIGEST": "sha256:abc"},
            {"DIGEST": "sha256:" + "A" * 64},
            {"DIGEST": ""},
        ):
            with self.subTest(values=values):
                result, args = self.run_script(values)
                self.assertNotEqual(result.returncode, 0)
                self.assertIsNone(args, "invalid context must not dispatch cosign")

    def test_rejects_a_crypto_verification_failure(self):
        result, arguments = self.run_script(verifier_exit=13)
        self.assertEqual(result.returncode, 13)
        self.assertIsNotNone(arguments)


if __name__ == "__main__":
    unittest.main()
