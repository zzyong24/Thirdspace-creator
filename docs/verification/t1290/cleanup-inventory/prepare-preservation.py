from pathlib import Path
import json,subprocess,shutil,hashlib,os,stat,datetime
main=Path.cwd(); base=main/'.worktree-preservation/t1290';base.mkdir(parents=True,exist_ok=True);os.chmod(base,0o700)
exclude=main/'.git/info/exclude';text=exclude.read_text();line='/.worktree-preservation/'
if line not in text.splitlines():exclude.write_text(text+'\n'+line+'\n')
j=json.loads((main/'docs/verification/t1290/cleanup-inventory/INVENTORY.json').read_text());rows=[]
regen=['node_modules','frontend/node_modules','backend/node_modules','contract/node_modules','ai-worker/node_modules','mcp-server/node_modules','frontend/.next','frontend/src-tauri/target','frontend/src-tauri/sidecar','frontend/src-tauri/gen','frontend/src-tauri/sidecar.tar.gz','ai-worker/dist','.codegraph']
def skipped(s):
 parts=Path(s).parts
 return any(s==r or s.startswith(r+'/') for r in regen) or any(p in ['node_modules','target','.next'] for p in parts) or s.endswith('.tsbuildinfo')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
for t in j['trees']:
 root=Path(t['root']);name=t['name'];assert subprocess.run(['git','merge-base','--is-ancestor',t['head'],'main'],cwd=root).returncode==0
 raw=subprocess.check_output(['git','ls-files','--others','--exclude-standard','-z'],cwd=root)+subprocess.check_output(['git','ls-files','--others','--ignored','--exclude-standard','-z'],cwd=root)
 files=sorted(set(x.decode() for x in raw.split(b'\0') if x));saved=[];same=[];skips=0
 for rel in files:
  if skipped(rel):skips+=1;continue
  src=root/rel
  if not src.is_file() and not src.is_symlink():raise RuntimeError('unknown type '+str(src))
  private=(src.name=='machine-id' or '.env'==src.name or src.suffix in ['.key','.p12','.pfx'])
  dest=base/name/rel
  if not private and (main/rel).is_file() and src.is_file() and sha(src)==sha(main/rel):same.append({'path':rel,'sha256':sha(src)});continue
  dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dest)
  if private:os.chmod(dest,0o600);saved.append({'path':rel,'private':True,'bytes':src.stat().st_size,'backupCopied':True})
  else:
   assert sha(src)==sha(dest);saved.append({'path':rel,'sha256':sha(src),'bytes':src.stat().st_size})
 rows.append({'root':str(root),'head':t['head'],'privateBackupRoot':str(base/name),'saved':saved,'alreadyRetainedInMain':same,'regenerableFilesSkipped':skips})
 print(name,'saved',len(saved),'sameMain',len(same),flush=True)
out={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mainHead':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'backupRoot':str(base),'regenerableRules':regen,'rows':rows,'savedBytes':sum(x['bytes'] for r in rows for x in r['saved']),'deleted':0}
(main/'docs/verification/t1290/cleanup-inventory/PRESERVATION_RESULT.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print('PRESERVATION_COMPLETE',out['savedBytes'],flush=True)
