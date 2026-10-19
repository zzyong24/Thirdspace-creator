#!/usr/bin/env python3
"""本轮Mac工作机→已核origin的真实HTTPS完整下载；固定SNI/系统CA，不使用代理或跳过TLS。"""
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import time

URL = 'https://creatoros.aitongban.cloud/updates/CreatorOS_1.2.0_e3151ce89_macos-arm64.dmg'
IP = '152.136.151.58'  # 独立DNS/TCPpeer报告；仅解析固定域名，不改变SNI/CA验证。
SHA = '5737445f53ec3af024596cecca34e4d8e404294ede0827191846bf0fb1193793'
SIZE = 845127298
ROOT = Path('/Volumes/T7-MacData/CodexBuilds/CreatorT246Delivery-20261017/external-verify')

def digest(path):
    value=hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):value.update(chunk)
    return value.hexdigest()

def collect():
    if platform.system() != 'Darwin':raise RuntimeError('必须从本轮Mac工作机发起，不在origin主机自测冒充外部下载')
    ROOT.mkdir(mode=0o700)
    partial=ROOT/'CreatorOS-e315.dmg.partial';final=ROOT/'CreatorOS-e315.dmg'
    argv=['curl','--fail','--silent','--show-error','--proto','=https','--tlsv1.2','--connect-timeout','15','--max-time','900','--noproxy','*','--resolve','creatoros.aitongban.cloud:443:'+IP,'--output',str(partial),'--write-out','%{http_code} %{remote_ip} %{ssl_verify_result}',URL]
    run=subprocess.run(argv,capture_output=True,text=True,timeout=930)
    (ROOT/'curl.stderr.log').write_text(run.stderr);os.chmod(ROOT/'curl.stderr.log',0o600)
    fields=run.stdout.strip().split()
    if run.returncode or fields != ['200',IP,'0']:raise RuntimeError('HTTPS状态/peer/证书验证失败，保partial及错误日志，不改线上入口')
    if not partial.is_file() or partial.stat().st_size!=SIZE or digest(partial)!=SHA:raise RuntimeError('完整外部下载字节/SHA不符，原入口保持')
    os.chmod(partial,0o600)
    os.link(partial,final);partial.unlink()
    fd=os.open(ROOT,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(fd)
    finally:os.close(fd)
    result={'url':URL,'sha256':SHA,'bytes':SIZE,'tlsVerified':True,'externalToOriginHost':True,'httpStatus':200,'curlVerifyResult':0,'curlRemoteIP':IP,'collectorHostPlatform':platform.system(),'collectorSourceSHA256':digest(Path(__file__)),'collectedAtUnix':time.time(),'command':argv,'downloadPath':str(final),'limits':'固定公开DNS已核IP解析，实际Mac跨网络HTTPS；仍用域名SNI及系统CA验证，无-k/无新信任根，不是本机文件复制'}
    p=ROOT/'external-download-receipt.json'
    with p.open('x') as out:
        os.chmod(p,0o600);json.dump(result,out,ensure_ascii=False,indent=2);out.write('\n');out.flush();os.fsync(out.fileno())
    print(json.dumps({'receipt':str(p),'receiptSHA256':digest(p),'downloadSHA256':SHA},ensure_ascii=False))

if __name__=='__main__':
    try:collect()
    except Exception as exc:print(type(exc).__name__+': '+str(exc));sys.exit(2)
