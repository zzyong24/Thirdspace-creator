from pathlib import Path
import json,subprocess,time,sys,hashlib
root=Path(__file__).resolve().parent;repo=root.parents[3];label=sys.argv[1];command=sys.argv[2:];out=root/label;out.mkdir(exist_ok=False)
sources=['backend/src/modules/execution/chat-tool-stream-projection.service.ts','frontend/src/server/__module_integration__/mixed-codex-tool-stream.persistence-client.test.ts']
start=time.time();record={'command':command,'cwd':str(repo),'startedAt':start,'outerTimeoutSeconds':86400,'sources':[{'path':p,'sha256':hashlib.sha256((repo/p).read_bytes()).hexdigest()} for p in sources]}
(out/'execution.json').write_text(json.dumps(record,indent=2)+'\n')
with (out/'output.log').open('wb') as log:
    try:code=subprocess.run(command,cwd=repo,stdout=log,stderr=subprocess.STDOUT,timeout=86400).returncode
    except subprocess.TimeoutExpired:code=124
record.update(exitCode=code,elapsedSeconds=round(time.time()-start,3));(out/'execution-result.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record));sys.exit(code)
