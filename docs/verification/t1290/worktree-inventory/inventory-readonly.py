from pathlib import Path
import subprocess,json,hashlib,re,datetime,collections,os
M=Path('/Users/zyongzhu/Workbase/Thirdspace-creator');G=Path('/Users/zyongzhu/.codex/worktrees/t1278-unified-activation/Thirdspace-growth');D=Path(__file__).resolve().parent

def run(root,*args):
 p=subprocess.run(['git',*args],cwd=root,capture_output=True);return p.stdout if p.returncode==0 else None

def text(root,*args):
 x=run(root,*args);return x.decode().strip() if x is not None else None

def trees(root):
 out=[]
 for block in text(root,'worktree','list','--porcelain').split('\n\n'):
  row={}
  for line in block.splitlines():
   key,_,val=line.partition(' ');row[key]=val or True
  if row:out.append(row)
 return out

def private(p):
 q=p.lower()
 return any(x in q for x in ['/.creatoros/','/.creatoros','/prototype-databases/','/pg_wal/','/pg_xact/','/postmaster.pid','/pg_ident.conf','/pg_hba.conf']) or any(x in q.split('/') for x in ['.env','.env.local','.env.production','.env.development','.keys','keychain','secrets','userdata','appdata']) or q.endswith(('.p12','.pfx','.key','.pem')) or (not q.endswith(('.ts','.tsx','.js','.jsx','.mjs','.py','.rs','.md','.diff','.patch')) and re.search(r'(aicr-|aica-|token|password|credential|activation.*state|machine.*id|device.*id|grants\.json)',q) is not None)

def category(p):
 q=p.lower()
 if private(p):return 'protected-private-unclassified'
 if q.startswith('docs/') or q.endswith(('.log','.png','.jpg','.mp4','.webm','.zip','.tar.gz')) and not q.startswith(('frontend/public/','reference-editors/')):return 'evidence-or-artifact'
 if q.startswith(('backend/','contract/','ai-worker/','frontend/src/','frontend/src-tauri/','frontend/scripts/','frontend/tests/','frontend/public/','mcp-server/','tools/','scripts/','reference-editors/','server/','migrations/','admin-web/src/','admin-web/tests/','tests/','native/','.agents/skills/','orchestrator/process/')):return 'source-test-build'
 if q.startswith('orchestrator/') or q in ['backlog.md','backlog-details.md','project.md','project_context.md']:return 'control-or-evidence'
 if q.endswith(('.json','.yaml','.yml','.toml','.md','.mjs','.ts','.js','.py','.rs','.tsx','.jsx')) or q in ['dockerfile','makefile','.gitignore']:return 'source-config-needs-owner'
 return 'unclassified-preserve'

def status(root,ignored=False):
 args=['status','--porcelain=v1','-z','--untracked-files=all']
 if ignored:args+=['--ignored=matching']
 parts=run(root,*args).split(b'\0');out=[];i=0
 while i<len(parts):
  b=parts[i];i+=1
  if not b:continue
  code=b[:2].decode();p=b[3:].decode();old=None
  if 'R' in code or 'C' in code:old=parts[i].decode();i+=1
  if not ignored and code=='!!':continue
  if ignored and code!='!!':continue
  out.append((code,p,old))
 return out

def filehash(root,p):
 x=root/p
 if x.is_symlink() or not x.is_file():return None
 try:return hashlib.sha256(x.read_bytes()).hexdigest()
 except OSError:return None

def subject(s):
 if re.search(r'(sk-[A-Za-z0-9]{12}|AICR-|AICA-|password=|token=)',s):return '[可能含私密标识，正文不展示]'
 return s[:240]

