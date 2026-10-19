import datetime,json,os,subprocess,sys,time
from pathlib import Path
root=Path('docs/verification/t1304/acceptance/candidate');mode=sys.argv[1]
commands={'basic':['pnpm','-C','frontend','exec','vitest','run','scripts/desktop/package-local.test.mjs','scripts/desktop/desktop-release-workflow.test.mjs','scripts/desktop/notarize.test.mjs','scripts/desktop/tauri-signing-config.test.mjs'],'package':['pnpm','-C','frontend','desktop:package-local']}
name={'basic':'basic-packaging-tests','package':'package-local'}[mode];cmd=commands[mode];env=os.environ.copy();env['CREATOROS_LOCAL_SKIP_INSTALL']='1';head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip();start=time.time()
assert not subprocess.check_output(['git','status','--porcelain'],text=True).strip()
with (root/(name+'.log')).open('w') as out:
 try:code=subprocess.run(cmd,env=env,stdout=out,stderr=subprocess.STDOUT,timeout=86400).returncode
 except subprocess.TimeoutExpired:code=124
result={'command':cmd,'explicitEnv':{'CREATOROS_LOCAL_SKIP_INSTALL':'1'},'exitCode':code,'durationSeconds':time.time()-start,'outerBudgetSeconds':86400,'sourceHead':head,'startedAt':datetime.datetime.fromtimestamp(start,datetime.timezone.utc).isoformat()};(root/(name+'-result.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result));sys.exit(code)
