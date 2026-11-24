"""Exercise the actual deployment functions with inert host-command substitutes."""

import os
from pathlib import Path
import re
import shutil
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = (ROOT / "deploy" / "omeumes-deploy.sh").read_text(encoding="utf-8")
BASH = str(Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Git/bin/bash.exe") if os.name == "nt" else shutil.which("bash")


def function(name):
    return re.search(r"^" + name + r"\(\) \{\n.*?^\}", SCRIPT, re.MULTILINE | re.DOTALL).group(0)


def run_shell(body):
    return subprocess.run([BASH, "--noprofile", "--norc", "-c", body], capture_output=True, text=True, check=False)


class DeploymentRouteTests(unittest.TestCase):
    def route(self, validation=0, installation=0, reload=0):
        return run_shell(f"""
set -euo pipefail
install() {{ echo install; return {installation}; }}
caddy() {{ echo validate; return {validation}; }}
systemctl() {{ echo reload; return {reload}; }}
{function('route')}
# Conditional invocation reproduces Bash disabling implicit errexit in rollback.
if route app; then exit 0; else exit 23; fi
""")

    def test_invalid_caddy_configuration_is_never_reloaded(self):
        result = self.route(validation=1)
        self.assertEqual(result.returncode, 23, result.stderr)
        self.assertEqual(result.stdout.splitlines(), ["install", "validate"])

    def test_failed_install_is_not_validated_or_reloaded(self):
        result = self.route(installation=1)
        self.assertEqual(result.returncode, 23, result.stderr)
        self.assertEqual(result.stdout.splitlines(), ["install"])

    def test_valid_configuration_is_reloaded(self):
        result = self.route()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.splitlines(), ["install", "validate", "reload"])

    def test_failed_reload_is_propagated(self):
        self.assertEqual(self.route(reload=1).returncode, 23)

    def rollback(self, fail_app_route, fail_maintenance="no"):
        return run_shell(f"""
set -euo pipefail
switched=1
old_schema=9
previous=synthetic
compose() {{ if [[ "$*" == *'node --input-type=module'* ]]; then echo 9; fi; }}
write_release() {{ :; }}
ready() {{ return 0; }}
install() {{ selected_route=$7; echo "selected $selected_route"; }}
caddy() {{ if [[ "$selected_route" == *route-app.caddy && {fail_app_route} == yes ]] || [[ "$selected_route" == *route-maintenance.caddy && {fail_maintenance} == yes ]]; then return 1; fi; }}
systemctl() {{ echo reload; }}
{function('route')}
{function('rollback')}
rollback
""")

    def test_rollback_route_failure_restores_maintenance_and_does_not_claim_success(self):
        result = self.rollback("yes")
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn("route-maintenance.caddy", result.stdout)
        self.assertEqual(result.stdout.splitlines().count("reload"), 1)
        self.assertIn("Kept maintenance", result.stderr)
        self.assertNotIn("Previous image resumed", result.stderr)

    def test_rollback_success_requires_valid_route_and_reload(self):
        result = self.rollback("no")
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn("Previous image resumed", result.stderr)
        self.assertNotIn("Kept maintenance", result.stderr)

    def test_rollback_reports_when_maintenance_cannot_be_activated(self):
        result = self.rollback("yes", "yes")
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn("Could not activate maintenance", result.stderr)
        self.assertNotIn("Kept maintenance", result.stderr)
        self.assertNotIn("Previous image resumed", result.stderr)
        self.assertNotIn("reload", result.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
