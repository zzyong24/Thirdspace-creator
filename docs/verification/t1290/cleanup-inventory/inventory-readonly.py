from pathlib import Path
import subprocess,json,datetime,concurrent.futures,collections,hashlib,os,re
M=Path('/Users/zyongzhu/Workbase/Thirdspace-creator');D=Path(__file__).resolve().parent
old=json.loads((M/'docs/verification/t1290/worktree-inventory/FULL_INVENTORY.json').read_text());roots=[Path(x['root']) for x in old['creator'] if x['root']!=str(M)]
def run(cmd,cwd=None):return subprocess.run(cmd,cwd=cwd,capture_output=True)
def git(root,*a):return run(['git',*a],root).stdout
mainHead=git(M,'rev-parse','HEAD').decode().strip();started=datetime.datetime.now(datetime.timezone.utc).isoformat()
# No environment or command arguments collected; comm is only executable name/path.
ps=run(['ps','-axo','pid=,ppid=,uid=,comm=']);processes={}
for ln in ps.stdout.decode(errors='replace').splitlines():
 z=ln.strip().split(None,3)
 if len(z)==4:processes[int(z[0])]={'pid':int(z[0]),'ppid':int(z[1]),'uid':int(z[2]),'executable':z[3]}
def family(p):
 q=p.lower();parts=q.split('/')
 if any(x in parts for x in ['.creatoros','.env','.env.local','.env.production','.env.development','.env.test','secrets','userdata','appdata']) or q.endswith(('.pem','.key','.p12','.pfx')) or '/machine-id' in q:return 'protected-user-config-or-identity'
 if any(x in parts for x in ['node_modules','.next','.turbo','.vite','.cache','coverage','test-results','playwright-report']):return 'regenerable-cache-dependencies-test-output'
 if 'target' in parts:return 'regenerable-rust-target'
 if any(x in q for x in ['prototype-databases','owned-pglite-data','owned-pg','owned-postgres','prototype-eaab','prototype-']):return 'owned-evidence-copy-requires-retention-proof'
 if q.endswith(('.sqlite','.sqlite3','.db','.duckdb','.mdb','.wav','.mp3','.m4a','.mp4','.mov','.webm','.png','.jpg','.jpeg','.zip','.dmg','.app','.tar.gz')) or any(x in parts for x in ['data','database','databases','media','uploads','storage']):return 'potential-user-db-media-or-package-needs-owner'
 return 'unclassified-preserve'
# System-wide lsof is read-only; retain only references within the approved 14 trees.
lsof=run(['/usr/sbin/lsof','-nP','-Fpcftn']);refs=[];pid=None;comm=None;fd=None;ftype=None
for ln in lsof.stdout.decode(errors='replace').splitlines():
 if not ln:continue
 k,v=ln[0],ln[1:]
 if k=='p':
  try:pid=int(v)
  except:pid=None
 elif k=='c':comm=v
 elif k=='f':fd=v
 elif k=='t':ftype=v
 elif k=='n':
  for root in roots:
   rs=str(root)
   if v==rs or v.startswith(rs+'/'):
    rel=v[len(rs):].lstrip('/') or '.';cat=family(rel)
    protected=cat in ['protected-user-config-or-identity','potential-user-db-media-or-package-needs-owner']
    refs.append({'root':rs,'pid':pid,'comm':comm,'descriptor':fd,'fileType':ftype,'relativePath':('[受保护路径，未输出文件名]' if protected else rel),'category':cat});break
# Logical apparent KiB, not filesystem reclaimable allocation/APFS clone size.
def logical(paths):
 out={};errors=[]
 if not paths:return out,errors
 for offset in range(0,len(paths),60):
  batch=paths[offset:offset+60];x=run(['du','-A','-s','-k',*map(str,batch)])
  for ln in x.stdout.decode(errors='replace').splitlines():
   n,sep,p=ln.partition('\t')
   if sep and n.isdigit():out[p]=int(n)*1024
  if x.returncode:errors.append({'exitCode':x.returncode,'stderrLineCount':len(x.stderr.splitlines()),'pathsCount':len(batch)})
 return out,errors
