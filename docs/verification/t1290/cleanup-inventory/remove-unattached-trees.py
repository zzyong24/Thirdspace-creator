from pathlib import Path
import subprocess,json,datetime
p=Path('docs/verification/t1290/cleanup-inventory');inventory=json.loads((p/'PRESERVATION_RESULT.json').read_text());names=['codex-ephemeral-sessions','daily-client-observability','t1062-client-integration','t1255-client-writer','t1273-release-hardening','t1274-markdown','t1274-native-workspace','wechat-stats-evidence'];out=[]
for row in inventory['rows']:
 root=Path(row['root'])
 if root.parent.name not in names:continue
 assert root.exists();assert subprocess.run(['git','merge-base','--is-ancestor',row['head'],'main']).returncode==0
 s=subprocess.check_output(['git','status','--porcelain=v1'],cwd=root,text=True);assert not s.strip(),(root,s)
 ref=subprocess.run(['lsof','-nP','-Fpn'],capture_output=True,text=True);assert ref.returncode==0;assert not any(x.startswith('n'+str(root)) for x in ref.stdout.splitlines())
 r=subprocess.run(['git','worktree','remove',str(root)],capture_output=True,text=True)
 item={'root':str(root),'originalHead':row['head'],'sourceAncestorMain':True,'gitRemoveExit':r.returncode,'stderr':r.stderr,'directoryRemoved':not root.exists(),'backupRoot':row['privateBackupRoot']};out.append(item);(p/'UNATTACHED_REMOVAL_RESULT.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(item,flush=True)
 if r.returncode:raise RuntimeError('preserved nonzero, stop')
