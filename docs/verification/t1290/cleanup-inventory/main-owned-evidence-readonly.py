from pathlib import Path
import os,json,subprocess,datetime
M=Path('/Users/zyongzhu/Workbase/Thirdspace-creator');D=Path(__file__).resolve().parent;scan=M/'docs/verification';found=[]
def size(p):
 x=subprocess.run(['du','-A','-s','-k',str(p)],text=True,capture_output=True);n=x.stdout.split('\t',1)[0];return int(n)*1024 if n.isdigit() else None
for base,dirs,files in os.walk(scan,followlinks=False):
 base=Path(base)
 if 'PG_VERSION' in files:
  found.append({'relativeDirectory':str(base.relative_to(M)),'kind':'postgres-data-copy-detected-by-PG_VERSION-name','logicalApparentBytes':size(base),'requiresOwnedAndClosedAndRetainedEvidence':True});dirs[:]=[];continue
 for name in list(dirs):
  q=base/name
  if q.is_symlink() or name in ['node_modules','target','.next','.git']:dirs.remove(name);continue
  if name in ['owned-pglite-data','prototype-databases'] or name.startswith(('owned-pg','owned-postgres','prototype-')):
   found.append({'relativeDirectory':str(q.relative_to(M)),'kind':'owned-evidence-data-or-prototype-source-copy-name-only','logicalApparentBytes':size(q),'requiresOwnedAndClosedAndRetainedEvidence':True});dirs.remove(name)
# Exact previously authorized new-PG closure evidence only, summarize keys without DSN/env/marker value.
result=M/'docs/verification/t1278/integration-candidate/migration-preflight-revision/OWNED_PG_RESULT.json';closure={}
if result.is_file():
 d=json.loads(result.read_text());closure={'evidencePath':str(result.relative_to(M)),'topLevelFields':list(d),'rawEvidenceRetained':True}
 for k,v in d.items():
  if isinstance(v,(bool,int,float)) and any(t in k.lower() for t in ['close','clean','exit','gone','listen','pid','socket','registry']):closure[k]=v
out={'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mainHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=M,text=True).strip(),'scope':'Main docs verification derivative copies only; Main is retained, not a worktree cleanup target','candidates':found,'logicalApparentBytesSum':sum(x['logicalApparentBytes'] or 0 for x in found),'knownClosureEvidence':closure,'deletedFiles':0,'stoppedProcesses':0,'noPermissionToInferOwnedFromNameOnly':True};(D/'MAIN_OWNED_EVIDENCE_COPIES.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print('copies',len(found),'logicalGiB',out['logicalApparentBytesSum']/1024**3);print(json.dumps(closure,ensure_ascii=False))