def inventory(root):
 raw=git(root,'status','--porcelain=v1','-z','--ignored=matching','--untracked-files=normal');parts=raw.split(b'\0');rows=[];i=0
 while i<len(parts):
  b=parts[i];i+=1
  if not b:continue
  code=b[:2].decode();p=b[3:].decode()
  if 'R' in code or 'C' in code:i+=1
  rows.append((code,p))
 ignored=[p for code,p in rows if code=='!!'];pending=[(code,p) for code,p in rows if code!='!!']
 targets=[root]+[root/p.rstrip('/') for p in ignored]
 # Exact known machine identity presence/stat only; never read contents.
 machine=root/'.creatoros/machine-id';identity={'exists':machine.exists(),'symlink':machine.is_symlink(),'bytes':machine.lstat().st_size if machine.exists() else None,'preserveRequired':True} if root.parent.name=='unified-capability-models' else None
 sizes,errors=logical(targets);ignoredRows=[]
 for p in ignored:
  dest=root/p.rstrip('/');cat=family(p);islink=dest.is_symlink()
  # Symlink targets may live outside this tree; do not follow/delete them.
  ignoredRows.append({'relativePath':p if cat!='protected-user-config-or-identity' else ('[受保护配置/身份目录]' if p.rstrip('/')!='.creatoros' else '.creatoros/'),'category':cat,'isSymlink':islink,'logicalApparentBytes':dest.lstat().st_size if islink else sizes.get(str(dest)),'preserveRequired':cat not in ['regenerable-cache-dependencies-test-output','regenerable-rust-target']})
 cats=collections.defaultdict(int)
 for x in ignoredRows:
  if x['logicalApparentBytes'] is not None:cats[x['category']]+=x['logicalApparentBytes']
 dirty=[]
 for code,p in pending:
  cat=family(p);safe=p if cat!='protected-user-config-or-identity' else '[受保护配置/身份路径]'
  dirty.append({'status':code,'relativePath':safe,'category':cat})
 row={'root':str(root),'name':root.parent.name,'head':git(root,'rev-parse','HEAD').decode().strip(),'ancestorMain':run(['git','merge-base','--is-ancestor',git(root,'rev-parse','HEAD').decode().strip(),mainHead],root).returncode==0,'logicalApparentTreeBytes':sizes.get(str(root)),'ignored':ignoredRows,'ignoredCategoryApparentBytes':dict(cats),'dirtyCollapsed':dirty,'dirtyStatusCounts':dict(collections.Counter(c for c,p in pending)),'processReferences':[x for x in refs if x['root']==str(root)],'machineIdentity':identity,'sizeProbeErrors':errors}
 print(json.dumps({'name':row['name'],'head':row['head'][:10],'logicalGiB':round((row['logicalApparentTreeBytes'] or 0)/1024**3,3),'ignoredEntries':len(ignored),'dirty':len(dirty),'refs':len(row['processReferences']),'sizeErrors':len(errors)},ensure_ascii=False),flush=True)
 return row
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:rows=list(ex.map(inventory,roots))
# Only hash the six originally dirty evidence files and approved retained copies, never private files.
retained=[]
for name in ['integrated-unit-acceptance','t1255-client-writer']:
 orig=next(Path(x['root']) for x in old['creator'] if Path(x['root']).parent.name==name);copy=M/'docs/verification/t1290/root-inventory'/(name+'-dirty-preserved');items=[]
 for base,dirs,files in os.walk(copy,followlinks=False):
  for f in files:
   path=Path(base)/f
   if path.is_symlink():continue
   rel=path.relative_to(copy);raw=path.read_bytes();h=hashlib.sha256(raw).hexdigest();candidate=orig/rel
   items.append({'retainedRelativePath':str(rel),'bytes':len(raw),'sha256':h,'sameOriginalRelativePathExists':candidate.is_file(),'sameOriginalRelativePathSha256':hashlib.sha256(candidate.read_bytes()).hexdigest() if candidate.is_file() and not candidate.is_symlink() else None})
 retained.append({'originalTree':str(orig),'preservedDirectory':str(copy),'exists':copy.is_dir(),'files':items})
usedPids=sorted({x['pid'] for x in refs if x['pid']});result={'startedAt':started,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mainHead':mainHead,'registeredCreatorCountAtBaseline':15,'nonMainTreeCount':len(roots),'method':'git status ignored=matching collapsed; du -A -sk apparent logical bytes without symlink traversal; read-only ps comm and lsof refs only for approved tree paths; no secret/identity contents read','lsof':{'exitCode':lsof.returncode,'stderrLineCount':len(lsof.stderr.splitlines()),'permissionCompleteness':'best-effort snapshot; kernel/other-user descriptors may be unavailable; absence is not proof of no future use'},'processes':[processes.get(p,{'pid':p}) for p in usedPids],'trees':rows,'originalDirtyEvidenceRetainedCopies':retained,'logicalApparentTreeBytesSum':sum(x['logicalApparentTreeBytes'] or 0 for x in rows),'productionWrites':0,'gitWrites':0,'stoppedProcesses':0,'deletedFiles':0,'actualFreedBytes':0}
(D/'INVENTORY.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print('DONE',len(rows),'refs',len(refs),'retainedFiles',sum(len(x['files']) for x in retained),flush=True)
