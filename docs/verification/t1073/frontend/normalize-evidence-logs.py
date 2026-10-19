"""先保留日志原字节，再仅规范可读日志的行尾空白与末尾空行。"""
import gzip
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
archive = root / "raw-logs"
archive.mkdir(exist_ok=True)

def normalize(raw: bytes) -> bytes:
    lines = [line.rstrip(b" \t") for line in raw.split(b"\n")]
    while lines and not lines[-1]:
        lines.pop()
    return b"\n".join(lines) + b"\n" if lines else b""

records = []
for path in sorted(root.glob("*.log")):
    compressed_path = archive / f"{path.name}.raw.gz"
    current = path.read_bytes()
    if compressed_path.exists():
        raw = gzip.decompress(compressed_path.read_bytes())
        if current not in (raw, normalize(raw)):
            raise ValueError(f"拒绝覆盖已有原始证据：{path.name}")
    else:
        raw = current
        compressed_path.write_bytes(gzip.compress(raw, mtime=0))
    readable = normalize(raw)
    path.write_bytes(readable)
    records.append({
        "readable_log": path.name,
        "raw_gzip": str(compressed_path.relative_to(root)),
        "raw_bytes": len(raw),
        "raw_sha256": hashlib.sha256(raw).hexdigest(),
        "gzip_sha256": hashlib.sha256(compressed_path.read_bytes()).hexdigest(),
        "readable_sha256": hashlib.sha256(readable).hexdigest(),
    })
index = {"rule": "仅移除每行末尾ASCII空格/Tab及文件末尾空行；内容、ANSI控制码、红绿结果保持不变；非空文件保留一个终止换行", "logs": records}
(archive / "SHA256.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"archived_logs": len(records), "verified_raw_sha256": all(hashlib.sha256(gzip.decompress((root / r["raw_gzip"]).read_bytes())).hexdigest() == r["raw_sha256"] for r in records)}))
