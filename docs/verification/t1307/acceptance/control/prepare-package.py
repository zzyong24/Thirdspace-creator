from pathlib import Path
import json,subprocess,tempfile,hashlib,re,tomllib
repo=Path.cwd();root=repo/'docs/verification/t1307/acceptance/candidate'
def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
old=Path('docs/verification/t1304/acceptance/candidate/candidate-binding.json');o=json.loads(old.read_text())
assert sha(o['dmgPath'])==o['dmgSha256'];assert sha(Path(o['appPath'])/'Contents/MacOS/CreatorOS')==o['binarySha256'];assert sha(Path(o['appPath'])/'Contents/Resources/sidecar.tar.gz')==o['sidecarTarSha256']
backup=Path(tempfile.mkdtemp(prefix='t1307-before-final-',dir='/private/tmp'));bundle=repo/'frontend/src-tauri/target/release-fast/bundle';dmg=Path.home()/'Downloads/CreatorOS-1.2.0.dmg'
for a,b in [(bundle,backup/'bundle'),(dmg,backup/'CreatorOS-1.2.0.dmg')]:subprocess.run(['cp','-cRp',str(a),str(b)],check=True,timeout=900)
versions={'package':json.load(open('frontend/package.json'))['version'],'tauri':json.load(open('frontend/src-tauri/tauri.conf.json'))['version'],'Cargo.toml':tomllib.load(open('frontend/src-tauri/Cargo.toml','rb'))['package']['version'],'Cargo.lock':next(x['version'] for x in tomllib.load(open('frontend/src-tauri/Cargo.lock','rb'))['package'] if x['name']==tomllib.load(open('frontend/src-tauri/Cargo.toml','rb'))['package']['name'])};assert set(versions.values())=={'1.2.0'}
files=subprocess.check_output(['git','diff','--name-only','origin/main...HEAD'],text=True).splitlines();commits=subprocess.check_output(['git','log','--format=%H %s','origin/main..HEAD'],text=True).splitlines();suspicious=[p for p in files if re.search(r'(^|/)(id_rsa|id_ed25519|\.env(?:\.[^/]*)?|[^/]+\.(?:p12|pfx|key|pem))$',p,re.I) and not re.search(r'(test|fixture|example|sample)',p,re.I)];assert not suspicious,suspicious
installed=Path('/Applications/CreatorOS.app');installedHashes={'binarySha256':sha(installed/'Contents/MacOS/CreatorOS'),'sidecarTarSha256':sha(installed/'Contents/Resources/sidecar.tar.gz')};assert installedHashes==o['installedAppReadonlyHashes']
p={'versions':versions,'originCommitCount':len(commits),'originFileCount':len(files),'suspiciousSecretPaths':suspicious,'rollbackRoot':str(backup),'rollbackDmgSHA':sha(backup/'CreatorOS-1.2.0.dmg'),'rollbackBinarySHA':sha(backup/'bundle/macos/CreatorOS.app/Contents/MacOS/CreatorOS'),'rollbackSidecarSHA':sha(backup/'bundle/macos/CreatorOS.app/Contents/Resources/sidecar.tar.gz'),'priorCfbafBindingSHA':sha(old),'prior8cedArtifactHashesRechecked':True,'priorArtifactRootPreserved':o['artifactRoot'],'installedAppReadonlyHashes':installedHashes,'explicitPackageEnv':{'CREATOROS_LOCAL_SKIP_INSTALL':'1'},'acceptanceOwnerTask':'T-1307','parentTask':'T-1300','candidateLabel':'final-t1307-t1308','newOwnedDatabaseRequired':True,'formalAppChangesAllowed':False,'T1301HistoricalRisk':'真人已限定accepted-risk，仅完整素材组合前RED历史缺项，原证据不改','businessAcceptance':'pending'}
(root/'prepare-package.json').write_text(json.dumps(p,ensure_ascii=False,indent=2)+'\n');(root/'SOURCE_VS_ORIGIN.json').write_text(json.dumps({'relativeTo':'origin/main 本地既有ref未fetch','commits':commits,'files':files,'pathSafety':'全部来源历史已在前轮审查；本轮新增范围独立审查、owned日志按真实SHA/握手精确扫描，不输出秘密'},ensure_ascii=False,indent=2)+'\n');print(json.dumps({'backup':str(backup),'versions':versions,'priorArtifactPreserved':True,'installedUnchanged':True}))
