from pathlib import Path
import subprocess,json,hashlib,datetime,re,collections
M=Path('/Users/zyongzhu/Workbase/Thirdspace-creator');R=Path('/Users/zyongzhu/.codex/worktrees/unified-editing-integration/Thirdspace-creator');D=Path(__file__).resolve().parent
INV=json.loads((M/'docs/verification/t1290/worktree-inventory/FULL_INVENTORY.json').read_text())
def git(*a):return subprocess.check_output(['git',*a],cwd=R)
def st(*a):return git(*a).decode().strip()
def anc(a,b):return subprocess.run(['git','merge-base','--is-ancestor',a,b],cwd=R,capture_output=True).returncode==0
def source(p):
 return not p.startswith(('docs/','orchestrator/')) and p not in ['BACKLOG.md','PROJECT.md','PROJECT_CONTEXT.md','ARTIFACT_MANIFEST.yaml','BACKLOG_DETAILS.md'] and not any(x in p.split('/') for x in ['.env','.env.local','.creatoros','secrets','userdata'])
def sha(b):return hashlib.sha256(b).hexdigest()
def tree(ref):
 out={}
 for line in git('ls-tree','-rz','--full-tree',ref).split(b'\0'):
  if not line:continue
  meta,p=line.split(b'\t',1); mode,typ,oid=meta.decode().split();out[p.decode()]={'mode':mode,'type':typ,'blob':oid}
 return out
rh=st('rev-parse','HEAD');mh=st('rev-parse','refs/heads/main');wh=st('rev-parse','refs/heads/codex/unified-capability-models');refs={x:tree(x) for x in [rh,mh,wh]};history={}
def oldProof(p,blob):
 if p not in history:
  raw=st('log','--format=%H','--raw','--no-abbrev','--full-history',rh,mh,'--',p);found={};commit=None
  for line in raw.splitlines():
   if re.fullmatch('[a-f0-9]{40}',line):commit=line
   elif line.startswith(':'):
    nums=line.split('\t',1)[0].split();new=nums[3]
    if new!='0'*40:found.setdefault(new,commit)
  history[p]=found
 return history[p].get(blob)
rows=[]
for b in INV['creator']:
 if b['root'] in [str(M),str(R)] or 'unified-capability-models' in b['root']:continue
 h=b['head'];name=Path(b['root']).parent.name;ht=tree(h);base=st('merge-base',rh,h);bt=tree(base)
 paths=[p for p in st('diff','--name-only',base,h).splitlines() if source(p)];files=[]
 for p in paths:
  branch=ht.get(p);bb=branch['blob'] if branch else None;cur=R/p;payload=cur.read_bytes() if cur.is_file() and not cur.is_symlink() else None
  currBlob=hashlib.sha1(b'blob '+str(len(payload)).encode()+b'\0'+payload).hexdigest() if payload is not None else None
  rec={'path':p,'base':bt.get(p),'branch':branch,'rHead':refs[rh].get(p),'mainCheckpoint':refs[mh].get(p),'wHead':refs[wh].get(p),'currentRSha256':sha(payload) if payload is not None else None,'currentRBlob':currBlob}
  if bb==currBlob:rec['classification']='exact-current-R'
  elif bb is None:rec['classification']='branch-deletion-review' if currBlob else 'exact-current-deletion'
  elif bb==refs[rh].get(p,{}).get('blob'):rec['classification']='exact-RHEAD-later-working-delta'
  elif bb==refs[wh].get(p,{}).get('blob'):rec['classification']='exact-W03d-later-working-delta'
  elif bb==refs[mh].get(p,{}).get('blob'):rec['classification']='exact-Main0b-later-working-delta'
  else:
   proof=oldProof(p,bb)
   rec['classification']='exact-ancestor-blob-later-source' if proof else 'unproven-unique-source-review'
   if proof:rec['ancestorExactBlobCommit']=proof
  files.append(rec)
 row={'name':name,'head':h,'ancestorRHead':anc(h,rh),'ancestorWHead':anc(h,wh),'ancestorMainCheckpoint':anc(h,mh),'mergeBaseRHead':base,'sourceDeltaCount':len(paths),'counts':dict(collections.Counter(x['classification'] for x in files)),'files':files,'uniqueCommitsNotRHead':st('log','--format=%H',rh+'..'+h).splitlines()}
 rows.append(row);print(json.dumps({k:row[k] for k in ['name','head','ancestorRHead','sourceDeltaCount','counts']},ensure_ascii=False),flush=True)
out={'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'rHead':rh,'rMergeHead':st('rev-parse','MERGE_HEAD'),'mainCheckpoint':mh,'wHead':wh,'method':'read-only exact Git blobs, branch merge-base delta, current R file hash, exact ancestor path blob proof; historical supersession is source evidence not runtime test','rows':rows,'productionWrites':0,'gitWrites':0,'tests':'NOT-RUN'}
(D/'SOURCE_AUDIT.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
unknown=[{'branchName':x['name'],'head':x['head'],**f} for x in rows for f in x['files'] if f['classification'] in ['unproven-unique-source-review','branch-deletion-review']]
(D/'NEEDS_REVIEW.json').write_text(json.dumps(unknown,ensure_ascii=False,indent=2)+'\n');print('NEEDS_REVIEW',len(unknown),flush=True)
