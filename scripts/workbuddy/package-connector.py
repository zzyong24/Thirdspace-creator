#!/usr/bin/env python3
"""CreatorOS 连接工件生成；改编自固定 Univer 包装模板，Apache-2.0。

来源/修改记录见 SOURCE.md，许可见 LICENSE.univer-office。仅生成输出工件，
不安装、不联网、不执行 Agent、不访问或写入用户配置。
"""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import argparse
import hashlib
import json
import re

SOURCE_COMMIT = "856eae4fe416b28adffb96092d67ff26c7797ff4"
HERE = Path(__file__).resolve().parent


def package_connector(output_dir: Path, *, version: str) -> dict:
    if re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?", version) is None:
        raise ValueError("version 必须是正式版本号，不得含路径或控制字符")
    entries = {}

    # Adapted upstream document/entries serialization; this is packaging, not business routing.
    def document(name, value):
        entries[name] = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()

    document("mcp.template.json", json.loads((HERE / "mcp.template.json").read_text()))
    for name in ["README.md", "SOURCE.md", "LICENSE.univer-office"]:
        path = HERE / name
        if path.is_symlink():
            raise ValueError("工件来源不能是符号链接")
        entries[name] = path.read_bytes()
    for path in sorted((HERE / "skills" / "creatoros").rglob("*")):
        if path.is_symlink():
            raise ValueError("Skill 不能是符号链接")
        if path.is_file():
            if path.suffix != ".md":
                raise ValueError("Skill 只包含 Markdown")
            entries[path.relative_to(HERE).as_posix()] = path.read_bytes()
    if sum(name.endswith("/SKILL.md") for name in entries) != 1:
        raise ValueError("连接包必须只包含一个 Skill")
    # SEMANTIC_BOUNDARY_ALLOW: 文件名/秘密格式校验只守发行边界，不选择创作内容。
    for name, data in entries.items():
        if name.startswith("/") or ".." in Path(name).parts:
            raise ValueError("工件包名必须是安全相对路径")
        if re.search(rb"/Users/|[A-Za-z]:\\Users\\|Bearer\s+\S+|\"(?:handshakeToken|cliAccessToken|launchNonce)\"\s*:", data):
            raise ValueError(f"工件不得包含个人路径或访问凭据: {name}")

    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    directory = destination / "creatoros-workbuddy-connector"
    for name, data in entries.items():
        path = directory / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    archive = destination / f"creatoros-workbuddy-connector-{version}.zip"
    with ZipFile(archive, "w", ZIP_DEFLATED) as zipped:
        for name, data in sorted(entries.items()):
            info = ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            zipped.writestr(info, data)
    with ZipFile(archive) as zipped:
        if zipped.testzip() is not None or sorted(zipped.namelist()) != sorted(entries):
            raise ValueError("连接包 ZIP 校验失败")
        if any(zipped.read(name) != data for name, data in entries.items()):
            raise ValueError("连接包内容校验失败")
    report = {
        "schemaVersion": 1, "version": version, "sourceCommit": SOURCE_COMMIT,
        "archive": archive.name, "archiveSha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
        "bytes": archive.stat().st_size,
        "files": [{"path": name, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
                  for name, data in sorted(entries.items())],
        "validation": "工件完整性已检查；WorkBuddy 安装信任和真实工具调用需独立验证",
    }
    manifest = destination / "connector-package-audit.json"
    manifest.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return {**report, "archive": str(archive), "manifest": str(manifest)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--version")
    args = parser.parse_args()
    version = args.version
    if version is None:
        version = json.loads((HERE.parents[1] / "mcp-server" / "package.json").read_text())["version"]
    print(json.dumps(package_connector(args.output_dir, version=version), ensure_ascii=False))


if __name__ == "__main__":
    main()
