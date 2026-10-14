from pathlib import Path
import json,hashlib,collections,datetime,subprocess
D=Path(__file__).resolve().parent;M=Path('/Users/zyongzhu/Workbase/Thirdspace-creator');d=json.loads((D/'INVENTORY.json').read_text())
def evidence(p):
 return p.startswith(('docs/verification/','docs/research/evidence/','docs/features/','frontend/tests/visual/','frontend/test-results/','frontend/playwright-report/')) or '/test-results/' in p or '/playwright-report/' in p
cache={}
def sha(p):
 s=p.stat();key=(str(p),s.st_size,s.st_mtime_ns)
 if key not in cache:
  h=hashlib.sha256()
  with p.open('rb') as f:
   for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
  cache[key]=h.hexdigest()
 return cache[key]
def group(p):
 parts=Path(p).parts
 if p.startswith(('docs/verification/','docs/features/')) and len(parts)>=3:return '/'.join(parts[:3])
 if p.startswith('docs/research/evidence/') and len(parts)>=4:return '/'.join(parts[:4])
 if p.startswith('frontend/tests/visual/'):return 'frontend/tests/visual/__artifacts__'
 if '/test-results/' in p:return p.split('/test-results/')[0]+'/test-results'
 if '/playwright-report/' in p:return p.split('/playwright-report/')[0]+'/playwright-report'
 return str(Path(p).parent)
rows=[]
for t in d['trees']:
 r=Path(t['root']);groups={};seen=set()
 for x in t['ignored']:
  rel=x['relativePath']
  if rel.startswith('[') or not evidence(rel) or any(part in Path(rel).parts for part in ['node_modules','target','.next','.turbo','.vite','.cache']):continue
  q=r/rel.rstrip('/');g=groups.setdefault(group(rel),{'relativeDirectory':group(rel),'ignoredEntries':[],'fileCount':0,'logicalFileBytes':0,'mainExactCount':0,'mainMissingCount':0,'mainDifferentCount':0,'preservePrivateNoReadCount':0,'symlinkCount':0,'files':[]});g['ignoredEntries'].append(rel)
  files=[q] if q.is_file() else q.rglob('*') if q.is_dir() else []
  for f in files:
   if not f.is_file() or f in seen or any(part in f.relative_to(r).parts for part in ['node_modules','target','.next','.turbo','.vite','.cache']):continue
   seen.add(f);path=str(f.relative_to(r));s=f.lstat();g['fileCount']+=1;g['logicalFileBytes']+=s.st_size
   if f.is_symlink():g['symlinkCount']+=1;continue
   if any(x in path.split('/') for x in ['private','.creatoros','secrets']) or f.suffix.lower() in ['.pem','.key','.p12','.pfx']:
    g['preservePrivateNoReadCount']+=1;continue
   current=M/path;h=sha(f);record={'relativePath':path,'bytes':s.st_size,'originalSha256':h,'mainSameRelativePathExists':current.is_file(),'mainSha256':sha(current) if current.is_file() and not current.is_symlink() else None};eq=record['mainSha256']==h
   if eq:g['mainExactCount']+=1
   elif record['mainSameRelativePathExists']:g['mainDifferentCount']+=1
   else:g['mainMissingCount']+=1
   record['requiresOriginalRetention']=not eq;g['files'].append(record)
 for g in groups.values():
  g['allEvidenceAlreadyMainExact']=g['fileCount']==g['mainExactCount'];g['action']='Main副本逐文件一致；保留Main证据后原副本可进入清理候选' if g['allEvidenceAlreadyMainExact'] else '必须先备份本树ignored条目；Main缺失/不同/私有未读内容不可覆盖或丢弃';g['mainCopyDirectory']=str(M/g['relativeDirectory']);g['originalDirectory']=str(r/g['relativeDirectory'])
 rows.append({'name':t['name'],'root':t['root'],'groups':list(groups.values())});print(t['name'],'groups',len(groups),'files',sum(x['fileCount'] for x in groups.values()),'needsBackupGroups',sum(not x['allEvidenceAlreadyMainExact'] for x in groups.values()),flush=True)
out={'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mainHeadAtEvidenceCheck':subprocess.check_output(['git','rev-parse','HEAD'],cwd=M,text=True).strip(),'method':'ignored evidence items only, content SHA256 for nonprivate files; compare exact Main relative path; private files not read; no source/evidence copied or changed','trees':rows,'writesOutsideUniqueCandidateDirectory':0};(D/'EVIDENCE_RETENTION.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
