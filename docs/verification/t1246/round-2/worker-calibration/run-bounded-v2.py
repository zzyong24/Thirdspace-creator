from pathlib import Path
import subprocess,os,signal,time,json
root=Path('/Users/zyongzhu/.codex/worktrees/integrated-dev-acceptance/Thirdspace-creator/ai-worker');out=Path('/tmp/t1246-worker-calibration');budget=30000000;cleanup=120000
start=time.monotonic();env=dict(os.environ)
for key in list(env):
 if key.startswith(('CREATOROS_','GROWTH_','TAURI_','PG')) or key in ('DATABASE_URL','OPENAI_API_KEY','ANTHROPIC_API_KEY'):env.pop(key)
with (out/'bounded-final-v2.log').open('wb') as log:
 p=subprocess.Popen(['node','node_modules/vitest/vitest.mjs','run','--config',str(out/'vitest.config.mjs')],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 timed=False
 try: code=p.wait(timeout=budget/1000)
 except subprocess.TimeoutExpired:
  timed=True;os.killpg(p.pid,signal.SIGTERM)
  try:code=p.wait(timeout=cleanup/1000)
  except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);code=p.wait()
receipt={'exitCode':code,'durationMs':round((time.monotonic()-start)*1000),'outerTimedOut':timed,'outerMs':budget,'cleanupMs':cleanup,'pid':p.pid,'cwd':str(root),'sharedDistRead':False,'ownedPrivateCjsBuild':True,'environment':'保留HOME/CODEX_HOME，清真实App/PG/供应商变量；所有bundle child preload禁fetch','scope':'85用例/8文件；不代表官方供应商、native App或publicUI验收'}
(out/'bounded-final-v2-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n');print(json.dumps(receipt,ensure_ascii=False));raise SystemExit(code)
