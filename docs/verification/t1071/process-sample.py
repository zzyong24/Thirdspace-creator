"""只读两分钟采样；不打印参数值、环境变量或未知 WebKit 归属。"""
import datetime
import json
import pathlib
import shlex
import subprocess
import time

destination = pathlib.Path(__file__).resolve().with_name("process-samples-current.json")
samples = []
for index in range(5):
    processes = []
    rows = subprocess.check_output(
        ["ps", "-axo", "pid,ppid,rss,%cpu,etime,comm"], text=True
    ).splitlines()[1:]
    for row in rows:
        fields = row.strip().split(None, 5)
        if len(fields) != 6:
            continue
        pid, parent_id, resident, cpu, elapsed, executable = fields
        if "creatoros" not in executable.lower():
            continue
        try:
            parent = subprocess.check_output(
                ["ps", "-p", parent_id, "-o", "comm="], text=True
            ).strip()
            arguments = shlex.split(subprocess.check_output(
                ["ps", "-p", pid, "-o", "args="], text=True
            ))
        except (subprocess.CalledProcessError, ValueError):
            continue
        role = "MCP bridge" if "mcp" in arguments else "unclassified"
        processes.append({
            "pid": int(pid), "ppid": int(parent_id), "rssKiB": int(resident),
            "cpuPercent": float(cpu), "elapsed": elapsed,
            "executable": executable, "parentExecutable": parent, "role": role,
        })
    total = sum(process["rssKiB"] for process in processes)
    samples.append({
        "atUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "processes": processes, "totalRssKiB": total,
    })
    destination.write_text(json.dumps(samples, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"sample": index, "count": len(processes),
                      "totalRssMiB": round(total / 1024, 2)}), flush=True)
    if index < 4:
        time.sleep(30)
