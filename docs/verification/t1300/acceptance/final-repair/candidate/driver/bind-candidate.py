import pathlib,subprocess,json,tempfile,hashlib,os,shutil,tarfile,posixpath
repo=pathlib.Path.cwd().resolve();evidence=pathlib.Path(__file__).resolve().parent.parent;bundle=repo/'frontend/src-tauri/target/release-fast/bundle';head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip();assert head==json.loads((evidence/'freeze-preflight.json').read_text())['sourceHead'];assert not subprocess.check_output(['git','status','--porcelain'],text=True).strip()
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
root=pathlib.Path(tempfile.mkdtemp(prefix='t1300-artifact-',dir='/private/tmp'));os.chmod(root,0o700)
app=root/'CreatorOS.app';dmg=root/'CreatorOS-1.2.0.dmg'
for a,b in [(bundle/'macos/CreatorOS.app',app),(pathlib.Path.home()/'Downloads/CreatorOS-1.2.0.dmg',dmg)]:subprocess.run(['cp','-cRp',str(a),str(b)],check=True)
for name in ['creatoros-product-manifest.json','creatoros-release-attestation.json','creatoros-release-manifest.json']:shutil.copy2(bundle/name,evidence/name)
att=json.loads((evidence/'creatoros-release-attestation.json').read_text());assert att['releaseCommits']['creator']==head;assert sha(app/'Contents/MacOS/CreatorOS')==att['productIdentity']['binarySha256'].removeprefix('sha256:');assert sha(dmg)==att['artifacts'][0]['sha256'].removeprefix('sha256:');assert sha(evidence/'creatoros-product-manifest.json')==att['productIdentity']['manifestSha256'].removeprefix('sha256:')
checks=[]
for name,cmd in [('dmg-verify',['hdiutil','verify',str(dmg)]),('codesign-verify',['codesign','--verify','--deep','--strict','--verbose=2',str(app)])]:
 r=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True);(evidence/(name+'.log')).write_text(r.stdout);checks.append({'name':name,'exitCode':r.returncode,'log':name+'.log'});assert r.returncode==0,(name,r.stdout)
tar=app/'Contents/Resources/sidecar.tar.gz';sidecar=root/'sidecar';sidecar.mkdir()
# 新打包原件只读检视：不允许绝对路径或逃逸路径/链接，然后由原系统tar展开。
with tarfile.open(tar,'r:gz') as f:
 for x in f:
  assert not x.name.startswith('/');normalized=posixpath.normpath(x.name);assert normalized!='..' and not normalized.startswith('../'),x.name
  if x.issym() or x.islnk():
   target=posixpath.normpath(posixpath.join(posixpath.dirname(normalized) if x.issym() else '',x.linkname));assert not x.linkname.startswith('/') and target!='..' and not target.startswith('../'),x.name
subprocess.run(['tar','-xzf',str(tar),'-C',str(sidecar)],check=True)
for directory,dirs,files in os.walk(sidecar,followlinks=False):
 for name in dirs+files:
  p=pathlib.Path(directory)/name
  if p.is_symlink():assert p.resolve().is_relative_to(sidecar),str(p)
launch=[]
for rel in ['server.app/Contents/MacOS/creatoros-server','frontend/server.js','frontend/.next/server/verdict-verify-key.json']+[str(p.relative_to(sidecar)) for p in sorted((sidecar/'frontend/runtime').glob('*.cjs'))]:
 p=sidecar/rel;assert p.is_file(),p;launch.append({'path':rel,'sha256':sha(p),'bytes':p.stat().st_size})
installed=pathlib.Path('/Applications/CreatorOS.app');current={'binarySha256':sha(installed/'Contents/MacOS/CreatorOS'),'sidecarTarSha256':sha(installed/'Contents/Resources/sidecar.tar.gz')};assert current==json.loads((evidence/'prepare-package.json').read_text())['installedAppReadonlyHashes']
b={'schema':'t1300-production-candidate/v1','task':'T-1300','sourceHead':head,'sourceRoot':str(repo),'evidenceRoot':str(evidence),'artifactRoot':str(root),'appPath':str(app),'dmgPath':str(dmg),'sidecarRoot':str(sidecar),'dmgSha256':sha(dmg),'binarySha256':sha(app/'Contents/MacOS/CreatorOS'),'sidecarTarSha256':sha(tar),'launchFiles':launch,'checks':checks,'installedAppReadonlyHashes':current,'nativeShellStarted':False,'testAuthorization':'DEC-130003 build_smoke专用controller；非真实激活/原生壳','developerIdSigned':False,'notarized':False,'fullBusinessAcceptance':'pending'}
b['driverFiles']=[{'path':str(x.resolve()),'sha256':sha(x)} for x in sorted((evidence/'driver').iterdir()) if x.is_file()];p=evidence/'candidate-binding.json';p.write_text(json.dumps(b,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:b[k] for k in ['sourceHead','artifactRoot','dmgSha256','binarySha256','sidecarTarSha256','checks']},ensure_ascii=False));print('binding='+str(p))
