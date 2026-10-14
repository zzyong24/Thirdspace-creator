# 本轮一次性归档动作实录；会写固定worktree并前缀追加交付说明。复核请用verify-reconstruction.py/rebuild-native.sh，不重复执行此打包实录。
from pathlib import Path
import json,tarfile,hashlib,gzip,difflib,shutil,io
repo=Path('/Users/zyongzhu/.codex/worktrees/t1274-native-workspace/Thirdspace-creator')
ref=repo/'reference-editors/opencut-classic/native';src=Path('/tmp/creatoros-t1274-preview-isolated');proof=Path('/tmp/t1274-native-fit-proof')
basearchive=repo/'reference-editors/opencut-classic/source.tar.gz'
files7=['native.js','native.css','NATIVE_BUILD_GRAPH.json','THIRD_PARTY_LICENSES.json','THIRD_PARTY_LICENSES.txt','LICENSE.opencut','effects/preview.jpg']
hashbytes=lambda b:hashlib.sha256(b).hexdigest()
outputs={name:hashbytes((src/'apps/web/native-dist'/name).read_bytes()) for name in files7}
p=src/'README.creatoros.md';p.write_text("T-1274 单面板画面紧凑布局：按实际工程画幅与可视高度限高，播放工具栏紧随画面；其它单面板与桌面分栏保持。真实Chromium390/zoom2/横竖方画幅8场景通过，类型/71测试/58DOM通过。完整CreatorOS宿主由ROOT负责。\n\n"+p.read_text())
p=src/'NATIVE_REBUILD_CONSISTENCY.json';old=json.loads(p.read_text());old['historicalT1274PreviewBeforeFit']=old['t1274Preview'];old['t1274Preview']={'status':'SINGLE_PREVIEW_FIT_REAL_CHROMIUM_VERIFIED_FULL_HOST_PENDING_ROOT','files':outputs,'source':'单面板按真实画幅/可视高度限高，不改工程或渲染；8真实几何场景与归档再重建七份字节。'};p.write_text(json.dumps(old,ensure_ascii=False,indent=2)+'\n')
with tarfile.open(ref/'native-source.tar.gz','r:gz') as tf:members=[m.name.removeprefix('./') for m in tf if m.isfile()]
new=[]
members=sorted(set(members+new))
source={name:(src/name).read_bytes() for name in members}
with (ref/'native-source.tar.gz').open('wb') as raw:
 with gzip.GzipFile(filename='',fileobj=raw,mode='wb',mtime=0) as gz:
  with tarfile.open(fileobj=gz,mode='w') as tf:
   for name in members:
    data=source[name];info=tarfile.TarInfo('./'+name);info.size=len(data);info.mode=0o755 if name.endswith('.sh') else 0o644;tf.addfile(info,io.BytesIO(data))
with tarfile.open(basearchive,'r:gz') as tf:base={m.name.removeprefix('./'):tf.extractfile(m).read() for m in tf if m.isfile()}
patch=[];changed=[]
for name in sorted(set(base)|set(source)):
 before=base.get(name,b'');after=source.get(name,b'')
 if before==after:continue
 changed.append(name)
 lines=list(difflib.unified_diff(before.decode().splitlines(keepends=True),after.decode().splitlines(keepends=True),fromfile='a/'+name if name in base else '/dev/null',tofile='b/'+name if name in source else '/dev/null',n=3))
 for line in lines:
  if not line.endswith('\n'):patch.extend([line+'\n','\\ No newline at end of file\n'])
  else:patch.append(line)
(ref/'native-from-t1046.patch').write_bytes(''.join(patch).encode())
obj=json.loads((ref/'SOURCE_CHANGES.json').read_text());obj.update(nativeSourceFiles=len(source),changedFiles=changed,t1274ResponsiveFitChangedFiles=['apps/web/src/embedded/editor-layout.tsx','README.creatoros.md','NATIVE_REBUILD_CONSISTENCY.json']);(ref/'SOURCE_CHANGES.json').write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
for name in files7:
 for dest in [ref,repo/'frontend/public/reference-editors/opencut-classic/native']:
  (dest/name).parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src/'apps/web/native-dist'/name,dest/name)
proofjoin=ref/'verification/t1274-responsive-fit';proofjoin.mkdir(parents=True,exist_ok=True)
for log in proof.glob('*.log'):shutil.copyfile(log,proofjoin/log.name)
(proof/'source-manifest.json').write_text(json.dumps({'files':len(source),'changedFiles':len(changed),'sourceHashManifest':{n:hashbytes(b) for n,b in source.items()},'outputs':outputs},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'sourceFiles':len(source),'changedFiles':len(changed),'archiveBytes':(ref/'native-source.tar.gz').stat().st_size,'outputs':outputs}))
