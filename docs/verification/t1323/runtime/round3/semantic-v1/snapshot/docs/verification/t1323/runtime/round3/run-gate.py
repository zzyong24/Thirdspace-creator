from pathlib import Path
import os,sys,json,hashlib,subprocess,time
rt=Path(__file__).resolve().parent; repo=rt.parents[4]; label=sys.argv[1];command=sys.argv[2:]
run=rt/label;run.mkdir(exist_ok=False);snapshot=run/'snapshot';snapshot.mkdir()
lock=json.loads((repo/'docs/verification/t1323/INPUT_LOCK_ROUND3.json').read_text())
paths=[x['path'] for x in lock['inputs']]+['backend/src/modules/execution/execution-checkpoint.service.ts','backend/src/modules/execution/model-worker-dispatcher.ts','frontend/src/server/__module_integration__/codex-mixed-checkpoint.persistence-client.test.ts']+[str(p.relative_to(repo)) for p in rt.iterdir() if p.is_file()]
manifest=[]
for name in dict.fromkeys(paths):
 p=repo/name;b=p.read_bytes();dest=snapshot/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(b);manifest.append({'path':name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
(run/'BEFORE_INPUTS.json').write_text(json.dumps(manifest,indent=2)+'\n')
started=time.time(); budget=172800 if 'vitest' in command else 86400
record={'command':command,'cwd':str(repo),'startedAt':started,'outerTimeoutSeconds':budget,'testTimeoutMs':3600000,'hookTimeoutMs':180000,'singleWorker':True,'retry':0,'sourceManifest':'BEFORE_INPUTS.json'}
(run/'execution.json').write_text(json.dumps(record,indent=2)+'\n')
with (run/'output.log').open('wb') as out:
 try:code=subprocess.run(command,cwd=repo,stdout=out,stderr=subprocess.STDOUT,timeout=budget).returncode
 except subprocess.TimeoutExpired:code=124
record.update(exitCode=code,elapsedSeconds=round(time.time()-started,3));(run/'execution-result.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record));sys.exit(code)
