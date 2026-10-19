# 本轮一次性归档动作实录；会写固定worktree并前缀追加交付说明。复核请用verify-reconstruction.py/rebuild-native.sh，不重复执行此打包实录。
from pathlib import Path
import json,tarfile,hashlib,gzip,difflib,shutil,io
repo=Path('/Users/zyongzhu/.codex/worktrees/t1274-native-workspace/Thirdspace-creator')
ref=repo/'reference-editors/opencut-classic/native';src=Path('/tmp/creatoros-t1274-preview-isolated');proof=Path('/tmp/creatoros-t1274-preview-center-proof')
basearchive=repo/'reference-editors/opencut-classic/source.tar.gz'
files7=['native.js','native.css','NATIVE_BUILD_GRAPH.json','THIRD_PARTY_LICENSES.json','THIRD_PARTY_LICENSES.txt','LICENSE.opencut','effects/preview.jpg']
hashbytes=lambda b:hashlib.sha256(b).hexdigest()
outputs={name:hashbytes((src/'apps/web/native-dist'/name).read_bytes()) for name in files7}
p=src/'README.creatoros.md';p.write_text("T-1274 中心候选预览闭包：第三named slot保持原预览实例，候选可见时锁原core/快捷键；compact header恢复原renameProject工程名。仅private export cache等待prefetch按实际PTS晋升，禁canvas池保同素材多层源帧；interactive沿原池。类型/71测试与DOM夹具已验；真实GPU、宿主E2E和最终48帧MP4由ROOT验，未签PASS。\n\n"+p.read_text())
p=src/'NATIVE_REBUILD_CONSISTENCY.json';old=json.loads(p.read_text());old['historicalT1274PreviewBeforeCenter']=old['t1274Preview'];old['t1274Preview']={'status':'SOURCE_BUILD_DOM_FIXTURE_VERIFIED_FINAL_REAL_MEDIA_PENDING_ROOT','files':outputs,'source':'中心slot、原工程名及private exact cache闭包；将从归档再次重建比较七份字节。'};p.write_text(json.dumps(old,ensure_ascii=False,indent=2)+'\n')
with tarfile.open(ref/'native-source.tar.gz','r:gz') as tf:members=[m.name.removeprefix('./') for m in tf if m.isfile()]
new=[p.relative_to(src).as_posix() for p in (src/'apps/web/src/embedded').glob('*workspace.tsx')]+[p.relative_to(src).as_posix() for p in (src/'apps/web/src/embedded/__tests__').glob('native-preview*.test.ts')]
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
obj=json.loads((ref/'SOURCE_CHANGES.json').read_text());obj.update(nativeSourceFiles=len(source),changedFiles=changed,t1274PreviewCenterChangedFiles=new+['apps/web/src/services/video-cache/service.ts','apps/web/src/embedded/native-host.ts','apps/web/src/components/editor/editor-header.tsx','apps/web/src/embedded/native-visibility.tsx','apps/web/src/embedded/editor-layout.tsx','apps/web/scripts/build-native.mjs','apps/web/src/embedded/__tests__/native-resources.test.ts']+['apps/web/src/embedded/native-controller.ts','apps/web/src/core/managers/renderer-manager.ts','apps/web/src/media/audio.ts','apps/web/src/services/renderer/canvas-renderer.ts','apps/web/src/services/renderer/resolve.ts','apps/web/src/services/renderer/scene-exporter.ts','apps/web/src/services/renderer/nodes/image-node.ts','apps/web/src/services/renderer/nodes/sticker-node.ts','README.creatoros.md','NATIVE_REBUILD_CONSISTENCY.json']);(ref/'SOURCE_CHANGES.json').write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
for name in files7:
 for dest in [ref,repo/'frontend/public/reference-editors/opencut-classic/native']:
  (dest/name).parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src/'apps/web/native-dist'/name,dest/name)
proofjoin=ref/'verification/t1274-preview-center';proofjoin.mkdir(parents=True,exist_ok=True)
for log in proof.glob('*.log'):shutil.copyfile(log,proofjoin/log.name)
(proof/'source-manifest.json').write_text(json.dumps({'files':len(source),'changedFiles':len(changed),'sourceHashManifest':{n:hashbytes(b) for n,b in source.items()},'outputs':outputs},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'sourceFiles':len(source),'changedFiles':len(changed),'archiveBytes':(ref/'native-source.tar.gz').stat().st_size,'outputs':outputs}))
