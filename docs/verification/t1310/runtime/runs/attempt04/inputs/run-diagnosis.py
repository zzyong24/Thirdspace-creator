import json, os, pathlib, subprocess, sys, time, shutil, hashlib
root = pathlib.Path(__file__).resolve().parent
run = root / 'runs' / sys.argv[1]
run.mkdir(parents=True, exist_ok=False)
inputs = run/'inputs'
inputs.mkdir()
for name in ['vitest.config.ts','topic-chat.diagnosis.test.ts','worker-entry.fixture.cjs','codex-cli.fixture.cjs','run-diagnosis.py']:
    shutil.copyfile(root/name, inputs/name)
env = os.environ.copy()
env['T1310_CASES_SUBDIR'] = sys.argv[1]
cmd = ['pnpm','--dir','backend','exec','vitest','run','--config','../docs/verification/t1310/runtime/vitest.config.ts','--configLoader','native','--retry=0','--maxWorkers=1','--testTimeout=540000','--hookTimeout=180000'] + sys.argv[2:]
start = time.time()
(run/'execution.json').write_text(json.dumps({'command':cmd,'startedAt':start,'outerSeconds':86400,'singleWorker':True,'retry':0},indent=2)+'\n')
with (run/'output.log').open('w') as output:
    code = subprocess.run(cmd, cwd=root.parents[3], env=env, stdout=output, stderr=subprocess.STDOUT, timeout=86400).returncode
(run/'exit').write_text(str(code)+'\n')
(run/'execution-result.json').write_text(json.dumps({'exit':code,'elapsedSeconds':time.time()-start},indent=2)+'\n')
print(json.dumps({'run':str(run),'exit':code,'elapsedSeconds':time.time()-start}))
