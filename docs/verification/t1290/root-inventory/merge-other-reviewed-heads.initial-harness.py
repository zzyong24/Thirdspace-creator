from pathlib import Path
import subprocess,json,hashlib,datetime
r=Path('/Users/zyongzhu/.codex/worktrees/unified-editing-integration/Thirdspace-creator');d=Path('/Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1290/root-inventory');proof=json.loads((d.parent/'other-branch-merge/SOURCE_AUDIT.json').read_text())
def git(*args):return subprocess.check_output(['git',*args],cwd=r)
# Current committed post-review source is the integration truth. Branch deltas were independently reviewed per path.
heads=['196321a012299660e7ffcbe012ccc0cd2fd9c18a','5dfd1c706fe8deb661f96c3ebc9fb8b8b30c91fd','90f3a6f48f62961b0a6af3605b17f199c7589d1d','f54f184d395a049b247e81f263f42945ad15078f','c98e7a958cfa5395d8718310128513671fc51562','949ec229979ff1d89f359739df618e5ebacaf2d0','19a1d87cee486b157fa596b73395dd9bf68bbf2e']
sourcePrefixes=('ai-worker/','backend/','contract/','frontend/','mcp-server/','tools/','reference-editors/')
records=[]
for h in heads:
 if subprocess.run(['git','merge-base','--is-ancestor',h,'HEAD'],cwd=r).returncode==0:records.append({'head':h,'alreadyAncestor':True});continue
 before=git('rev-parse','HEAD').decode().strip();log=d/('merge-'+h[:12]+'.log')
 with log.open('w')as out:code=subprocess.run(['git','merge','--no-ff','--no-commit',h],cwd=r,stdout=out,stderr=subprocess.STDOUT).returncode
 if code not in [0,1]:raise RuntimeError(str((h,code)))
 conflicts=git('diff','--name-only','--diff-filter=U').decode().splitlines();decisions=[]
 for path in conflicts:
  # Preserve current committed successor at every explicitly reviewed conflict, never replace a full branch tree.
  try:a=git('show','HEAD:'+path)
  except subprocess.CalledProcessError:raise RuntimeError('unreviewed deletion/add conflict:'+path)
  stages={}
  for n in [1,2,3]:
   try:stages[str(n)]=hashlib.sha256(git('show',':'+str(n)+':'+path)).hexdigest()
   except subprocess.CalledProcessError:stages[str(n)]=None
  if path.startswith(sourcePrefixes):
   flat=json.dumps(proof,ensure_ascii=False)
   assert '"'+path+'"' in flat,'unreviewed source conflict:'+path
  q=r/path;q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(a);decisions.append({'path':path,'stages':stages,'retainedCurrentSuccessorSha256':hashlib.sha256(a).hexdigest()})
 if conflicts:subprocess.run(['git','add','--',*conflicts],cwd=r,check=True)
 assert not git('diff','--name-only','--diff-filter=U').strip()
 # No missing independently reviewed code: ordinary 3-way merge may introduce old redundant additions; keep all automatic merges for final types/checks.
 with log.open('a')as out:subprocess.run(['git','commit','-m','merge: 纳入已核对工作树 '+h[:12]+' 的完整历史'],cwd=r,stdout=out,stderr=subprocess.STDOUT,check=True)
 after=git('rev-parse','HEAD').decode().strip();records.append({'head':h,'before':before,'after':after,'ordinaryMerge':True,'conflictDecisions':decisions,'ancestorAfter':subprocess.run(['git','merge-base','--is-ancestor',h,'HEAD'],cwd=r).returncode==0})
 (d/'OTHER_HEADS_MERGED.json').write_text(json.dumps({'at':datetime.datetime.now().astimezone().isoformat(),'root':str(r),'records':records},ensure_ascii=False,indent=2)+'\n')
 print(h[:12],after,len(conflicts),flush=True)
