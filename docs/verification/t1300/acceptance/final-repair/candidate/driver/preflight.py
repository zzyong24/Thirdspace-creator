from pathlib import Path
import json,subprocess,hashlib,re,shutil,tempfile,os,tomllib
repo=Path.cwd().resolve();r=Path(__file__).resolve().parent.parent
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
assert not subprocess.check_output(['git','status','--porcelain'],text=True).strip(),'必须先冻结所有源/test并精确提交'
subprocess.run(['git','diff','--check'],check=True)
def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for data in iter(lambda:f.read(1024*1024),b''):h.update(data)
 return h.hexdigest()
versions={'package':json.load(open('frontend/package.json'))['version'],'tauri':json.load(open('frontend/src-tauri/tauri.conf.json'))['version']}
cargo=tomllib.loads(Path('frontend/src-tauri/Cargo.toml').read_text());versions['Cargo.toml']=cargo['package']['version']
lock=tomllib.loads(Path('frontend/src-tauri/Cargo.lock').read_text());versions['Cargo.lock']=next(p['version'] for p in lock['package'] if p['name']==cargo['package']['name']);assert set(versions.values())=={'1.2.0'}
old_binding=json.load(open('docs/verification/t1313/acceptance/candidate/candidate-binding.json'))
assert sha(old_binding['dmgPath'])==old_binding['dmgSha256']
rollback=Path(tempfile.mkdtemp(prefix='t1300-final-before-build-',dir='/private/tmp'));os.chmod(rollback,0o700)
old=Path.home()/'Downloads/CreatorOS-1.2.0.dmg';subprocess.run(['cp','-c',str(old),str(rollback/old.name)],check=True)
installed=Path('/Applications/CreatorOS.app');ih={'binarySha256':sha(installed/'Contents/MacOS/CreatorOS'),'sidecarTarSha256':sha(installed/'Contents/Resources/sidecar.tar.gz')};assert ih==old_binding['installedAppReadonlyHashes']
changed=subprocess.check_output(['git','diff','--name-only','origin/main...HEAD'],text=True).splitlines()
suspicious=[p for p in changed if re.search(r'(?i)(?:^|/)(?:\.env(?:\.|$)|[^/]*private[-_]?key[^/]*|session\.json|[^/]*channel[-_]manifest[^/]*)',p)]
secrets=[json.load(open(p))['handshake'].encode() for p in ['/private/tmp/t1300-candidate-qyb5ZR/session.json','/private/tmp/t1300-candidate-MhP4pW/session.json']]
current=subprocess.check_output(['git','diff','--name-only','0e1dc6228f1fa3dc02f2b1c7a1cee77ab18d650a..HEAD'],text=True).splitlines();hits=[]
for p in current:
 f=Path(p)
 if f.is_file():
  data=f.read_bytes()
  if any(s in data for s in secrets):hits.append(p)
assert not hits
(r/'prepare-package.json').write_text(json.dumps({'sourceHead':head,'versions':versions,'originChangedFileCount':len(changed),'suspiciousSecretPaths':suspicious,'actualTwoOwnedHandshakeHits':hits,'scanLimit':'仅实际两握手值与路径规则；各实现独审已有有限秘密扫描另存，不冒穷尽保证','rollbackRoot':str(rollback),'rollbackDmgSha256':sha(rollback/old.name),'oldArtifactsPreserved':['/private/tmp/t1300-artifact-940jy2at','/private/tmp/t1300-artifact-bcz9nlt5'],'installedAppReadonlyHashes':ih,'versionBumpRequested':False,'installAllowed':False,'externalModelAuthorization':'仍待真人回答；本地构包与无外部模型的合法Tab样本可继续'},ensure_ascii=False,indent=2)+'\n')
sourcepaths=subprocess.check_output(['git','diff','--name-only','0e1dc6228f1fa3dc02f2b1c7a1cee77ab18d650a..HEAD','--','backend/src','frontend/src','contract/src'],text=True).splitlines()
(r/'freeze-preflight.json').write_text(json.dumps({'sourceHead':head,'workingTreeClean':True,'branch':subprocess.check_output(['git','branch','--show-current'],text=True).strip(),'fixedCommand':'CREATOROS_LOCAL_SKIP_INSTALL=1 pnpm -C frontend desktop:package-local','sourceHashes':{p:sha(p) for p in sourcepaths if Path(p).is_file()},'actualT1323CodeCommit':'1679fa52656281efbe02ab1dc6b67aa6c6ae41bd','actualT1325CodeCommit':'d926d7d304060acbdcdb7df4b10823f2ef5d71a6','actualT1312CodeCommit':'4e73d0f59be2bd44eaace8b2be9253106480b326','T1312CorrectionReceipt':'docs/verification/t1312/control/DONE_COMMIT_CORRECTION_RECEIPT.json','formalAppChangesAllowed':False,'oldControllersKept':[32328,94030],'nativeShellStarted':False},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'sourceHead':head,'versions':versions,'suspiciousPaths':suspicious,'actualHandshakeHits':0,'rollbackRoot':str(rollback)},ensure_ascii=False))
