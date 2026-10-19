from pathlib import Path
import sys,os,json,hashlib,subprocess,time,shutil,signal
runtime=Path(__file__).resolve().parent;repo=runtime.parents[3];label=sys.argv[1]
run=runtime/label;run.mkdir(exist_ok=False);snapshot=run/'snapshot';snapshot.mkdir()
lock=json.loads((repo/'docs/verification/t1322/INPUT_LOCK.json').read_text())
paths=[f['path'] for f in lock['inputs']]+['docs/verification/t1322/control/IMPLEMENTATION_PACKET.md','docs/verification/t1322/control/IMPLEMENTATION_HANDOFF.json','docs/verification/t1322/INPUT_LOCK.json']+json.loads((runtime/'EXTRA_SNAPSHOT_INPUTS.json').read_text())+['frontend/src/server/__module_integration__/cover-card-codex-identity.persistence-client.test.ts']+[str(p.relative_to(repo)) for p in runtime.iterdir() if p.is_file()]
manifest=[]
for relative in dict.fromkeys(paths):
    source=repo/relative;data=source.read_bytes();dest=snapshot/relative;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data);manifest.append({'path':relative,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
binding=json.loads((runtime/'WORKER_BINDING.json').read_text());data=Path(binding['executionWorkerPath']).read_bytes();(snapshot/'immutable-execution-worker.cjs').write_bytes(data);manifest.append({'path':binding['executionWorkerPath'],'snapshot':'immutable-execution-worker.cjs','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
(run/'BEFORE_INPUTS.json').write_text(json.dumps(manifest,indent=2)+'\n')
env=os.environ.copy();env['T1322_RUN_ID']=label
command=['pnpm','--dir','frontend','exec','vitest','run','--config',str(runtime/'vitest.config.ts')]
start=time.time();record={'command':command,'cwd':str(repo),'startedAt':start,'outerTimeoutSeconds':86400,'testTimeoutMs':3600000,'hookTimeoutMs':180000,'retry':0,'singleWorker':True,'caseSelection':env.get('T1322_CASES','cover,card')}
(run/'execution.json').write_text(json.dumps(record,indent=2)+'\n')
with (run/'output.log').open('wb') as log:
    process=subprocess.Popen(command,cwd=repo,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
    record.update(pid=process.pid,pgid=process.pid)
    (run/'execution.json').write_text(json.dumps(record,indent=2)+'\n')
    try: code=process.wait(timeout=86400)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid,signal.SIGTERM)
        code=process.wait(timeout=30)
        record['outerTimeoutOccurred']=True
record.update(exitCode=code,elapsedSeconds=round(time.time()-start,3));(run/'execution-result.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record));sys.exit(code)
