import os
import sys
import json
import time
import signal
import hashlib
import subprocess
import threading
from pathlib import Path

REPO = Path(__file__).resolve().parents[5]
RUN = Path(__file__).resolve().parent
NODE = '/opt/homebrew/Cellar/node/25.9.0_2/bin/node'
COMMAND = [NODE, str(REPO / 'frontend/node_modules/vitest/vitest.mjs'), 'run',
           'src/server/__module_integration__/graphic-reorganization-diagnosis.persistence-client.test.ts',
           '--config', str(RUN / 'vitest.config.mts')]


def save(name, value):
    (RUN / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def observe_processes(stop, process):
    seen = {process.pid}
    while not stop.wait(2):
        result = subprocess.run(['ps', '-axo', 'pid=,ppid=,pgid=,comm='], capture_output=True, text=True)
        if result.returncode:
            save('process-observation-limit.json', {'returncode': result.returncode, 'stderrSha256': hashlib.sha256(result.stderr.encode()).hexdigest()})
            return
        rows = []
        for line in result.stdout.splitlines():
            parts = line.strip().split(None, 3)
            if len(parts) == 4:
                try:
                    rows.append({'pid': int(parts[0]), 'ppid': int(parts[1]), 'pgid': int(parts[2]), 'executable': Path(parts[3]).name})
                except ValueError:
                    pass
        changed = True
        while changed:
            before = len(seen)
            seen.update(row['pid'] for row in rows if row['ppid'] in seen)
            changed = len(seen) != before
        with (RUN / 'owned-process-observations.ndjson').open('a') as f:
            f.write(json.dumps({'at': time.time(), 'ownedDescendants': [r for r in rows if r['pid'] in seen]}) + '\n')


if __name__ == '__main__':
    # 只继承原认证环境，不读取、复制或打印其内容。
    env = os.environ.copy()
    env['T1321_RUN_DIR'] = str(RUN)
    env['PATH'] = str(Path(NODE).parent) + os.pathsep + env.get('PATH', '')
    start = time.time()
    process = subprocess.Popen(COMMAND, cwd=REPO / 'frontend', env=env,
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               start_new_session=True)
    save('execution-start.json', {'command': COMMAND, 'cwd': str(REPO / 'frontend'), 'startedAt': start,
                                  'pid': process.pid, 'pgid': process.pid, 'outerTimeoutSeconds': 86400,
                                  'testTimeoutMs': 3600000, 'hookTimeoutMs': 180000, 'retry': 0, 'singleWorker': True})
    print(json.dumps({'phase': 'started', 'pid': process.pid, 'pgid': process.pid, 'run': str(RUN)}), flush=True)
    stop = threading.Event()
    monitor = threading.Thread(target=observe_processes, args=(stop, process), daemon=True)
    monitor.start()
    timed_out = threading.Event()

    def expire():
        timed_out.set()
        os.killpg(process.pid, signal.SIGTERM)

    timer = threading.Timer(86400, expire)
    timer.daemon = True
    timer.start()
    # 任意库/供应商stdout不落原文；完整保顺序、字节数、hash。
    with (RUN / 'stdout-safe.ndjson').open('a') as f:
        for raw in iter(process.stdout.readline, b''):
            entry = {'at': time.time(), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
            decoded = raw.decode('utf8', errors='replace').strip()
            if decoded.startswith(('Test Files ', 'Tests ', 'Duration ', 'Start at ')) and len(decoded) < 200:
                entry['summary'] = decoded
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')
            f.flush()
    code = process.wait()
    timer.cancel()
    stop.set()
    monitor.join(5)
    result = {'exitCode': code, 'elapsedSeconds': time.time() - start, 'outerTimedOut': timed_out.is_set(),
              'stdoutPolicy': '只留字节/hash及固定Vitest计数行，未落raw日志', 'command': COMMAND}
    save('execution-result.json', result)
    print(json.dumps(result), flush=True)
    sys.exit(code)
