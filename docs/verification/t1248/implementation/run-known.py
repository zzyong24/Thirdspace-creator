from pathlib import Path
import os,subprocess,time,json,signal,hashlib
root=Path('/Users/zyongzhu/.codex/worktrees/integrated-dev-acceptance/Thirdspace-creator');out=Path('/tmp/t1248-calibration');env=dict(os.environ)
for k in list(env):
 if k.startswith(('CREATOROS_','GROWTH_','TAURI_','PG')) or k in ('DATABASE_URL','OPENAI_API_KEY','ANTHROPIC_API_KEY'):env.pop(k)
env['TMPDIR']=str(out)
paths=['contract/src/assistant-system.test.ts','backend/src/modules/ai-runtime/chat-tools.test.ts','backend/src/modules/ai-runtime/chat-system-tool-host.test.ts','backend/src/application/chat/assistant-system-root.integration.test.ts','backend/src/modules/ai/chat-proposal-source.service.test.ts']
source=['contract/src/resources/assistant-system.ts','backend/src/modules/ai-runtime/chat-tools.ts','backend/src/modules/ai-runtime/chat-system-tool-host.ts','backend/src/application/chat/assistant-system-root.ts','backend/src/modules/ai/chat-proposal-source.service.ts']+paths
snap=lambda:{p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in source}
before=snap();start=time.monotonic();timed=False
# conservative bounded full serial allowance: 347 bodies each <=1.2M +5 file hook pairs <=360k + startup/cleanup180k each.
outer=500000000
with (out/'full-third.log').open('wb') as log:
 p=subprocess.Popen(['node','frontend/node_modules/vitest/vitest.mjs','run',*paths,'--testTimeout=180000','--hookTimeout=180000','--retry=0','--fileParallelism=false','--reporter=default','--reporter=json','--outputFile='+str(out/'full-third.json')],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 try:code=p.wait(timeout=outer/1000)
 except subprocess.TimeoutExpired:
  timed=True;os.killpg(p.pid,signal.SIGTERM)
  try:code=p.wait(timeout=180)
  except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);code=p.wait()
r={'exitCode':code,'durationMs':round((time.monotonic()-start)*1000),'outerMs':outer,'bodyUpperBound':347,'perBodyConservativeUpperMs':1200000,'hookPairs':5,'eachHookPairMs':360000,'startupMs':180000,'cleanupMs':180000,'timedOut':timed,'processClosed':True,'before':before,'after':snap()};(out/'full-third-receipt.json').write_text(json.dumps(r,indent=2)+'\n');print(code)
