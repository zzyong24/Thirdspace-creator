import subprocess,json,hashlib,tarfile,gzip,datetime
from pathlib import Path
n=Path(__file__).resolve().parent;w=Path('/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator');freeze=json.loads(gzip.decompress((n/'source-freeze.json.gz').read_bytes()));app=w/'frontend/src-tauri/target/release-fast/bundle/macos/CreatorOS.app';dmg=Path('/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg');mount=n/'package-mount'
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()
commands=[]
def run(a):
 r=subprocess.run(a,capture_output=True,text=True,timeout=1200);commands.append({'argv':a,'exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr});assert r.returncode==0,a;return r
assert not subprocess.check_output(['git','status','--porcelain=v1'],cwd=w).strip()
for f,h in freeze['trackedHashes'].items():assert sha(w/f)==h,f
run(['hdiutil','verify',str(dmg)]);run(['codesign','--verify','--deep','--strict','--verbose=2',str(app)])
mount.mkdir(exist_ok=True);run(['hdiutil','attach','-readonly','-nobrowse','-mountpoint',str(mount),str(dmg)])
try:
 mounted=mount/'CreatorOS.app';run(['codesign','--verify','--deep','--strict','--verbose=2',str(mounted)])
 for f in ['Contents/MacOS/CreatorOS','Contents/Resources/sidecar.tar.gz']:assert sha(app/f)==sha(mounted/f),f
finally:run(['hdiutil','detach',str(mount)])
entries={};markers=[]
with tarfile.open(app/'Contents/Resources/sidecar.tar.gz','r|gz') as t:
 for f in t:
  name=f.name.lstrip('./')
  if name in ['backend/drizzle/0132_legacy_scheduled_job_membership.sql','backend/drizzle/meta/_journal.json']:
   raw=t.extractfile(f).read();entries[name]=hashlib.sha256(raw).hexdigest();assert raw==(w/name).read_bytes(),name
  elif f.isfile() and (name.startswith('backend/dist/') or name in ['server.js','backend/index.js']):
   raw=t.extractfile(f).read()
   if b'consumer_rejection_observed' in raw:markers.append(name)
assert len(entries)==2,entries
r={'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceHead':freeze['head'],'version':'1.2.0','artifactPath':str(dmg),'artifactSha256':sha(dmg),'runtimeTarSha256':sha(app/'Contents/Resources/sidecar.tar.gz'),'shellSha256':sha(app/'Contents/MacOS/CreatorOS'),'migrationEntries':entries,'consumerMarkers':markers,'trackedSourceUnchanged':True,'dmgAndBuiltAppMatch':True,'notarized':False,'signature':'local-ad-hoc','commands':commands};(n/'package-inspection.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in r.items() if k!='commands'},ensure_ascii=False))
