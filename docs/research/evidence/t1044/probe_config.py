import json
import os
import pathlib
import subprocess
import sys

binary = pathlib.Path(sys.argv[1])
root = pathlib.Path(__file__).resolve().parent
home = root / "home-config-probe"
home.mkdir(exist_ok=True)
(home / "config.toml").write_text(
    '[mcp_servers.probe]\nurl = "http://127.0.0.1:9/mcp"\n'
    '[features]\nplugins = true\n', encoding="utf-8"
)
env = {**os.environ, "CODEX_HOME": str(home)}
args = [str(binary), "app-server", "--stdio", *sys.argv[2:]]
p = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                     stderr=subprocess.DEVNULL, text=True, env=env, cwd=root)

def call(value):
    p.stdin.write(json.dumps(value, separators=(",", ":")) + "\n")
    p.stdin.flush()
    while True:
        line = p.stdout.readline()
        if not line:
            raise RuntimeError("app-server closed")
        item = json.loads(line)
        if item.get("id") == value.get("id"):
            return item

try:
    init = call({"id": 1, "method": "initialize", "params": {
        "clientInfo": {"name": "creatoros_static_probe", "title": "Static Probe", "version": "0"},
        "capabilities": {"experimentalApi": True}}})
    if "error" in init:
        print("initialize_error", init["error"].get("message"))
        sys.exit(1)
    p.stdin.write('{"method":"initialized","params":{}}\n')
    p.stdin.flush()
    result = call({"id": 2, "method": "config/read", "params": {"includeLayers": False, "cwd": str(root)}})
    if "error" in result:
        print("config_read_error", result["error"].get("message"))
        sys.exit(1)
    config = result.get("result", {}).get("config") or {}
    print(json.dumps({"mcpServers": {name: value.get("enabled", True) for name, value in sorted((config.get("mcp_servers") or {}).items())},
                      "pluginsFeature": (config.get("features") or {}).get("plugins"),
                      "webSearch": config.get("web_search")},
                     separators=(",", ":")))
    status = call({"id": 3, "method": "mcpServerStatus/list", "params": {"cursor": None, "limit": 100}})
    if "error" in status:
        print("mcp_status_error", status["error"].get("message"))
    else:
        data = status.get("result", {}).get("data") or []
        print(json.dumps({"mcpStatus": {v.get("name"): v.get("runtimeStatus") for v in data if isinstance(v.get("name"), str)}}, separators=(",", ":")))
finally:
    p.kill()
    p.wait()
