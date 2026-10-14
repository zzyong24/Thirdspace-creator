from pathlib import Path
import tarfile,json,hashlib,subprocess,shutil
repo=Path('/Users/zyongzhu/.codex/worktrees/t1274-native-workspace/Thirdspace-creator');native=repo/'reference-editors/opencut-classic/native';proof=Path('/tmp/t1274-native-geometry-proof');source=Path('/tmp/creatoros-t1274-preview-isolated');patched=Path('/tmp/t1274-native-geometry-reconstructed');archive=Path('/tmp/t1274-native-geometry-archive')
for root,tar in [(patched,repo/'reference-editors/opencut-classic/source.tar.gz'),(archive,native/'native-source.tar.gz')]:
 root.mkdir(exist_ok=True)
 with tarfile.open(tar,'r:gz') as tf:tf.extractall(root,filter='data')
with (proof/'patch-fuzz0.log').open('w') as log:
 for args in [['patch','--dry-run','--fuzz=0','-p1','-i',str(native/'native-from-t1046.patch')],['patch','--fuzz=0','-p1','-i',str(native/'native-from-t1046.patch')]]:subprocess.run(args,cwd=patched,stdout=log,stderr=subprocess.STDOUT,check=True,timeout=900)
manifest=json.loads((proof/'source-manifest.json').read_text());names=manifest['sourceHashManifest'];mismatch=[]
for name,sha in names.items():
 for root in [source,patched,archive]:
  if hashlib.sha256((root/name).read_bytes()).hexdigest()!=sha:mismatch.append(str(root/name))
assert not mismatch,mismatch
(proof/'source-reconstruction.json').write_text(json.dumps({'status':'PASS','files':len(names),'standardPatchFuzz':0,'patchedArchiveAndExpandedAllBytesMatch':True,'sourceArchiveSha256':hashlib.sha256((native/'native-source.tar.gz').read_bytes()).hexdigest(),'patchSha256':hashlib.sha256((native/'native-from-t1046.patch').read_bytes()).hexdigest()},indent=2)+'\n')
for relative in ['node_modules','apps/web/node_modules']:
 (archive/relative).symlink_to((source/relative).resolve(),target_is_directory=True)
with (proof/'archive-production-build.log').open('w') as log:subprocess.run(['bun','apps/web/scripts/build-native.mjs'],cwd=archive,stdout=log,stderr=subprocess.STDOUT,check=True,timeout=900)
outputs={};mismatch=[]
for name,sha in manifest['outputs'].items():
 outputs[name]={}
 for root in [archive/'apps/web/native-dist',source/'apps/web/native-dist',native,repo/'frontend/public/reference-editors/opencut-classic/native']:
  value=hashlib.sha256((root/name).read_bytes()).hexdigest();outputs[name][str(root)]=value
  if value!=sha:mismatch.append(str(root/name))
assert not mismatch,mismatch
(proof/'production-reconstruction.json').write_text(json.dumps({'status':'PASS','outputs':outputs,'sevenArchiveSourceAndBothPublishedBytesMatch':True,'fixturePublished':False,'freshDependencyInstall':True,'crossOS':'not_claimed'},indent=2)+'\n')
print(json.dumps({'status':'PASS','sourceFiles':len(names),'patchFuzz':0,'outputs':len(outputs),'allBytesMatch':True}))
