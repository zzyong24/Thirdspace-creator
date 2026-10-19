import json
import os
from pathlib import Path
import subprocess
import time

root = Path('docs/verification/t1303/acceptance/runs/recovery2-8ced635/a')
env = os.environ.copy()
env.update(T1300_SESSION='/private/tmp/t1300-candidate-gPThzJ/session.json',
           T1300_ACCEPTANCE_TASK='T-1303', T1300_MODULE='a',
           T1300_RUN_NAME='recovery2-8ced635', DEBUG='pw:browser')
cmd = ['node', 'node_modules/.pnpm/playwright@1.60.0/node_modules/playwright/cli.js',
       'test', '--config', 'docs/verification/t1303/acceptance/public/a/recovery2/playwright.config.cjs',
       'ui.spec.cjs', '--workers=1', '--retries=0']
root.mkdir(parents=True, exist_ok=True, mode=0o700)
started = time.time()
(root / 'execution.json').write_text(json.dumps({
    'command': cmd, 'outerTimeoutSeconds': 7200, 'startedAt': started,
    'attempt': 'attempt03-temporary-persistent-profile', 'debug': 'pw:browser'
}, ensure_ascii=False, indent=2) + '\n')
with (root / 'playwright.log').open('w') as log:
    try:
        code = subprocess.run(cmd, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=7200).returncode
    except subprocess.TimeoutExpired:
        code = 124
private = json.loads(Path(env['T1300_SESSION']).read_text())
logpath = root / 'playwright.log'
logpath.write_text(logpath.read_text().replace(private['handshake'], '[REDACTED_OWNED_TEST_HANDSHAKE]'))
(root / 'playwright.exit').write_text(str(code) + '\n')
(root / 'execution-result.json').write_text(json.dumps({'exit': code, 'elapsedSeconds': time.time() - started}, indent=2) + '\n')
print(json.dumps({'exit': code, 'elapsedSeconds': time.time() - started}))
