from pathlib import Path
import subprocess,shutil,json
p=Path('docs/verification/t1290/cleanup-inventory');j=json.loads((p/'CLEANUP_ACTIONS.json').read_text());allowed=['codex-text-image','integrated-dev-acceptance','integrated-unit-acceptance','integrated-frontend-unit'];rows=[]
for x in j['regenerableCandidates']:
 if x['tree'] not in allowed:continue
 root=Path(x['root']);path=root/x['relativePath']
 if not path.exists() and not path.is_symlink():continue
 assert root!=Path.cwd();assert not subprocess.check_output(['git','ls-files','--',x['relativePath']],cwd=root).strip(),path
 refs=subprocess.run(['lsof','-nP','-Fpn'],capture_output=True,text=True);assert refs.returncode==0;matches=[y[1:] for y in refs.stdout.splitlines() if y.startswith('n'+str(root))]; assert not matches, {'root':str(root),'refs':matches}
 if path.is_symlink() or path.is_file():path.unlink()
 else:shutil.rmtree(path)
 rows.append({'root':str(root),'relativePath':x['relativePath'],'reason':x['reason'],'removed':not path.exists()});(p/'ATTACHED_CACHE_REMOVAL_RESULT.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n');print(str(path),flush=True)
