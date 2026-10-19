import json,os,subprocess,time
from pathlib import Path
root=Path('docs/verification/t1305/acceptance/runs/final-t1304-t1305/a')
env=os.environ.copy();env.update(T1300_SESSION='/private/tmp/t1300-candidate-IDnfdQ/session.json',T1300_ACCEPTANCE_TASK='T-1305',T1300_MODULE='a',T1300_RUN_NAME='final-t1304-t1305',DEBUG='pw:browser')
cmd=['node','node_modules/.pnpm/playwright@1.60.0/node_modules/playwright/cli.js','test','--config','docs/verification/t1305/acceptance/public/a/final-t1304-t1305/playwright.config.cjs','source.spec.cjs','--workers=1','--retries=0']
root.mkdir(parents=True,exist_ok=True);started=time.time()
(root/'execution.json').write_text(json.dumps({'command':cmd,'outerTimeoutSeconds':14400,'startedAt':started,'testTimeoutMs':1800000,'hookTimeoutMs':180000,'actionExpectMs':120000,'navigationMs':300000,'launchMs':180000},indent=2)+'\n')
with (root/'playwright.log').open('w') as log:
 try:code=subprocess.run(cmd,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=14400).returncode
 except subprocess.TimeoutExpired:code=124
private=json.loads(Path(env['T1300_SESSION']).read_text())
for target in root.rglob('*'):
 if target.is_file() and target.suffix in ['.log','.json','.txt','.html']:
  target.write_text(target.read_text().replace(private['handshake'],'[REDACTED_OWNED_TEST_HANDSHAKE]'))
(root/'playwright.exit').write_text(str(code)+'\n');(root/'execution-result.json').write_text(json.dumps({'exit':code,'elapsedSeconds':time.time()-started},indent=2)+'\n');print(json.dumps({'exit':code,'elapsedSeconds':time.time()-started}))
