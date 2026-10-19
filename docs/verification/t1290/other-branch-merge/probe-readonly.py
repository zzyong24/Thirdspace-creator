from pathlib import Path
import subprocess,json,tempfile,hashlib,difflib,collections
D=Path(__file__).resolve().parent;R=Path('/Users/zyongzhu/.codex/worktrees/unified-editing-integration/Thirdspace-creator');a=json.loads((D/'SOURCE_AUDIT.json').read_text());probe=[]
def show(ref,p):
 s=subprocess.run(['git','show',ref+':'+p],cwd=R,capture_output=True);return s.stdout if s.returncode==0 else b''
for row in a['rows']:
 for f in row['files']:
  if f['classification']!='unproven-unique-source-review':continue
  p=f['path'];cur=(R/p).read_bytes();base=show(row['mergeBaseRHead'],p);branch=show(row['head'],p)
  with tempfile.TemporaryDirectory(prefix='readonly-merge-',dir=D) as td:
   td=Path(td)
   for name,b in [('current',cur),('base',base),('branch',branch)]: (td/name).write_bytes(b)
   result=subprocess.run(['git','merge-file','-p','--diff3',str(td/'current'),str(td/'base'),str(td/'branch')],capture_output=True)
  rec={'branchName':row['name'],'head':row['head'],'path':p,'currentSha256':hashlib.sha256(cur).hexdigest(),'baseSha256':hashlib.sha256(base).hexdigest(),'branchSha256':hashlib.sha256(branch).hexdigest(),'exitCode':result.returncode,'resultEqualsCurrent':result.stdout==cur,'resultSha256':hashlib.sha256(result.stdout).hexdigest()}
  if result.returncode==0 and result.stdout==cur:rec['disposition']='3way-clean-no-new-delta'
  elif result.returncode==0:rec['disposition']='3way-clean-new-delta-review'
  else:rec['disposition']='3way-conflict-review'
  safe=p.replace('/','__');out=D/'source-diff-review'/row['name'];out.mkdir(parents=True,exist_ok=True)
  # Read-only diff/proposed merge artifacts only; never write repository source.
  (out/(safe+'.branch-to-current.diff')).write_text(''.join(difflib.unified_diff(branch.decode().splitlines(True),cur.decode().splitlines(True),fromfile=row['head']+'/'+p,tofile='current-R/'+p)))
  if result.returncode==0 and result.stdout!=cur:(out/(safe+'.merge-probe')).write_bytes(result.stdout)
  probe.append(rec);print(row['name'],p,rec['disposition'],flush=True)
(D/'MERGE_PROBES.json').write_text(json.dumps(probe,ensure_ascii=False,indent=2)+'\n');print(dict(collections.Counter(x['disposition'] for x in probe)),flush=True)
