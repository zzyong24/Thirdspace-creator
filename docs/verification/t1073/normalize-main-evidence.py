"""保存主会话原日志字节，再规整可读日志的行尾/文件尾空白；不修改分区证据。"""
from pathlib import Path
import gzip
import hashlib
import json

base = Path(__file__).resolve().parent
archive = base / "raw-main-logs"
archive.mkdir(exist_ok=True)
index_file = archive / "SHA256.json"
records = json.loads(index_file.read_text()) if index_file.exists() else []
digest = lambda data: hashlib.sha256(data).hexdigest()
for log in sorted([*base.glob("*.log"), *base.joinpath("stream").glob("*.log"), *base.joinpath("browser").glob("*.txt")]):
    raw = log.read_bytes()
    relative = log.relative_to(base).as_posix()
    previous = [record for record in records if record["readable"] == relative]
    if previous and digest(raw) == previous[-1]["readable_sha256"]:
        continue
    sha = digest(raw)
    target = archive / f"{relative.replace('/', '--')}.{sha[:12]}.gz"
    target.write_bytes(gzip.compress(raw, mtime=0))
    assert gzip.decompress(target.read_bytes()) == raw
    readable = b"\n".join(line.rstrip(b" \t\r") for line in raw.splitlines()).rstrip(b"\n")
    if readable:
        readable += b"\n"
    log.write_bytes(readable)
    records.append({"readable": relative, "raw_archive": target.relative_to(base).as_posix(),
                    "raw_bytes": len(raw), "raw_sha256": sha,
                    "archive_sha256": digest(target.read_bytes()), "readable_sha256": digest(readable)})
index_file.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n")
print(f"主会话原日志归档 {len(records)} 份；可读副本仅规整空白。")
