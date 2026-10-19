from pathlib import Path
import sys,os,json,hashlib,subprocess,time
r=Path(__file__).resolve().parent;repo=r.parents[3];label=sys.argv[1];out=r/label;out.mkdir(exist_ok=False);snap=out/'snapshot';snap.mkdir()
lock=json.loads((repo/'docs/verification/t1324/INPUT_LOCK.json').read_text())
extra=['frontend/src/server/__module_integration__/group-execution-preview.persistence-client.test.ts','frontend/src/app/api/v1/blob/[...key]/route.ts','frontend/src/server/blob-upload.ts','contract/src/operations/assets.ts','contract/src/resources/video-render.ts','backend/src/modules/child-env.ts','backend/src/modules/identity/identity.service.ts']
paths=[x['path']for x in lock['inputs']]+[p for p in extra if(repo/p).exists()]+[str(p.relative_to(repo))for p in r.iterdir()if p.is_file()]
rows=[]
for relative in dict.fromkeys(paths):
 p=repo/relative;b=p.read_bytes();dest=snap/relative;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(b);rows.append({'path':relative,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
(out/'BEFORE_INPUTS.json').write_text(json.dumps(rows,indent=2)+'\n')
env=os.environ.copy();env['T1324_RUN_ID']=label
command=['pnpm','--dir','frontend','exec','vitest','run','--config',str(r/'vitest.config.ts')];started=time.time();record={'command':command,'cwd':str(repo),'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(),'startedAt':started,'outerTimeoutSeconds':86400,'testTimeoutMs':3600000,'hookTimeoutMs':180000,'retry':0,'singleWorker':True,'caseSelection':env.get('T1324_CASES','pure,legacy')};(out/'execution.json').write_text(json.dumps(record,indent=2)+'\n')
with(out/'output.log').open('wb')as log:
 try:code=subprocess.run(command,cwd=repo,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=86400).returncode
 except subprocess.TimeoutExpired:code=124
record.update(exitCode=code,elapsedSeconds=round(time.time()-started,3));(out/'execution-result.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record));sys.exit(code)
