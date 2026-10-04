"""T-1060 公共连接工件边界；只调用本项目构建时包装函数。"""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile


class WorkBuddyConnectorPackageTest(unittest.TestCase):
    def setUp(self):
        source = Path(__file__).with_name("package-connector.py")
        spec = importlib.util.spec_from_file_location("creatoros_workbuddy_package", source)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)

    def test_public_package_has_no_personal_path_or_secrets_and_uses_existing_cli(self):
        with tempfile.TemporaryDirectory() as directory:
            result = self.module.package_connector(Path(directory), version="0.1.0")
            with ZipFile(result["archive"]) as archive:
                names = set(archive.namelist())
                self.assertEqual(names, {
                    "mcp.template.json", "README.md", "SOURCE.md", "LICENSE.univer-office",
                    "skills/creatoros/SKILL.md",
                })
                config = json.loads(archive.read("mcp.template.json"))
                launch = config["mcpServers"]["creatoros"]
                self.assertEqual(launch["type"], "stdio")
                self.assertEqual(launch["command"], "__CREATOROS_NODE_EXECUTABLE__")
                self.assertEqual(launch["args"], ["__CREATOROS_CLI_BUNDLE__", "mcp", "serve", "--connection-file", "__CREATOROS_CONNECTION_FILE__"])
                self.assertEqual(launch["env"], {"CREATOROS_BASE_URL": ""})
                for name in names:
                    text = archive.read(name).decode("utf-8")
                    self.assertNotIn("/Users/", text)
                    self.assertNotIn("C:\\Users\\", text)
                    self.assertNotIn("Bearer ", text)
                    self.assertNotIn("get_active_project", text)
                skill = archive.read("skills/creatoros/SKILL.md").decode()
                for tool in ["accounts_list", "projects_list", "projects_get", "projects_outputs_list", "artifacts_list", "artifacts_versions_list"]:
                    self.assertIn(tool, skill)
            manifest = json.loads(Path(result["manifest"]).read_text())
            self.assertEqual(manifest["archiveSha256"], hashlib.sha256(Path(result["archive"]).read_bytes()).hexdigest())
            self.assertEqual(manifest["sourceCommit"], "856eae4fe416b28adffb96092d67ff26c7797ff4")

    def test_repeated_builds_are_identical_and_do_not_write_host_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = self.module.package_connector(root / "first", version="0.1.0")
            second = self.module.package_connector(root / "second", version="0.1.0")
            self.assertEqual(Path(first["archive"]).read_bytes(), Path(second["archive"]).read_bytes())
            self.assertFalse((root / ".workbuddy").exists())

    def test_bad_version_is_rejected_before_creating_output(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "output"
            for version in ["../escape", "secret\nvalue", "", "v1.0.0"]:
                with self.assertRaises(ValueError):
                    self.module.package_connector(destination, version=version)
            self.assertFalse(destination.exists())


if __name__ == "__main__":
    unittest.main()
