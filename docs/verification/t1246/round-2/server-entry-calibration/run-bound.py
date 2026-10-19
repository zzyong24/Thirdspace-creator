from pathlib import Path
import subprocess,os,time,signal,json,sys,hashlib
root=Path('/Users/zyongzhu/.codex/worktrees/integrated-dev-acceptance/Thirdspace-creator');out=Path('/tmp/t1246-legacy-calibration');name,attempt=sys.argv[1:3];budget=4000000 if name in ('producer','catalog') else (8800000 if name=='legacy' else 6600000);cleanup=180000
paths=['frontend/src/server/legacy-frozen-source-read.integration.test.ts'] if name in ('legacy','producer','catalog') else ['frontend/src/server/platform-worker-entry.integration.test.ts','frontend/src/server/review-insights-worker-entry.integration.test.ts']
def snapshot():
 result={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in paths}
 result['bundles']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((root/'ai-worker/dist').glob('*')) if p.is_file()}
 return result
before=snapshot();env=dict(os.environ)
for key in list(env):
 if key.startswith(('CREATOROS_','GROWTH_','TAURI_','PG')) or key in ('DATABASE_URL','OPENAI_API_KEY','ANTHROPIC_API_KEY'):env.pop(key)
data=out/(name+'-'+attempt+'-owned');data.mkdir(exist_ok=True);env.update({'TMPDIR':str(data),'CREATOROS_APP_SUPPORT_DIR':str(data/'app'),'GROWTH_MEDIA_ROOT':str(data/'media'),'GROWTH_LOCAL_PROFILE_ROOT':str(data/'profiles'),'T1089_EVIDENCE_DIR':str(data)})
start=time.monotonic();timed=False
with (out/(name+'-'+attempt+'.log')).open('wb') as log:
 p=subprocess.Popen(['node','node_modules/vitest/vitest.mjs','run','--config',str(out/(name+'.config.mjs')),'--reporter=default','--reporter=json','--outputFile='+str(out/(name+'-'+attempt+'.json'))],cwd=root/'frontend',env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 try:code=p.wait(timeout=budget/1000)
 except subprocess.TimeoutExpired:
  timed=True;os.killpg(p.pid,signal.SIGTERM)
  try:code=p.wait(timeout=cleanup/1000)
  except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);code=p.wait()
result={'exitCode':code,'durationMs':round((time.monotonic()-start)*1000),'outerTimedOut':timed,'outerMs':budget,'cleanupMs':cleanup,'pid':p.pid,'scope':name,'attempt':attempt,'before':before,'after':snapshot(),'environment':'HOME/CODEX_HOME原值不变，清真实App/PG/供应商变量，owned TMP/App/media/profile；仅PGlite+受控localhost SSE/HTTP，不App/官方模型/真实PG'}
(out/(name+'-'+attempt+'-receipt.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False));raise SystemExit(code)
