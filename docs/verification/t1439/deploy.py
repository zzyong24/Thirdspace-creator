"""T-1439：只替换清单中的展示文件，哈希防漂移，保留回滚备份。"""
import hashlib,json,os,shutil,sys,tarfile
from pathlib import Path
stage=Path(sys.argv[1]);manifest=json.loads((stage/'deploy-manifest.json').read_text())
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
for f in manifest['files']:
 p=Path(f['destination'])
 if f['expectedBefore'] is None:
  if p.exists():raise RuntimeError(f'新增目标已存在：{p}')
 elif sha(p)!=f['expectedBefore']:raise RuntimeError(f'线上目标已变化：{p}')
protected={p:sha(p) for p in manifest['protected']}
backup=Path('/var/backups/creatoros-t1439')/stage.name
backup.mkdir(parents=True,exist_ok=False)
with tarfile.open(stage/'creatoros-t1439-payload.tar') as tar:
 for member in tar.getmembers():
  if member.name not in [f['source'] for f in manifest['files']] or not member.isfile():raise RuntimeError('未声明的上传内容')
 tar.extractall(stage/'payload',filter='data')
for f in manifest['files']:
 if sha(stage/'payload'/f['source'])!=f['sha256']:raise RuntimeError('上传哈希不匹配')
for f in manifest['files']:
 p=Path(f['destination'])
 if p.exists():
  saved=backup/p.relative_to('/');saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,saved)
# 媒体、样式先部署；页面和商品配置最后替换。
ordered=sorted(manifest['files'],key=lambda f: f['destination'].endswith(('.html','.json')))
for f in ordered:
 src=stage/'payload'/f['source'];dst=Path(f['destination']);dst.parent.mkdir(parents=True,exist_ok=True)
 tmp=dst.with_name(dst.name+'.t1439-tmp');shutil.copyfile(src,tmp);os.chmod(tmp,0o644);os.replace(tmp,dst)
assert {p:sha(p) for p in protected}==protected,'保护文件被改变'
for f in manifest['files']:assert sha(f['destination'])==f['sha256']
receipt={'task':'T-1439','backup':str(backup),'files':manifest['files'],'protectedBeforeAfter':protected,'status':'deployed'}
(backup/'receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(receipt,ensure_ascii=False,indent=2))
