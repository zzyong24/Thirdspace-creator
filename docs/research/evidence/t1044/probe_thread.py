import json
import os
import pathlib
import subprocess
import sys

binary = pathlib.Path(sys.argv[1])
root = pathlib.Path(__file__).resolve().parent
home = root / ("home-thread-" + sys.argv[2])
workspace = root / ("workspace-" + sys.argv[2])
home.mkdir(exist_ok=True)
workspace.mkdir(exist_ok=True)
(home / "config.toml").write_text('[mcp_servers.probe]\nurl = "http://127.0.0.1:9/mcp"\n', encoding="utf-8")
env = {**os.environ, "CODEX_HOME": str(home)}
p = subprocess.Popen([str(binary), "app-server", "--stdio", "-c", "features.shell_tool=false",
                      "-c", "features.unified_exec=false", "-c", "features.apps=false",
                      "-c", "features.plugins=false", "-c", "features.hooks=false",
                      "-c", "mcp_servers.probe.enabled=false"],
                     stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                     text=True, env=env, cwd=workspace)

def request(id, method, params):
    p.stdin.write(json.dumps({"id": id, "method": method, "params": params}, separators=(",", ":")) + "\n")
    p.stdin.flush()
    while True:
        line = p.stdout.readline()
        if not line:
            raise RuntimeError("app-server closed")
        item = json.loads(line)
        if item.get("id") == id:
            return item

try:
    init = request(1, "initialize", {"clientInfo": {"name": "creatoros_static_probe",
                      "title": "Static Probe", "version": "0"},
                      "capabilities": {"experimentalApi": True}})
    print("initialize:", "ok" if "result" in init else init.get("error", {}).get("message"))
    p.stdin.write('{"method":"initialized","params":{}}\n')
    p.stdin.flush()
    account = request(2, "account/read", {"refreshToken": False})
    print("account/read:", "ok" if "result" in account else account.get("error", {}).get("message"),
          "accountPresent:", bool(account.get("result", {}).get("account")))
    thread = request(3, "thread/start", {"cwd": str(workspace), "ephemeral": True,
                     "approvalPolicy": "never", "sandbox": "read-only", "environments": [],
                     "dynamicTools": [{"type": "function", "name": "creatoros_probe",
                                       "description": "No action; schema probe only",
                                       "inputSchema": {"type": "object", "properties": {}}}]})
    print("thread/start:", "ok" if "result" in thread else thread.get("error", {}).get("message"))
    if "result" in thread:
        print("thread_id_present:", bool(thread["result"].get("thread", {}).get("id")))
        metadata = thread["result"]
        print("thread_effective:", {name: metadata.get(name) for name in ("cwd", "approvalPolicy", "sandbox", "activePermissionProfile") if name in metadata})
        tid = thread["result"]["thread"]["id"]
        status = request(4, "mcpServerStatus/list", {"threadId": tid, "detail": "toolsAndAuthOnly"})
        if "result" in status:
            print("mcp_runtime_status:", {x.get("name"): x.get("runtimeStatus") for x in status["result"].get("data", [])})
        else:
            print("mcp_status_error:", status.get("error", {}).get("message"))
finally:
    p.kill()
    p.wait()
