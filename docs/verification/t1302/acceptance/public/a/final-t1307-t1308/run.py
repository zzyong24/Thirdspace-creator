import json, os, subprocess, time
from pathlib import Path

root = Path('docs/verification/t1302/acceptance/runs/final-t1307-t1308/a/attempt02-approved-browser')
env = os.environ.copy()
env.update(T1300_SESSION='/private/tmp/t1300-candidate-MhP4pW/session.json', T1300_ACCEPTANCE_TASK='T-1302', T1300_MODULE='a', T1300_RUN_NAME='final-t1307-t1308', T1302_ATTEMPT='attempt02-approved-browser')
cmd = ['node', 'node_modules/.pnpm/playwright@1.60.0/node_modules/playwright/cli.js', 'test', '--config', 'docs/verification/t1302/acceptance/public/a/final-t1307-t1308/playwright.config.cjs', 'presentation.spec.cjs', '--workers=1', '--retries=0']
root.mkdir(parents=True, exist_ok=True)
started = time.time()
(root/'execution.json').write_text(json.dumps({'command': cmd, 'startedAt': started, 'outerTimeoutSeconds': 86400, 'caseTimeoutMs': 1800000, 'hookLaunchMs': 180000, 'actionExpectScreenshotMs': 120000, 'navigationMs': 300000, 'rpcMs': 900000, 'workers': 1, 'retries': 0}, indent=2)+'\n')
with (root/'playwright.log').open('w') as log:
    try:
        code = subprocess.run(cmd, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=86400).returncode
    except subprocess.TimeoutExpired:
        code = 124
(root/'playwright.exit').write_text(str(code)+'\n')
(root/'execution-result.json').write_text(json.dumps({'exit': code, 'elapsedSeconds': time.time()-started}, indent=2)+'\n')
secret = json.loads(Path(env['T1300_SESSION']).read_text())['handshake'].encode()
hits = [str(p) for p in root.rglob('*') if p.is_file() and secret in p.read_bytes()]
(root/'secret-scan.json').write_text(json.dumps({'exactPrivateHandshakeHits': len(hits), 'scannedFiles': sum(p.is_file() for p in root.rglob('*')), 'rawFilesRewritten': False}, indent=2)+'\n')
print(json.dumps({'exit': code, 'elapsedSeconds': time.time()-started, 'secretHits': len(hits)}))
