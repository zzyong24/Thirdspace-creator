from pathlib import Path
import subprocess,json
p=Path('docs/verification/t1290/cleanup-inventory');j=json.loads((p/'PRESERVATION_RESULT.json').read_text());names=['codex-text-image','integrated-dev-acceptance','integrated-unit-acceptance','integrated-frontend-unit'];rows=[]
for row in j['rows']:
 root=Path(row['root']);name=root.parent.name
 if name not in names or not root.exists():continue
 refs=subprocess.run(['lsof','-nP','-Fpcn'],capture_output=True,text=True);assert refs.returncode==0
 matches=[x[1:] for x in refs.stdout.splitlines() if x.startswith('n') and (x[1:]==str(root) or x[1:].startswith(str(root)+'/'))];assert not matches,matches
 assert subprocess.run(['git','merge-base','--is-ancestor',row['head'],'main']).returncode==0
 dirty=subprocess.check_output(['git','status','--porcelain=v1'],cwd=root,text=True)
 snapshot=subprocess.check_output(['git','stash','create','T1290清理前可恢复现场'],cwd=root,text=True).strip() or row['head']
 ref='refs/heads/codex/t1290-preserved-'+name
 try:old=subprocess.check_output(['git','rev-parse','--verify',ref],stderr=subprocess.DEVNULL,text=True).strip()
 except subprocess.CalledProcessError:old=None
 assert old in [None,snapshot],(ref,old,snapshot)
 if old is None:subprocess.run(['git','update-ref',ref,snapshot,'0'*40],check=True)
 item={'root':str(root),'originalHead':row['head'],'snapshotCommit':snapshot,'recoveryRef':ref,'dirtyAtSnapshot':dirty,'ignoredPreservation':row['privateBackupRoot'],'toolArchive':'已多次请求queued，未确认完成；独立Git快照+已验备份后执行用户明确清理授权','removeExit':None};rows.append(item);(p/'MANAGED_FALLBACK_RESULT.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
 args=['git','worktree','remove']+(['--force'] if dirty.strip() else [])+[str(root)];r=subprocess.run(args,capture_output=True,text=True);item.update(removeExit=r.returncode,stderr=r.stderr,directoryRemoved=not root.exists());(p/'MANAGED_FALLBACK_RESULT.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n');print(item,flush=True);assert r.returncode==0