main=text(M,'rev-parse','refs/heads/main');w=text(M,'rev-parse','refs/heads/codex/unified-capability-models');rows=[]
for entry in trees(M):
 root=Path(entry['worktree']);row={'root':str(root),'head':entry.get('HEAD'),'branch':entry.get('branch'),'detached':entry.get('detached',False),'locked':entry.get('locked',False),'exists':root.is_dir()}
 if not root.is_dir():row['unavailable']=True;rows.append(row);continue
 head=text(root,'rev-parse','HEAD');row['head']=head;row['mainHeadAtCapture']=main;row['mergeBaseMain']=text(root,'merge-base',main,head);row['ancestorOfMain']=subprocess.run(['git','merge-base','--is-ancestor',head,main],cwd=root,capture_output=True).returncode==0
 row['ancestorOfW03d']=subprocess.run(['git','merge-base','--is-ancestor',head,w],cwd=root,capture_output=True).returncode==0
 row['countsMainVsHead']=text(root,'rev-list','--left-right','--count',main+'...'+head)
 raw=text(root,'log','--format=%H%x09%s',main+'..'+head) or '';row['uniqueCommitsFromMain']=[{'commit':l.split('\t',1)[0],'subject':subject(l.split('\t',1)[1])} for l in raw.splitlines() if '\t' in l]
 row['patchEquivalenceVsMain']=text(root,'cherry',main,head) or ''
 row['patchEquivalenceVsW']=text(root,'cherry',w,head) or ''
 st=status(root);details=[];sensitive=0
 for code,p,old in st:
  cat=category(p)
  if cat=='protected-private-unclassified':sensitive+=1;continue
  rec={'status':code,'path':p,'category':cat,'oldPath':old if old and not private(old) else None}
  if cat in ['source-test-build','source-config-needs-owner']:
   rec['sha256']=filehash(root,p);rec['mainCurrentSha256']=filehash(M,p);rec['w03dCurrentSha256']=filehash(Path('/Users/zyongzhu/.codex/worktrees/unified-capability-models/Thirdspace-creator'),p)
   rec['equalsMainCurrent']=rec['sha256'] is not None and rec['sha256']==rec['mainCurrentSha256'];rec['equalsWCurrent']=rec['sha256'] is not None and rec['sha256']==rec['w03dCurrentSha256']
  details.append(rec)
 row['statusCounts']=dict(collections.Counter(code for code,p,old in st));row['categoryCounts']=dict(collections.Counter(category(p) for code,p,old in st));row['protectedPrivateEntriesHidden']=sensitive;row['dirtyInventory']=details
 ignored=status(root,True);ig=[];privateIgnored=0
 for code,p,old in ignored:
  if private(p):privateIgnored+=1;continue
  # Directory-only collapsed ignored entries; no content/secret reads.
  ig.append(p)
 row['ignoredPathsNotRead']=ig;row['protectedIgnoredEntriesHidden']=privateIgnored
 row['mergeState']={k:text(root,'rev-parse','--verify',k) for k in ['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD']}
 row['rebaseState']={k:Path(text(root,'rev-parse','--git-path',k)).exists() for k in ['rebase-merge','rebase-apply']}
 row['sourceCurrentSameAsMain']=sum(d.get('equalsMainCurrent') is True for d in details);row['sourceCurrentSameAsW']=sum(d.get('equalsWCurrent') is True for d in details)
 srcchanged=text(root,'diff','--name-only',main+'...'+head) or '';row['committedSourceDifferenceFromMergeBase']=[p for p in srcchanged.splitlines() if category(p) in ['source-test-build','source-config-needs-owner']]
 rows.append(row)
 print(json.dumps({'tree':root.parent.name if root!=M else 'Main','branch':row['branch'],'head':head[:10],'ancestorMain':row['ancestorOfMain'],'ancestorW':row['ancestorOfW03d'],'uniqueMain':len(row['uniqueCommitsFromMain']),'dirtyCounts':row['statusCounts'],'privateHidden':sensitive,'merge':bool(row['mergeState']['MERGE_HEAD'])},ensure_ascii=False),flush=True)
# Growth's real main differs from its primary checkout. No source mixing across repositories.
base=text(G,'rev-parse','refs/heads/main');primary=Path('/Users/zyongzhu/Workbase/Thirdspace-growth');gh=text(G,'rev-parse','HEAD');gs=status(G);gr={'root':str(G),'head':gh,'branch':text(G,'symbolic-ref','--short','HEAD'),'mainRefHead':base,'primaryCheckoutHead':text(primary,'rev-parse','HEAD'),'primaryCheckoutBranch':text(primary,'symbolic-ref','--short','HEAD'),'mergeBaseMain':text(G,'merge-base',base,gh),'countsMainVsHead':text(G,'rev-list','--left-right','--count',base+'...'+gh),'uniqueCommitsFromMain':[{'commit':l.split('\t',1)[0],'subject':subject(l.split('\t',1)[1])} for l in (text(G,'log','--format=%H%x09%s',base+'..'+gh) or '').splitlines() if '\t' in l],'statusCounts':dict(collections.Counter(code for code,p,old in gs)),'sourcePathsDiffMain':[p for p in (text(G,'diff','--name-only',base+'...'+gh) or '').splitlines() if category(p) in ['source-test-build','source-config-needs-owner']],'mergeState':{k:text(G,'rev-parse','--verify',k) for k in ['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD']},'worktreeRegistryMetadataOnly':trees(G)}
out={'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mainHead':main,'wHead':w,'creatorWorktreeCount':len(rows),'creator':rows,'growthTaskWorktree':gr,'method':'read-only git metadata/status/cherry and hash source files; no secret/userdata content read, no commits/merges/deletes','sourceWriteCount':0,'gitWriteCount':0,'sensitivePathDetailsHidden':True}
(D/'FULL_INVENTORY.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'creatorCount':len(rows),'growthHead':gh,'growthSourcePaths':len(gr['sourcePathsDiffMain']),'inventory':str(D/'FULL_INVENTORY.json')},ensure_ascii=False))
