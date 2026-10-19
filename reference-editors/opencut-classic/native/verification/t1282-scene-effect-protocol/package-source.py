# 本轮一次性归档动作实录；会写固定worktree并前缀追加交付说明。复核请用verify-reconstruction.py/rebuild-native.sh，不重复执行此打包实录。
from pathlib import Path
import json,tarfile,hashlib,gzip,difflib,shutil,io
repo=Path('/Users/zyongzhu/.codex/worktrees/t1274-native-workspace/Thirdspace-creator')
ref=repo/'reference-editors/opencut-classic/native';src=Path('/tmp/creatoros-t1274-preview-isolated');proof=Path('/tmp/t1282-native-protocol-proof')
basearchive=repo/'reference-editors/opencut-classic/source.tar.gz'
files7=['native.js','native.css','NATIVE_BUILD_GRAPH.json','THIRD_PARTY_LICENSES.json','THIRD_PARTY_LICENSES.txt','LICENSE.opencut','effects/preview.jpg']
hashbytes=lambda b:hashlib.sha256(b).hexdigest()
outputs={name:hashbytes((src/'apps/web/native-dist'/name).read_bytes()) for name in files7}
p=src/'README.creatoros.md';p.write_text("T-1282 场景效果协议兼容：仅WasmCompositor.render边界适配sceneEffect.effectPassGroups为effect_pass_groups；layer与无scene帧原对象直传，组序/参数/内部对象不变。真实WASM桥红测原错到7渲染/5像素关系验证通过；不升级WASM，不删除效果；完整三族公共MP4由ROOT复验。\n\n"+p.read_text())
p=src/'NATIVE_REBUILD_CONSISTENCY.json';old=json.loads(p.read_text());old['historicalT1274PreviewBeforeSceneEffectProtocol']=old['t1274Preview'];old['t1274Preview']={'status':'SCENE_EFFECT_ABI_REAL_GPU_VERIFIED_FULL_HOST_PENDING_ROOT','files':outputs,'source':'sceneEffect协议字段转换保持组序/参数和原对象；真实WASM桥RED到GREEN；归档七输出一致。'};p.write_text(json.dumps(old,ensure_ascii=False,indent=2)+'\n')
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
obj=json.loads((ref/'SOURCE_CHANGES.json').read_text());obj.update(nativeSourceFiles=len(source),changedFiles=changed,t1282SceneEffectProtocolChangedFiles=['apps/web/src/services/renderer/compositor/wasm-compositor.ts','README.creatoros.md','NATIVE_REBUILD_CONSISTENCY.json']);(ref/'SOURCE_CHANGES.json').write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
for name in files7:
 for dest in [ref,repo/'frontend/public/reference-editors/opencut-classic/native']:
  (dest/name).parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src/'apps/web/native-dist'/name,dest/name)
proofjoin=ref/'verification/t1282-scene-effect-protocol';proofjoin.mkdir(parents=True,exist_ok=True)
for log in proof.glob('*.log'):shutil.copyfile(log,proofjoin/log.name)
(proof/'source-manifest.json').write_text(json.dumps({'files':len(source),'changedFiles':len(changed),'sourceHashManifest':{n:hashbytes(b) for n,b in source.items()},'outputs':outputs},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'sourceFiles':len(source),'changedFiles':len(changed),'archiveBytes':(ref/'native-source.tar.gz').stat().st_size,'outputs':outputs}))
