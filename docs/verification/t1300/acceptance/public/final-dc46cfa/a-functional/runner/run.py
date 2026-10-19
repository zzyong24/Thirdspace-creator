import os,json,subprocess,time,sys,shutil,hashlib
from pathlib import Path
spec,name=sys.argv[1:3]
r=Path('docs/verification/t1300/acceptance/runs/final-dc46cfa/a-functional');out=r/'invocations'/name
assert not out.exists(),'INVOCATION_EXISTS_DO_NOT_OVERWRITE'
out.mkdir(parents=True,mode=0o700)
env=os.environ.copy();env.update(T1300_SESSION='/private/tmp/t1300-candidate-MhP4pW/session.json',T1300_ACCEPTANCE_TASK='T-1300',T1300_MODULE='a-functional',T1300_RUN_NAME='final-dc46cfa')
cmd=['node','node_modules/.pnpm/playwright@1.60.0/node_modules/playwright/cli.js','test','--config','docs/verification/t1300/acceptance/public/final-dc46cfa/driver/playwright.a-functional-runner.config.cjs',spec,'--workers=1','--retries=0']
runner=Path(__file__).parent
snapshots=out/'runner-inputs';snapshots.mkdir()
bindings={}
for original in runner.glob('*.cjs'):
 data=original.read_bytes();bindings[str(original)]=hashlib.sha256(data).hexdigest();(snapshots/original.name).write_bytes(data)
(out/'runner-bindings.json').write_text(json.dumps({'observedBeforeCommand':True,'sha256':bindings},indent=2)+'\n')
started=time.time();(out/'execution.json').write_text(json.dumps({'command':cmd,'outerSeconds':86400,'caseMs':28800000,'startedAt':started},indent=2)+'\n')
with (out/'runner.log').open('w') as log:
 try:code=subprocess.run(cmd,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=86400).returncode
 except subprocess.TimeoutExpired:code=124
for f in ['result.json','artifacts']:
 if (r/f).exists():shutil.move(str(r/f),str(out/f))
(out/'exit').write_text(str(code)+'\n');(out/'execution-result.json').write_text(json.dumps({'exit':code,'elapsedSeconds':time.time()-started},indent=2)+'\n')
secret=json.loads(Path(env['T1300_SESSION']).read_text())['handshake'].encode();hits=sum(secret in p.read_bytes() for p in r.rglob('*') if p.is_file());print(json.dumps({'exit':code,'elapsedSeconds':time.time()-started,'secretHits':hits}))
