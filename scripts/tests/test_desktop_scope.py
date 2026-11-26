"""Exercise the real Git diff and package metadata comparison in disposable repos."""
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts.ci.desktop_scope import desktop_impact


class DesktopScopeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.git("init", "-q")
        self.git("config", "user.email", "scope@example.invalid")
        self.git("config", "user.name", "Desktop scope tests")
        self.manifest("2.4.0")
        self.write("src-tauri/src/main.rs", "fn main() {}")
        self.write("src/apps/chamados/old.ts", "export {}")
        self.base = self.commit()

    def git(self, *args):
        return subprocess.check_output(["git", *args], cwd=self.root).decode().strip()

    def write(self, path, content):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    def manifest(self, version, dependency="1.0.0", nested="1.0.0"):
        self.write("package.json", json.dumps({
            "name": "labhub", "version": version, "dependencies": {"react": dependency},
        }))
        self.write("package-lock.json", json.dumps({
            "name": "labhub", "version": version, "lockfileVersion": 3,
            "packages": {
                "": {"name": "labhub", "version": version, "dependencies": {"react": dependency}},
                "node_modules/react": {"version": nested},
            },
        }))

    def commit(self):
        self.git("add", "-A")
        self.git("commit", "-qm", "test", "--allow-empty")
        return self.git("rev-parse", "HEAD")

    def check(self, required, reason=None):
        result, reasons = desktop_impact(self.root, self.base, self.commit())
        self.assertEqual(result, required, reasons)
        if reason:
            self.assertIn(reason, reasons)

    def test_only_web_version_and_changelog(self):
        self.manifest("2.5.0")
        self.write("CHANGELOG.md", "release")
        self.write("src/pages/Changelog.tsx", "export {}")
        self.check(False)

    def test_web_modules_and_docs(self):
        for path in ("src/apps/chamados/queue.ts", "src/apps/chamados-publico/new.tsx",
                     "src/apps/reservalab/page.tsx", "docs/guide.md"):
            self.write(path, "new")
        self.check(False)

    def test_shared_dependency_change(self):
        self.manifest("2.5.0", dependency="2.0.0")
        self.check(True, "package.json")

    def test_transitive_lockfile_change(self):
        self.manifest("2.4.0", nested="2.0.0")
        self.check(True, "package-lock.json")

    def test_rust_change_with_web_release(self):
        self.manifest("2.5.0")
        self.write("src-tauri/src/main.rs", "fn main() { println!(\"changed\"); }")
        self.check(True, "src-tauri/src/main.rs")

    def test_shared_source(self):
        self.write("src/lib/ToastContext.tsx", "changed")
        self.check(True, "src/lib/ToastContext.tsx")

    def test_desktop_config_and_workflow(self):
        self.write("vite.desktop.config.ts", "changed")
        self.write(".github/workflows/ci-desktop.yml", "changed")
        self.check(True, ".github/workflows/ci-desktop.yml")

    def test_rename_out_of_desktop(self):
        self.git("mv", "src-tauri/src/main.rs", "src/apps/chamados/main.rs")
        self.check(True, "src-tauri/src/main.rs")

    def test_unknown_path(self):
        self.write("new-build.config.js", "changed")
        self.check(True, "new-build.config.js")

    def test_corrupt_package_json(self):
        self.write("package.json", "{invalid")
        self.check(True, "package.json")

    def test_deleted_manifest(self):
        (self.root / "package-lock.json").unlink()
        self.check(True, "package-lock.json")

    def test_empty_diff(self):
        self.check(False)

    def test_bad_sha_fails(self):
        with self.assertRaises(ValueError):
            desktop_impact(self.root, "bad", self.base)


if __name__ == "__main__":
    unittest.main()
