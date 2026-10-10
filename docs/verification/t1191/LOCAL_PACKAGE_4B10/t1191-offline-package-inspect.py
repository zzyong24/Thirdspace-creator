from pathlib import Path
import subprocess,hashlib,json,plistlib,tarfile,datetime,os
w=Path('/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator');n=Path('/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009');head=json.loads((n/'package-source-freeze-t1191.json').read_text())['head']
def digest(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
def git(*a):return subprocess.check_output(['git',*a],cwd=w)
def command(a):
 r=subprocess.run(a,capture_output=True);return {'argv':a,'exitCode':r.returncode,'stdout':r.stdout.decode(errors='replace'),'stderr':r.stderr.decode(errors='replace')}
frozen=json.loads((n/'package-source-freeze-t1191.json').read_text());build=json.loads((n/'t1191-local-package.json').read_text());assert build['exitCode']==0 and frozen['head']==head and git('rev-parse','HEAD').decode().strip()==head and not git('status','--porcelain=v1')
changes=[]
for path,sha in frozen['trackedSourceHashes'].items():
 p=w/path;cur='symlink:'+os.readlink(p) if p.is_symlink() else digest(p)
 if cur!=sha:changes.append(path)
assert not changes,changes
artifact=Path('/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg');assert artifact.is_file()
bundle=w/'frontend/src-tauri/target/release-fast/bundle';att=json.loads((bundle/'creatoros-release-attestation.json').read_text());assert att['releaseCommits']['creator']==head
ash=digest(artifact);matching=[x for x in att['artifacts'] if x['sha256']=='sha256:'+ash and x['path'].endswith('.dmg')];assert len(matching)==1;builtArtifact=bundle/matching[0]['path'];assert digest(builtArtifact)==ash
verify=command(['hdiutil','verify',str(artifact)]);assert verify['exitCode']==0,verify
mount=n/'t1191-package-mount';mount.mkdir(exist_ok=False)
r=subprocess.run(['hdiutil','attach','-readonly','-nobrowse','-plist','-mountpoint',str(mount),str(artifact)],capture_output=True);assert r.returncode==0, r.stderr.decode();pl=plistlib.loads(r.stdout);assert any(e.get('mount-point')==str(mount) for e in pl['system-entities'])
result={'head':head,'artifactPath':str(artifact),'artifactSha256':ash,'artifactBytes':artifact.stat().st_size,'versions':frozen['versions'],'buildCommand':build,'trackedSourceHashChanges':changes,'releaseAttestationCreator':att['releaseCommits']['creator'],'hdiutilVerify':verify,'nativeAppLaunched':False,'userAppOrDataBackup':False,'installedToApplications':False,'mountedReadOnly':True}
try:
 app=mount/'CreatorOS.app';builtapp=bundle/'macos/CreatorOS.app';binary=app/'Contents/MacOS/CreatorOS';tar=app/'Contents/Resources/sidecar.tar.gz';canonical=w/'frontend/src-tauri/sidecar.tar.gz';builtTar=builtapp/'Contents/Resources/sidecar.tar.gz'
 assert digest(binary)=='%s'%att['productIdentity']['binarySha256'].split(':',1)[1] and digest(binary)==digest(builtapp/'Contents/MacOS/CreatorOS')
 tsh=digest(tar);assert tsh==digest(canonical)==digest(builtTar)
 info=plistlib.loads((app/'Contents/Info.plist').read_bytes());assert info['CFBundleIdentifier']=='cloud.aitongban.creatoros' and info['CFBundleShortVersionString']=='1.2.0'
 code=command(['codesign','--verify','--deep','--strict','--verbose=2',str(app)]);assert code['exitCode']==0,code
 signature=command(['codesign','-d','--verbose=4',str(app)]);assert signature['exitCode']==0 and 'Signature=adhoc' in signature['stderr'];result.update({'bundleId':info['CFBundleIdentifier'],'bundleVersion':info['CFBundleShortVersionString'],'shellSha256':digest(binary),'runtimeTarSha256':tsh,'runtimeTarMatchesCanonical':True,'codesignVerification':code,'signature':'ad-hoc','notarized':False})
 targets={'frontend/browsers/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing','frontend/server.js','server.app/Contents/MacOS/creatoros-server','backend/drizzle/meta/_journal.json','backend/drizzle/0131_platform_native_reports.sql','frontend/.next/server/verdict-verify-key.json'};records=[];total=0
 with tarfile.open(tar,'r|gz') as stream:
  for member in stream:
   total+=1;name=member.name.removeprefix('./');assert not name.startswith('/') and '..' not in Path(name).parts
   if name in targets:
    assert member.isfile();f=stream.extractfile(member);h=hashlib.sha256()
    for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    sha=h.hexdigest();assert sha==digest(w/'frontend/src-tauri/sidecar'/name);records.append({'path':name,'bytes':member.size,'sha256':sha,'matchesCurrentRuntime':True})
 assert {x['path'] for x in records}==targets,records;result.update({'tarEntries':total,'selectedRuntimeFiles':records})
finally:
 detached=command(['hdiutil','detach',str(mount)]);result['detach']=detached;assert detached['exitCode']==0,detached
result['verifiedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();out=n/'t1191-offline-package-inspection.json';assert not out.exists();out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');out.chmod(0o600)
print(json.dumps({'head':head,'artifactPath':str(artifact),'artifactSha256':ash,'artifactBytes':result['artifactBytes'],'codesignVerify':0,'hdiutilVerify':0,'trackedSourceChanges':len(changes),'runtimeTarMatchesCanonical':True,'signature':'ad-hoc','notarized':False,'nativeAppLaunched':False},ensure_ascii=False))
