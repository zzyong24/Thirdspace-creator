#!/usr/bin/env python3
"""只部署本任务明确的两站展示文件；hash前置检查、备份、nginx校验与失败回滚。"""
from pathlib import Path
from hashlib import sha256
import io,json,subprocess,tarfile
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'docs/verification/t1434/r3'
BASE=Path('/tmp/creatoros-t1434-r3')
HOST='root@152.136.151.58'
files={}
for source in sorted((ROOT/'website/shots/real').glob('*.webp')):
 for site in ('main','buy'):files[f'{site}/shots/real/{source.name}']=source
for name in ['robots.txt','sitemap.xml','index.html']:files['main/'+name]=ROOT/'website'/name
for name in ['creatoros/index.html','products/creatoros.json','assets/screenshots.css','assets/screenshots.js','robots.txt','sitemap.xml']:files['buy/'+name]=ROOT/'website/buy'/name
files['buy-nginx.conf']=ROOT/'website/buy/deploy/nginx-creatoros-buy.conf'
def target(key):
 if key=='buy-nginx.conf':return '/etc/nginx/conf.d/creatoros-buy.conf'
 site,rest=key.split('/',1);return '/var/www/'+('creatoros' if site=='main' else 'creatoros-buy')+'/'+rest
hashfile=lambda p:sha256(p.read_bytes()).hexdigest()
# 文件清单是本地构造的常量路径，不接受远程返回的shell指令。
read_script='''from pathlib import Path
from hashlib import sha256
import json
paths=PATHS
print(json.dumps({s:sha256(Path(s).read_bytes()).hexdigest() if Path(s).is_file() else None for s in paths}))
'''.replace('PATHS',repr([target(k) for k in files]))
remote=subprocess.run(['ssh','-o','BatchMode=yes',HOST,'python3','-'],input=read_script,text=True,capture_output=True,check=True)
before=json.loads(remote.stdout)
known={target('main/index.html'):hashfile(BASE/'website-before.html'),target('buy/products/creatoros.json'):hashfile(OUT/'buy-product-before.json'),target('buy-nginx.conf'):hashfile(BASE/'buy-nginx-before.conf')}
for p,h in known.items():
 if before[p]!=h:raise SystemExit('线上已变更，请先合并最新内容：'+p)
manifest=[dict(member=k,target=target(k),before_sha256=before[target(k)],after_sha256=hashfile(p)) for k,p in files.items()]
archive=BASE/'sites-candidate.tar'
with tarfile.open(archive,'w') as tar:
 for key,path in files.items():tar.add(path,arcname=key,recursive=False)
 payload=json.dumps(manifest).encode();info=tarfile.TarInfo('manifest.json');info.size=len(payload);tar.addfile(info,io.BytesIO(payload))
(OUT/'deploy-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
subprocess.run(['scp','-q',str(archive),HOST+':/tmp/creatoros-sites-t1434-r3.tar'],check=True)
activate=r'''
from pathlib import Path
from hashlib import sha256
from datetime import datetime,timezone
import json,tarfile,os,subprocess,shutil
roots=[Path('/var/www/creatoros'),Path('/var/www/creatoros-buy')]
conf=Path('/etc/nginx/conf.d/creatoros-buy.conf')
hashbytes=lambda b:sha256(b).hexdigest()
def write(path,data,mode=0o644):
 path.parent.mkdir(parents=True,exist_ok=True)
 temp=path.with_name(path.name+'.t1434-pending');temp.write_bytes(data);os.chmod(temp,mode);os.replace(temp,path)
with tarfile.open('/tmp/creatoros-sites-t1434-r3.tar') as tar:
 manifest=json.load(tar.extractfile('manifest.json'))
 payload={r['member']:tar.extractfile(r['member']).read() for r in manifest}
owned={r['target'] for r in manifest}
for r in manifest:
 p=Path(r['target']);assert p==conf or any(p.resolve().is_relative_to(root) for root in roots),'路径越界'
 assert not p.is_symlink(),'不覆盖符号链接'
 assert (hashbytes(p.read_bytes()) if p.is_file() else None)==r['before_sha256'],'线上变化，停止覆盖：'+str(p)
 assert hashbytes(payload[r['member']])==r['after_sha256']
protected={}
for root in roots:
 for p in root.rglob('*'):
  if p.is_file() and str(p) not in owned:
   st=p.stat();protected[str(p)]=(st.st_size,st.st_mtime_ns,st.st_ino)
critical=['/var/www/creatoros-buy/index.html','/var/www/creatoros-buy/assets/store.js','/var/www/creatoros-buy/assets/store.css','/var/www/creatoros-buy/products/moving.json']
critical_hashes={p:hashbytes(Path(p).read_bytes()) for p in critical}
backup=Path('/var/backups/creatoros-t1434')/('r3-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
backup.mkdir(parents=True,exist_ok=False)
originals={}
for i,r in enumerate(manifest):
 p=Path(r['target']);originals[str(p)]=(p.read_bytes(),p.stat().st_mode & 0o777) if p.is_file() else None
 if p.is_file():shutil.copy2(p,backup/f'{i:02d}-{p.name}')
(backup/'manifest.json').write_text(json.dumps(manifest,indent=2))
changed=[]
try:
 for r in manifest:
  p=Path(r['target'])
  assert (hashbytes(p.read_bytes()) if p.is_file() else None)==r['before_sha256'],'写入前线上变化：'+str(p)
  write(p,payload[r['member']],originals[str(p)][1] if originals[str(p)] else 0o644);changed.append(str(p))
 check=subprocess.run(['nginx','-t'],capture_output=True,text=True)
 if check.returncode:raise RuntimeError(check.stderr)
 subprocess.run(['systemctl','reload','nginx'],check=True)
 for path,metadata in protected.items():
  st=Path(path).stat();assert (st.st_size,st.st_mtime_ns,st.st_ino)==metadata,'无关文件发生变化：'+path
 for path,h in critical_hashes.items():assert hashbytes(Path(path).read_bytes())==h,'共享购买逻辑或Moving发生变化'
 for r in manifest:assert hashbytes(Path(r['target']).read_bytes())==r['after_sha256']
except BaseException:
 for path in reversed(changed):
  if originals[path]:write(Path(path),*originals[path])
  else:Path(path).unlink(missing_ok=True)
 subprocess.run(['nginx','-t'],check=True);subprocess.run(['systemctl','reload','nginx'],check=True)
 raise
print(json.dumps({'status':'已部署','backup':str(backup),'files':len(manifest),'protected_files_unchanged':len(protected),'shared_store_and_moving_unchanged':True,'critical_hashes':critical_hashes,'nginx_test':check.stderr.strip(),'deployed_at':datetime.now(timezone.utc).isoformat()},ensure_ascii=False,indent=2))
'''
result=subprocess.run(['ssh','-o','BatchMode=yes',HOST,'python3','-'],input=activate,text=True,capture_output=True)
(OUT/'deploy-stdout.log').write_text(result.stdout)
(OUT/'deploy-stderr.log').write_text(result.stderr)
if result.returncode:raise SystemExit(result.stderr)
(OUT/'deployment.json').write_text(result.stdout);print(result.stdout)
