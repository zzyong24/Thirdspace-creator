import pathlib, subprocess, json, hashlib, time, datetime, os, signal
repo=pathlib.Path(__file__).resolve().parents[6]
assert (repo/'tools/timeout-policy/verify.mjs').is_file(),str(repo)
root=pathlib.Path(__file__).resolve().parent/'timeout-v1'
root.mkdir(parents=True,exist_ok=False)
sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def save(name,value):
 p=root/name;p.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n');p.chmod(0o600)
def cache():
 out=[]
 for package in ['contract','ai-worker','backend','frontend','mcp-server']:
  p=repo/package/'node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json'
  out.append({'path':str(p.relative_to(repo)),'exists':p.is_file(),**({'bytes':p.stat().st_size,'sha256':sha(p)} if p.is_file() else {})})
 return out
paths=subprocess.check_output(['git','diff','0e1dc6228f1fa3dc02f2b1c7a1cee77ab18d650a','--name-only','--','backend/src','frontend/src','contract/src'],cwd=repo,text=True).splitlines()
paths+=['tools/timeout-policy/verify.mjs','tools/timeout-policy/check.mjs','orchestrator/process/modules.config.json','orchestrator/progress.json']
sources=[{'path':p,'bytes':(repo/p).stat().st_size,'sha256':sha(repo/p)} for p in dict.fromkeys(paths) if (repo/p).is_file()]
save('BEFORE_INPUTS.json',sources);save('CACHE_BEFORE.json',cache())
tracked=subprocess.check_output(['git','ls-files','-z'],cwd=repo)
save('GIT_INVENTORY.json',{'sha256':hashlib.sha256(tracked).hexdigest(),'pathCount':len([x for x in tracked.split(b'\0') if x]),'RTestTracked':b'frontend/src/server/__module_integration__/codex-mixed-checkpoint.persistence-client.test.ts' in tracked.split(b'\0'),'limit':'check.mjs既有规则仍排除.test/fixtures/docs；库存含文件不等于静态预算覆盖，测试预算看实际前快照与执行。','RTestStageMeaning':'仅Root已准可逆库存暂存，非独评/commit/任务通过。'})
command=['node','tools/timeout-policy/verify.mjs'];budget=86400
started=datetime.datetime.now(datetime.timezone.utc).isoformat();begin=time.monotonic()
log=open(root/'stdout.log','wb');os.chmod(root/'stdout.log',0o600)
p=subprocess.Popen(command,cwd=repo,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
save('execution.json',{'command':command,'cwd':str(repo),'startedAt':started,'outerBudgetSeconds':budget,'pid':p.pid,'pgid':p.pid,'sourceHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(),'sourceMeaning':'最终实际源按BEFORE_INPUTS，R已释放两源/test但代码commit仍待局部审；不冒此HEAD含未提交兄弟代码。','cacheAuthorization':'仅原命令实际必需五包.vite结果派生，原命令/config不shim、不改guard；未许模型/浏览器/旧库/安装。'})
expired=False
try:code=p.wait(timeout=budget)
except subprocess.TimeoutExpired:
 expired=True;os.killpg(p.pid,signal.SIGTERM)
 try:code=p.wait(timeout=120)
 except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);code=p.wait(timeout=120)
finally:log.close()
after=[{'path':row['path'],'bytes':(repo/row['path']).stat().st_size,'sha256':sha(repo/row['path'])} for row in sources]
save('CACHE_AFTER.json',cache());save('AFTER_INPUTS.json',after)
result={'command':command,'exitCode':code,'elapsedSeconds':time.monotonic()-begin,'outerBudgetSeconds':budget,'expired':expired,'endedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'inputsUnchanged':after==sources,'testsNotSupplierAcceptance':True,'finalTaskComplete':False}
save('execution-result.json',result);print(json.dumps(result,ensure_ascii=False));raise SystemExit(code if code>=0 else 128-code)
