from pathlib import Path
import subprocess,json,os,re,hashlib,datetime,collections
D=Path(__file__).resolve().parent;M=Path('/Users/zyongzhu/Workbase/Thirdspace-creator');p=D/'INVENTORY.json';d=json.loads(p.read_text());skip={'node_modules','.next','target','.git','.turbo','.vite','.cache','coverage','test-results','playwright-report'}
def logical(path):
 x=subprocess.run(['du','-A','-s','-k',str(path)],capture_output=True,text=True);first=x.stdout.split('\t',1)[0];return int(first)*1024 if first.isdigit() else None
for t in d['trees']:
 root=Path(t['root']);tracked=set(subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0'));protected=[];owned=[];other=[]
 for base,dirs,files in os.walk(root,followlinks=False):
  base=Path(base)
  for name in list(dirs):
   q=base/name;rel=str(q.relative_to(root))
   if name in skip:dirs.remove(name);continue
   if q.is_symlink():dirs.remove(name);continue
   if name in ['.creatoros','userdata','appdata','secrets']:
    record={'category':'protected-user-config-identity-or-data','relativeDirectory':rel,'logicalApparentBytes':logical(q),'preserveRequired':True,'fileContentsRead':False}
    # Explicit known machine-id only: identity value is never read/hashed/output.
    identity=q/'machine-id'
    if identity.is_file():record['machineIdentity']={'relativePath':str(identity.relative_to(root)),'exists':True,'bytes':identity.lstat().st_size,'fileContentsRead':False,'preserveRequired':True}
    protected.append(record);dirs.remove(name)
   elif re.search(r'(^owned[-_]|prototype[-_]|pglite.*data)',name,re.I):
    owned.append({'relativeDirectory':rel,'logicalApparentBytes':logical(q),'classification':'owned-name-only-not-proof-of-ownership-or-retention','preserveUntilOriginAndClosedAndEvidenceRetained':True});dirs.remove(name)
  for name in files:
   q=base/name;rel=str(q.relative_to(root))
   if rel in tracked or q.is_symlink():continue
   if name=='.env' or (name.startswith('.env.') and not name.endswith(('.example','.sample','.template'))):
    protected.append({'category':'protected-env-file','relativePath':'[受保护.env文件，路径不展开]','bytes':q.lstat().st_size,'preserveRequired':True,'fileContentsRead':False})
   elif q.suffix.lower() in ['.sqlite','.sqlite3','.db','.duckdb','.mp4','.mov','.m4a','.wav','.mp3']:
    other.append({'category':'untracked-db-or-media-unknown-owner','parentDirectory':str(Path(rel).parent),'bytes':q.lstat().st_size,'preserveRequired':True,'fileContentsRead':False})
 t['protectedStructuralScan']=protected;t['ownedEvidenceDirectoryScan']=owned;t['untrackedDbMediaStructuralScan']={'count':len(other),'logicalFileBytes':sum(x['bytes'] for x in other),'parentDirectories':dict(collections.Counter(x['parentDirectory'] for x in other)),'fileNamesHidden':True,'preserveRequired':True}
 if t['name']=='unified-capability-models':
  actual=root/'frontend/.creatoros/machine-id';t['machineIdentity']={'relativePath':'frontend/.creatoros/machine-id','exists':actual.is_file(),'bytes':actual.lstat().st_size if actual.is_file() else None,'preserveRequired':True,'fileContentsRead':False,'earlierRootDotCreatorosProbeOnlyWasNotActualLocation':True}
 print(t['name'],'protected',len(protected),'ownedDirs',len(owned),'dbMedia',len(other),flush=True)
retained=[]
for name in ['integrated-unit-acceptance','t1255-client-writer']:
 copy=M/'docs/verification/t1290/root-inventory'/(name+'-dirty-preserved');b=json.loads((copy/'BINDING.json').read_text());files=[]
 for x in b['files']:
  rel=x['path'];source=Path(b['root'])/rel;cp=copy/'files'/rel;expected=x['sha256'];s=hashlib.sha256(source.read_bytes()).hexdigest() if source.is_file() else None;c=hashlib.sha256(cp.read_bytes()).hexdigest() if cp.is_file() else None
  files.append({'path':rel,'expectedSha256':expected,'currentOriginalSha256':s,'retainedCopySha256':c,'allMatch':s==c==expected,'retainedCopyMatchesExpected':c==expected})
 retained.append({'tree':b['root'],'preservedDirectory':str(copy),'files':files,'bindingSha256':hashlib.sha256((copy/'BINDING.json').read_bytes()).hexdigest()})
d['originalDirtyEvidenceRetainedCopies']=retained;d['supplementCompletedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();d['structuralScanMethod']='os.walk names/stat only, prune known caches/target/.git; tracked db/media excluded; private directories only du apparent size, machine-id presence/stat only';p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print('retained',sum(len(x['files']) for x in retained),'allCopyMatch',all(f['retainedCopyMatchesExpected'] for t in retained for f in t['files']),flush=True)
