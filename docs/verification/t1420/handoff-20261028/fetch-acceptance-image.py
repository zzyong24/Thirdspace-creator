from pathlib import Path
import subprocess,json,urllib.request,hashlib,sys,datetime
p=Path(__file__).parent
n=int(sys.argv[1]);name=f'reverify-image-{n:02}'
r=subprocess.run(['/Users/masx/.local/bin/creatoros','call','assets.fileDownloadUrl','--group','grp-8fdb2e06-22','--input','@'+str(p.resolve()/(name+'-file-input.json'))],capture_output=True,text=True)
if r.returncode:
 print('Public file URL call failed; no URL or credentials logged.');sys.exit(r.returncode)
d=json.loads(r.stdout);assert d['ok']
u=d['data']['url']
if u.startswith('/api/v1/blob/'):
 u='http://127.0.0.1:64542'+u # Current origin observed in CreatorOS native AX
assert u.startswith(('http://','https://'))
try:
 with urllib.request.urlopen(u,timeout=120) as resp:
  content_type=resp.headers.get('Content-Type');data=resp.read()
except Exception as e:
 print('Download failed: '+type(e).__name__);sys.exit(1)
suffix='.png' if data.startswith(b'\x89PNG\r\n\x1a\n') else '.jpg' if data.startswith(b'\xff\xd8') else '.bin'
f=p/(name+suffix);f.write_bytes(data)
meta={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'operation':'assets.fileDownloadUrl','groupId':'grp-8fdb2e06-22','requestId':d.get('requestId'),'fileName':d['data']['fileName'],'file':f.name,'contentType':content_type,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'urlSaved':False,**json.loads((p/(name+'-file-input.json')).read_text())['params']}
(p/(name+'-file-proof.json')).write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n');print(json.dumps(meta,ensure_ascii=False))
