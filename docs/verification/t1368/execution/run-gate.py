import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
CANDIDATE = Path('/Users/zyongzhu/.codex/worktrees/t1367-collapsed-navigation/Thirdspace-creator')
PREFLIGHT = json.loads((ROOT / 'PREFLIGHT.json').read_text())
GATE = sys.argv[1]
assert GATE in ('LED-053', 'LED-060')
assert not (ROOT / f'{GATE}_START.json').exists(), '各门仅一次，不允许覆盖开始记录'
if GATE == 'LED-060':
    assert (ROOT / 'LED-053_EXIT.json').exists(), '先保存第一门真实退出结果'

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def durable(path, data):
    with path.open('x') as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write('\n')
        handle.flush()
        os.fsync(handle.fileno())

environment = dict(os.environ)
assert 'T1068_REPRO_EVIDENCE' not in environment
command = PREFLIGHT['commands'][GATE]
if GATE == 'LED-053':
    environment['HYPERFRAMES_NO_TELEMETRY'] = '1'
    environment['HYPERFRAMES_NO_AUTO_INSTALL'] = '1'
    profile = '(version 1) (allow default) (deny network*) (deny file-write* (subpath "/Users/zyongzhu/.hyperframes"))'
    argv = ['/usr/bin/sandbox-exec', '-p', profile, 'node', 'tools/timeout-policy/verify.mjs']
else:
    argv = ['/bin/bash', '-c', command]
start = now()
monotonic_start = time.monotonic()
log_path = ROOT / 'private' / f'{GATE}_RAW.log'
with log_path.open('xb', buffering=0) as log:
    process = subprocess.Popen(argv, cwd=CANDIDATE, env=environment, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    durable(ROOT / f'{GATE}_START.json', {
        'gate': GATE, 'attempt': 1, 'startedAt': start, 'pid': process.pid,
        'cwd': str(CANDIDATE), 'command': command, 'effectiveArgv': argv,
        'environmentOverrides': {'HYPERFRAMES_NO_TELEMETRY': '1', 'HYPERFRAMES_NO_AUTO_INSTALL': '1'} if GATE == 'LED-053' else {},
        'externalHardTimeout': None, 'sourceSha256': PREFLIGHT['sourceSha256'],
        'rawOutputRef': f'private/{GATE}_RAW.log',
    })
    print(json.dumps({'gate': GATE, 'started': True, 'pid': process.pid}), flush=True)
    returncode = process.wait()
    # 原665收尾缺失不再重现：先持久化真实wait结果，再做hash/status/摘要。
    durable(ROOT / f'{GATE}_EXIT.json', {
        'gate': GATE, 'attempt': 1, 'pid': process.pid,
        'startedAt': start, 'endedAt': now(),
        'elapsedSeconds': time.monotonic() - monotonic_start,
        'returnCode': returncode, 'exitCode': returncode if returncode >= 0 else None,
        'signal': -returncode if returncode < 0 else None,
        'recordOrder': 'process.wait → durable exit JSON flush/fsync → log fsync → metadata',
    })
    os.fsync(log.fileno())
data = log_path.read_bytes()
durable(ROOT / f'{GATE}_OUTPUT_META.json', {
    'gate': GATE, 'rawOutputRef': f'private/{GATE}_RAW.log',
    'rawBytes': len(data), 'rawSha256': hashlib.sha256(data).hexdigest(),
    'actualExitReceipt': f'{GATE}_EXIT.json',
})
print(json.dumps({'gate': GATE, 'returnCode': returncode, 'rawBytes': len(data), 'exitPersistedBeforeMetadata': True}), flush=True)
