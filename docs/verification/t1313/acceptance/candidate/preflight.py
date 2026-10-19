from pathlib import Path
import json,subprocess,hashlib,re,shutil,tempfile,os,tomllib
r=Path(__file__).resolve().parent
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
assert not subprocess.check_output(['git','status','--porcelain'],text=True).strip()
subprocess.run(['git','diff','--check'],check=True)
versions={'package':json.load(open('frontend/package.json'))['version'],'tauri':json.load(open('frontend/src-tauri/tauri.conf.json'))['version']}
cargo=tomllib.loads(Path('frontend/src-tauri/Cargo.toml').read_text());versions['Cargo.toml']=cargo['package']['version']
lock=tomllib.loads(Path('frontend/src-tauri/Cargo.lock').read_text());versions['Cargo.lock']=next(p['version'] for p in lock['package'] if p['name']==cargo['package']['name'])
assert len(set(versions.values()))==1,versions
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
rollback=Path(tempfile.mkdtemp(prefix='t1313-before-build-',dir='/private/tmp'));os.chmod(rollback,0o700)
old=Path.home()/'Downloads/CreatorOS-1.2.0.dmg';shutil.copy2(old,rollback/old.name)
installed=Path('/Applications/CreatorOS.app');ih={'binarySha256':sha(installed/'Contents/MacOS/CreatorOS'),'sidecarTarSha256':sha(installed/'Contents/Resources/sidecar.tar.gz')}
prior=json.load(open('docs/verification/t1307/acceptance/candidate/candidate-binding.json'));assert ih==prior['installedAppReadonlyHashes'];assert sha(prior['dmgPath'])==prior['dmgSha256']
changed=subprocess.check_output(['git','diff','--name-only','origin/main...HEAD'],text=True).splitlines()
sus=[p for p in changed if re.search(r'(?i)(?:^|/)(?:\.env(?:\.|$)|[^/]*private[-_]?key[^/]*|session\.json|[^/]*channel[-_]manifest[^/]*)',p)]
secret=json.load(open('/private/tmp/t1300-candidate-MhP4pW/session.json'))['handshake'].encode();hits=[]
for p in subprocess.check_output(['git','diff','--name-only','dc46cfa700ec9c9cbada47fb76237d0b50d10a67..HEAD'],text=True).splitlines():
 f=Path(p)
 if f.is_file() and secret in f.read_bytes():hits.append(p)
assert not hits
(r/'prepare-package.json').write_text(json.dumps({'versions':versions,'originChangedFileCount':len(changed),'suspiciousSecretPaths':sus,'actualCurrentHandshakeHits':hits,'rollbackRoot':str(rollback),'rollbackDmgSha256':sha(rollback/old.name),'oldArtifactPreserved':prior['artifactRoot'],'installedAppReadonlyHashes':ih,'sourceHead':head,'versionBumpRequested':False,'preflightAttempt1':'仅检查脚本错误假定Cargo package name=creatoros，未运行build，按真实creatoros-desktop机械修正后检查'},ensure_ascii=False,indent=2)+'\n')
prod=['backend/src/modules/review/work-reviews.service.ts','backend/src/modules/review/work-review-task-adapter.ts','backend/src/application/generation/work-review-root.ts','frontend/src/server/persistence-client.ts','backend/src/modules/calibration/default-rubric.ts']
(r/'freeze-preflight.json').write_text(json.dumps({'sourceHead':head,'workingTreeClean':True,'branch':subprocess.check_output(['git','branch','--show-current'],text=True).strip(),'fixedCommand':'CREATOROS_LOCAL_SKIP_INSTALL=1 pnpm -C frontend desktop:package-local','sourceHashes':{p:sha(p) for p in prod},'T1313ProductCommit':'61de58c711f825e02de46dc3b9475a8cedaec4b2','T1312ProductCommit':'4e73d0f59be2bd44eaace8b2be9253106480b326','T1312CorrectionReceipt':'docs/verification/t1312/control/DONE_COMMIT_CORRECTION_RECEIPT.json','formalAppChangesAllowed':False,'newOwnedRoot':True,'oldControllerKept':94030},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'head':head,'versions':versions,'suspiciousSecretPaths':sus,'actualHandshakeHits':0,'rollbackRoot':str(rollback)},ensure_ascii=False))
