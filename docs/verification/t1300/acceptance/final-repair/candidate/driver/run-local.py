import pathlib,subprocess,json,time,datetime,os,signal
repo=pathlib.Path.cwd().resolve();e=pathlib.Path(__file__).resolve().parent.parent
mode=__import__('sys').argv[1]
assert mode in ['basic','package'];pre=json.load(open(e/'freeze-preflight.json'));head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip();assert head==pre['sourceHead'];assert not subprocess.check_output(['git','status','--porcelain'],text=True).strip()
if mode=='basic':cmd=['pnpm','-C','frontend','exec','vitest','run','scripts/desktop/package-local.test.mjs','scripts/desktop/desktop-release-workflow.test.mjs','scripts/desktop/notarize.test.mjs','scripts/desktop/tauri-signing-config.test.mjs'];budget=86400
else:
 result=json.load(open(e/'basic-result.json'));assert result['exitCode']==0;cmd=['pnpm','-C','frontend','desktop:package-local'];budget=21600
start=time.monotonic();env=os.environ.copy();env['CREATOROS_LOCAL_SKIP_INSTALL']='1';log=open(e/(mode+'.log'),'wb');p=subprocess.Popen(cmd,cwd=repo,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
(e/(mode+'-start.json')).write_text(json.dumps({'sourceHead':head,'command':cmd,'CREATOROS_LOCAL_SKIP_INSTALL':'1','outerBudgetSeconds':budget,'pid':p.pid,'pgid':p.pid,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()},ensure_ascii=False,indent=2)+'\n')
expired=False
try:code=p.wait(timeout=budget)
except subprocess.TimeoutExpired:
 expired=True;os.killpg(p.pid,signal.SIGTERM)
 try:code=p.wait(timeout=120)
 except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);code=p.wait(timeout=120)
finally:log.close()
result={'sourceHead':head,'command':cmd,'CREATOROS_LOCAL_SKIP_INSTALL':'1','exitCode':code,'expired':expired,'elapsedSeconds':time.monotonic()-start,'outerBudgetSeconds':budget,'endedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()};(e/(mode+'-result.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False));raise SystemExit(code if code>=0 else 128-code)
