#!/usr/bin/env python3
"""T246仅在首轮真实超时后条件续传；保原partial，严格TLS，全文件最终SHA。"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import re
import shutil
import stat
import subprocess
import time

URL = 'https://creatoros.aitongban.cloud/updates/CreatorOS_1.2.0_e3151ce89_macos-arm64.dmg'
IP = '152.136.151.58'
SHA = '5737445f53ec3af024596cecca34e4d8e404294ede0827191846bf0fb1193793'
SIZE = 845127298
BASE = Path('/Volumes/T7-MacData/CodexBuilds/CreatorT246Delivery-20261017')
ROOT = BASE / 'external-verify-resume-r3'
ORIGINAL = BASE / 'external-verify/CreatorOS-e315.dmg.partial'
PRIOR_EXECUTION = BASE / 'external-collector-r2.execution.json'
ORIGINAL_COLLECTOR = '849a848b023d0154d2c198f47cdf8155d3569bd26a4d749f8a16594cb39a5342'
ETAG = '"6ad34f16-325f9e82"'
MAX_TOTAL_SECONDS = 2400
MAX_RESUME_SECONDS = 1500
FINAL_MARGIN_SECONDS = 120

def digest(p):
    h = hashlib.sha256()
    with Path(p).open('rb') as f:
        for b in iter(lambda: f.read(1048576), b''): h.update(b)
    return h.hexdigest()

def regular(p):
    s = Path(p).lstat()
    if not stat.S_ISREG(s.st_mode): raise RuntimeError('REGULAR_REQUIRED')
    return s

def stable_stat(s):
    return (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)

def headers(raw):
    result = {}
    for line in raw.splitlines():
        if line.startswith('HTTP/'): result = {}
        elif ':' in line:
            k, v = line.split(':', 1); k = k.lower()
            if k in result: raise RuntimeError('DUPLICATE_RESPONSE_HEADER')
            result[k] = v.strip()
    return result

def verify_response(meta, writeout, offset):
    if type(offset) is not int or not 0 < offset < SIZE: raise RuntimeError('OFFSET_INVALID')
    if writeout.strip() != '206 ' + IP + ' 0': raise RuntimeError('RESUME_TLS_PEER_OR_STATUS_INVALID')
    if meta.get('content-range') != f'bytes {offset}-{SIZE-1}/{SIZE}': raise RuntimeError('CONTENT_RANGE_INVALID')
    if meta.get('content-length') != str(SIZE-offset): raise RuntimeError('REMAINING_BYTES_INVALID')
    if meta.get('etag') != ETAG: raise RuntimeError('IMMUTABLE_ETAG_CHANGED')

def network_budget(prior_elapsed, current_elapsed):
    if type(prior_elapsed) not in (int, float) or not math.isfinite(prior_elapsed) or prior_elapsed < 0:
        raise RuntimeError('PRIOR_ELAPSED_INVALID')
    seconds = math.floor(min(MAX_RESUME_SECONDS, MAX_TOTAL_SECONDS-prior_elapsed-current_elapsed-FINAL_MARGIN_SECONDS))
    if seconds < 120: raise RuntimeError('TOTAL_BUDGET_EXHAUSTED')
    return seconds

def collect(prior_sha):
    started = time.monotonic()
    if platform.system() != 'Darwin': raise RuntimeError('EXTERNAL_MAC_REQUIRED')
    regular(PRIOR_EXECUTION)
    if digest(PRIOR_EXECUTION) != prior_sha: raise RuntimeError('PRIOR_EXECUTION_CAS_FAILED')
    previous = json.loads(PRIOR_EXECUTION.read_text())
    if previous.get('exitCode') != 2 or previous.get('collectorSHA256') != ORIGINAL_COLLECTOR:
        raise RuntimeError('ORIGINAL_PROCESS_NOT_CONFIRMED_FAILED')
    # 原collector到退出后才写execution，明确等待原进程结束；仅允许本轮真实curl28超时恢复。
    if '(28)' not in (BASE/'external-verify/curl.stderr.log').read_text(): raise RuntimeError('ORIGINAL_TIMEOUT_NOT_PROVEN')
    before = regular(ORIGINAL); offset = before.st_size
    if not 0 < offset < SIZE: raise RuntimeError('ORIGINAL_PARTIAL_SIZE_INVALID')
    prefix = digest(ORIGINAL)
    if stable_stat(ORIGINAL.stat()) != stable_stat(before): raise RuntimeError('ORIGINAL_PARTIAL_CHANGED')
    ROOT.mkdir(mode=0o700)
    partial = ROOT/'CreatorOS-e315.resume.partial'; final = ROOT/'CreatorOS-e315.dmg'
    clone = subprocess.run(['/bin/cp', '-c', str(ORIGINAL), str(partial)], capture_output=True, timeout=120)
    if clone.returncode:
        partial.unlink(missing_ok=True)
        subprocess.run(['/bin/cp', str(ORIGINAL), str(partial)], check=True, timeout=120)  # 只本机复制前缀。
    os.chmod(partial, 0o600)
    if digest(partial) != prefix or stable_stat(ORIGINAL.stat()) != stable_stat(before) or digest(ORIGINAL) != prefix:
        raise RuntimeError('COPIED_PREFIX_CAS_FAILED')
    budget = network_budget(previous['elapsedSeconds'], time.monotonic()-started)
    argv = ['curl','--fail','--silent','--show-error','--proto','=https','--tlsv1.2','--connect-timeout','15','--max-time',str(budget),'--noproxy','*','--resolve','creatoros.aitongban.cloud:443:'+IP,'--continue-at',str(offset),'--header','If-Range: '+ETAG,'--dump-header',str(ROOT/'response.headers'),'--output',str(partial),'--write-out','%{http_code} %{remote_ip} %{ssl_verify_result}',URL]
    run = subprocess.run(argv, capture_output=True, text=True, timeout=budget+30)
    (ROOT/'curl.stderr.log').write_text(run.stderr); os.chmod(ROOT/'curl.stderr.log',0o600)
    attempt = {'curlExitCode':run.returncode,'writeOut':run.stdout,'originalOffset':offset,'prefixSHA256':prefix,'priorElapsedSeconds':previous['elapsedSeconds'],'resumeNetworkBudgetSeconds':budget,'candidateBytes':partial.stat().st_size,'elapsedRecoverySeconds':time.monotonic()-started,'argv':argv}
    (ROOT/'attempt.json').write_text(json.dumps(attempt,ensure_ascii=False,indent=2)+'\n')
    if run.returncode: raise RuntimeError('RESUME_FAILED_PRESERVED_NEW_AND_ORIGINAL_PARTIAL')
    meta = headers((ROOT/'response.headers').read_text())
    verify_response(meta, run.stdout, offset)
    if partial.stat().st_size != SIZE or digest(partial) != SHA: raise RuntimeError('WHOLE_FILE_SHA_OR_SIZE_INVALID')
    if stable_stat(ORIGINAL.stat()) != stable_stat(before) or digest(ORIGINAL) != prefix: raise RuntimeError('ORIGINAL_PARTIAL_CHANGED')
    total_elapsed = previous['elapsedSeconds']+time.monotonic()-started
    if total_elapsed > MAX_TOTAL_SECONDS: raise RuntimeError('TOTAL_BUDGET_EXHAUSTED')
    with partial.open('rb') as f: os.fsync(f.fileno())
    os.link(partial, final); partial.unlink()
    fd=os.open(ROOT,os.O_RDONLY|os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)
    result={'url':URL,'sha256':SHA,'bytes':SIZE,'tlsVerified':True,'externalToOriginHost':True,'httpStatus':206,'curlVerifyResult':0,'curlRemoteIP':IP,'collectorHostPlatform':platform.system(),'collectorSourceSHA256':digest(Path(__file__)),'collectedAtUnix':time.time(),'downloadPath':str(final),'transferMode':'range-resume','rangeStart':offset,'contentRange':meta['content-range'],'ifRangeETag':ETAG,'initialPartialSHA256':prefix,'originalFailureExecutionSHA256':prior_sha,'priorElapsedSeconds':previous['elapsedSeconds'],'resumeElapsedSeconds':time.monotonic()-started,'cumulativeBudgetSeconds':MAX_TOTAL_SECONDS,'cumulativeElapsedSeconds':total_elapsed,'originalPartialPreserved':True,'command':argv,'limits':'首轮真实超时后仅续传；不是仅hash局部，不伪HTTP200；原partial与失败日志完整保留，无线上指针变更'}
    p=ROOT/'external-download-receipt.json'
    with p.open('x') as out:
        os.fchmod(out.fileno(),0o600);json.dump(result,out,ensure_ascii=False,indent=2);out.write('\n');out.flush();os.fsync(out.fileno())
    print(json.dumps({'receipt':str(p),'receiptSHA256':digest(p),'wholeFileSHA256':SHA},ensure_ascii=False))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--prior-execution-sha',required=True);a=p.parse_args()
    try:
        if not re.fullmatch(r'[0-9a-f]{64}',a.prior_execution_sha): raise RuntimeError('PRIOR_SHA_INVALID')
        collect(a.prior_execution_sha)
    except Exception as exc:
        print(type(exc).__name__+': '+str(exc));raise SystemExit(2)
