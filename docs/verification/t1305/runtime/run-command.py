import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
import time

root = Path('docs/verification/t1305/runtime')
name = sys.argv[1]
commands = json.loads((root / 'commands.json').read_text())
cmd = commands[name]
env = os.environ.copy()
env['T1303_DOM_DIR'] = str((root / (name + '-dom')).resolve())
started = time.time()
(root / (name + '-execution.json')).write_text(json.dumps({
    'command': cmd, 'outerTimeoutSeconds': 86400,
    'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
}, indent=2) + '\n')
with (root / (name + '.log')).open('w') as output:
    try:
        code = subprocess.run(cmd, env=env, stdout=output, stderr=subprocess.STDOUT, timeout=86400).returncode
    except subprocess.TimeoutExpired:
        code = 124
(root / (name + '.exit')).write_text(str(code) + '\n')
(root / (name + '-result.json')).write_text(json.dumps({'exit': code, 'elapsedSeconds': time.time() - started}, indent=2) + '\n')
print(json.dumps({'name': name, 'exit': code, 'elapsedSeconds': time.time() - started}))
