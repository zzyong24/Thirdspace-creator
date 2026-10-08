"""仅测试真实 sidecar 模块和自建进程组，不启动桌面或访问用户数据。"""
import pathlib
import shutil
import subprocess
import tempfile

repository = pathlib.Path(__file__).resolve().parents[3]
source = repository / "frontend/src-tauri/src/sidecar_process.rs"
cargo = shutil.which("cargo") or str(pathlib.Path.home() / ".cargo/bin/cargo")
with tempfile.TemporaryDirectory(prefix="t1071-native-") as directory:
    fixture = pathlib.Path(directory)
    (fixture / "src").mkdir()
    (fixture / "Cargo.toml").write_text(
        '[package]\nname="t1071-native-audit"\nversion="0.0.0"\n'
        'edition="2021"\n[dependencies]\nlibc="0.2"\n'
    )
    (fixture / "src/lib.rs").write_text(
        f'#[path = "{source}"]\nmod sidecar_process;\n'
    )
    result = subprocess.run(
        [cargo, "test", "--offline", "--manifest-path", str(fixture / "Cargo.toml")],
        cwd=repository,
        check=False,
    )
    raise SystemExit(result.returncode)
