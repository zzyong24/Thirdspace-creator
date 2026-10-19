import subprocess, os, json, pathlib, time, datetime

root = pathlib.Path('docs/verification/t1300/acceptance/runs/final-dc46cfa/b-config')
private = pathlib.Path('/private/tmp/t1300-candidate-MhP4pW/session.json')
session = json.loads(private.read_text())
env = os.environ.copy()
env.update({'T1300_ACCEPTANCE_TASK': 'T-1300', 'T1300_MODULE': 'b-config', 'T1300_RUN_NAME': 'final-dc46cfa', 'T1300_SESSION': str(private)})
cmd = ['pnpm', '--dir', 'frontend', 'exec', 'playwright', 'test', '--config', '../docs/verification/t1300/acceptance/public/final-dc46cfa/driver/playwright.config.cjs']
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
mark = time.monotonic()
process = subprocess.run(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=86400)
output = process.stdout.replace(session['handshake'].encode(), b'[REDACTED_OWNED_TEST_HANDSHAKE]')
(root / 'public-execution.log').write_bytes(output)
result = {'command': cmd, 'exitCode': process.returncode, 'elapsedSeconds': time.monotonic()-mark, 'startedAt': started, 'sourceHead': 'dc46cfa700ec9c9cbada47fb76237d0b50d10a67', 'log': 'public-execution.log', 'controllerUntouched': True}
(root / 'PUBLIC_EXECUTION.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(result, ensure_ascii=False))
