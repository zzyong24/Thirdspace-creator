from pathlib import Path
import json,hashlib,time,tempfile,shutil,os
out=Path(__file__).resolve().parent
original=Path('/private/tmp/t1300-candidate-Co1DpL'); db=original/'db'
closed=json.loads((out/'SHUTDOWN_CHECK.json').read_text()); assert closed['allKnownProcessesEnded'] and closed['listenerAbsent'] and closed['allDatabaseHandlesAbsent']
owner=json.loads((original/'owner.json').read_text());assert owner['task']=='T-1300' and owner['uid']==os.getuid() and owner['candidateHead']=='2168294fef3f62bc8e0b4ca3254652b935daeb0d'
assert db.is_dir() and db.resolve().is_relative_to(original.resolve())
def snapshot():
 rows={}
 for p in sorted(db.rglob('*')):
  assert not p.is_symlink(),str(p)
  if not p.is_file():continue
  h=hashlib.sha256()
  with p.open('rb') as f:
   for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
  st=p.stat();rows[str(p.relative_to(db))]={'bytes':st.st_size,'mtimeNs':st.st_mtime_ns,'sha256':h.hexdigest()}
 return rows
before=snapshot();time.sleep(2);stable=snapshot();assert stable==before,'ORIGINAL_DB_NOT_STABLE'
root=Path(tempfile.mkdtemp(prefix='t1301-offline-',dir='/private/tmp'));os.chmod(root,0o700);copy=root/'db';shutil.copytree(db,copy,symlinks=False)
after=snapshot();assert after==before,'ORIGINAL_CHANGED_DURING_COPY'
(out/'ORIGINAL_DB_HASHES_BEFORE.json').write_text(json.dumps(before,indent=2)+'\n');(out/'ORIGINAL_DB_HASHES_AFTER_COPY.json').write_text(json.dumps(after,indent=2)+'\n')
binding={'originalRoot':str(original),'originalDb':str(db),'copyRoot':str(root),'copyDb':str(copy),'originalOwnerSha256':hashlib.sha256((original/'owner.json').read_bytes()).hexdigest(),'originalFileCount':len(before),'stableObservationsEqual':True,'originalBeforeAfterCopyEqual':True,'originalGracefulFlushProven':False,'originalExit':143,'mode':'静止副本恢复一致性取证；只副本可自然恢复，原库不开','queryScope':{'asset':'asset-e2aea52e-49','file':'afile-e2aea52e-53','task':'ai-task-e2aea52e-55','execution':'exec_12266621-afc5-43bf-bf8e-8dcb2438d5e0','group':'grp-e2aea52e-6'}}
(out/'SNAPSHOT_BINDING.json').write_text(json.dumps(binding,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'copiedFiles':len(before),'copyRoot':str(root),'stable':True,'originalUnchanged':True}))
