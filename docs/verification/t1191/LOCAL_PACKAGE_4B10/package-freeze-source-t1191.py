import hashlib,json,os,re,subprocess,tomllib,sys
from pathlib import Path
from datetime import datetime,timezone
w=Path('/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator').resolve();n=Path('/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009')
def git(*args):return subprocess.check_output(['git',*args],cwd=w)
assert Path.cwd().resolve()==w
scan_only='--scan-only' in sys.argv
self_test='--self-test' in sys.argv
working_clean=not git('status','--porcelain=v1')
if not (scan_only or self_test):assert working_clean, '工作树尚未冻结'
assert git('branch','--show-current').decode().strip()=='main'
subprocess.run(['git','diff','--check'],cwd=w,check=True)
head=git('rev-parse','HEAD').decode().strip();origin=git('rev-parse','origin/main').decode().strip()
versions={
 'frontend/package.json':json.loads((w/'frontend/package.json').read_text())['version'],
 'frontend/src-tauri/tauri.conf.json':json.loads((w/'frontend/src-tauri/tauri.conf.json').read_text())['version'],
 'frontend/src-tauri/Cargo.toml':tomllib.loads((w/'frontend/src-tauri/Cargo.toml').read_text())['package']['version'],
}
lock=tomllib.loads((w/'frontend/src-tauri/Cargo.lock').read_text());name=tomllib.loads((w/'frontend/src-tauri/Cargo.toml').read_text())['package']['name'];package=[x for x in lock['package'] if x['name']==name];assert len(package)==1
versions['frontend/src-tauri/Cargo.lock']=package[0]['version'];assert set(versions.values())=={'1.2.0'},'四份版本不一致'
changes=git('diff','--name-status','origin/main...HEAD').decode().splitlines()
changed=git('diff','--name-only','--diff-filter=ACM','-z','origin/main...HEAD').decode().split('\0');changed=[p for p in changed if p]
patterns=[re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),re.compile(rb'\bgh[pousr]_[A-Za-z0-9]{32,}\b'),re.compile(rb'\bgithub_pat_[A-Za-z0-9_]{50,}\b'),re.compile(rb'\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b'),re.compile(rb'\bAKIA[A-Z0-9]{16}\b')]
evidence=json.loads((n/'t1125-fixture-candidate.json').read_text())
reviewed_head=evidence['head']
subprocess.run(['git','merge-base','--is-ancestor',reviewed_head,head],cwd=w,check=True)
approved_source_head='3d4444934a618542747dd9839a299c6d769adad1'
subprocess.run(['git','merge-base','--is-ancestor',approved_source_head,head],cwd=w,check=True)
source_diff=git('diff','--name-only',approved_source_head,head,'--','frontend','backend','contract','ai-worker','mcp-server','tools','pnpm-lock.yaml','package.json').decode().splitlines()
narrow_report=n/'t1175-independent-source-recheck/REVIEW.md'
narrow_reads=n/'t1175-independent-source-recheck/READ_SET.json'
assert hashlib.sha256(narrow_report.read_bytes()).hexdigest()=='81342c41d5857d9f52624ff57b979a3e211f38663e685ce8391e7471bb5985c2'
assert hashlib.sha256(narrow_reads.read_bytes()).hexdigest()=='c353bdfe258108777fe9956aa1acafff570d742e9d4740b909366dfd5f23deae'
narrow=json.loads(narrow_reads.read_text())
assert narrow['task_id']=='T-1175' and narrow['verdict']=='PASS_SOURCE_AND_RECORDED_TESTS_ONLY' and narrow['findings']==[]
narrow_bindings={'frontend/src/components/shell/workspace-initialization.tsx':'a70c883b68a2c9e13aae29304d90205ac7821f7e3ee0aac68a5ccf3a84281b99','frontend/src/components/shell/workspace-initialization.test.tsx':'7635a2986b7a1534f336db673f155060891260e2a0809a6e875d7e74913911b3'}
incremental_path=n/'t1191-package-reviewed-bindings.json'
incremental=json.loads(incremental_path.read_text())
assert incremental['baseHead']==approved_source_head
assert incremental['scope']=='精确当前源码已读绑定；保原局部验收和未验限制'
def read_rows(value):
 if isinstance(value,dict):
  yield value
  for nested in value.values():yield from read_rows(nested)
 elif isinstance(value,list):
  for nested in value:yield from read_rows(nested)
incremental_bindings={}
for row in incremental['bindings']:
 path=row['path'];expected=row['sha256']
 assert path not in incremental_bindings
 report=w/row['reportPath'];reads=w/row['readSetPath']
 assert hashlib.sha256(report.read_bytes()).hexdigest()==row['reportSha256']
 assert hashlib.sha256(reads.read_bytes()).hexdigest()==row['readSetSha256']
 data=json.loads(reads.read_text())
 exact=[x for x in read_rows(data) if x.get('absolutePath',x.get('path')) in (path,str(w/path)) and x.get('sha256',x.get('sourceSha256'))==expected]
 assert exact, '独立read-set缺精确文件绑定：'+path
 assert hashlib.sha256(git('show',head+':'+path)).hexdigest()==expected, '提交与独立源SHA漂移：'+path
 incremental_bindings[path]=expected
assert not(set(narrow_bindings)&set(incremental_bindings)), '重复来源绑定'
all_narrow_bindings={**narrow_bindings,**incremental_bindings}
assert set(source_diff)==set(all_narrow_bindings), '旧已审源码之后存在未知增量'

for path,expected in narrow_bindings.items():
 rows=[r for r in narrow['read_set'] if r['path']==str(w/path)]
 assert len(rows)==1 and rows[0]['sha256']==expected
 assert hashlib.sha256(git('show',head+':'+path)).hexdigest()==expected
for path in ['docs/features/t1175-workspace-recovery-feedback.md','docs/features/t1175-workspace-recovery-feedback.review.md']:
 rows=[r for r in narrow['read_set'] if r['path']==str(w/path)]
 assert len(rows)==1 and hashlib.sha256(git('show',head+':'+path)).hexdigest()==rows[0]['sha256']

admission_path=n/'t1062-current-integration-admission-review/A_SOURCE_CLOSURE.json'
assert hashlib.sha256(admission_path.read_bytes()).hexdigest()=='af9a44974eb6239ab5a3048d2dfa746b70ba57b0e613f89d9e7f62900ca3b0a2'
admission=json.loads(admission_path.read_text())
assert admission['currentHead']==approved_source_head and admission['findings']==[] and admission['unintegratedProductPaths']==[] and admission['unknownProductDifferences']==[]
approved_bindings={}
for section in ['pathClosure','pickerPreservation','additionalCurrentEnvelopeAndVerification']:
 for row in admission[section]:
  path=row['path'];expected=row.get('currentSha256',row.get('sha256'))
  if expected is None:
   assert not (w/path).exists(), '已审删除路径重现：'+path
  else:
   expected=all_narrow_bindings.get(path,expected);data=git('show',head+':'+path);assert hashlib.sha256(data).hexdigest()==expected, '当前已审SHA漂移：'+path
  approved_bindings[path]=expected
approved_bindings.update(all_narrow_bindings)
fixtures={f['path']:f for f in evidence['findings']}
def all_matches(data):
 return [{'rule':i,'line':data[:m.start()].count(b'\n')+1,'length':len(m.group()),'matchSha256':hashlib.sha256(m.group()).hexdigest()} for i,pattern in enumerate(patterns) for m in pattern.finditer(data)]
def classify_fixture(path,data,matches):
 f=fixtures.get(path)
 return bool(f and matches and hashlib.sha256(data).hexdigest()==f['sourceSha256'] and matches==f['matches'])
fixture_bindings=[]
for path,f in fixtures.items():
 old_oid=git('rev-parse',reviewed_head+':'+path).decode().strip();oid=git('rev-parse',head+':'+path).decode().strip()
 assert oid==old_oid, '夹具对象变化：'+path
 fixture_bindings.append({'path':path,'reviewedSourceHead':reviewed_head,'frozenHead':head,'oid':oid,'reviewedOid':old_oid,'sourceSha256':f['sourceSha256']})
if self_test:
 accepted=[];rejected=0
 for path,f in fixtures.items():
  data=git('show',head+':'+path);matches=all_matches(data)
  assert classify_fixture(path,data,matches);accepted.append(path)
  for bad_path,bad_data,bad_matches in [(path+'-unknown',data,matches),(path,data+b'\n',matches),(path,b'\n'+data,all_matches(b'\n'+data)),(path,data,matches[:-1]),(path,data,matches+[dict(matches[0])]),(path,data+b' sk-'+b'x'*40,all_matches(data+b' sk-'+b'x'*40))]:
   assert not classify_fixture(bad_path,bad_data,bad_matches);rejected+=1
 print(json.dumps({'fixtureFilesAccepted':len(accepted),'fixtureMatches':sum(len(fixtures[p]['matches']) for p in accepted),'unknownOrChangedCasesRejected':rejected,'originalRulesRetained':len(patterns),'sourceDiff':source_diff,'sourceHead':reviewed_head,'currentHead':head},ensure_ascii=False));raise SystemExit(0)
blobmeta={}
for entry in git('ls-tree','-r','-z',head).split(b'\0'):
 if not entry:continue
 meta,path=entry.split(b'\t',1);mode,typ,oid=meta.split(b' ');blobmeta[path.decode()]=(mode.decode(),typ.decode(),oid.decode())
findings=[];classified=[];scanned=[]
proc=subprocess.Popen(['git','cat-file','--batch'],cwd=w,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
try:
 for path in changed:
  parts=Path(path).parts
  if Path(path).suffix.lower() in {'.pem','.p12','.pfx','.key'} or any(p=='.env' or p.startswith('.env.') and not p.endswith(('example','sample','template')) for p in parts):findings.append({'path':path,'kind':'敏感文件名'})
  mode,typ,expected_oid=blobmeta[path];assert typ=='blob',(path,'非blob')
  proc.stdin.write((expected_oid+'\n').encode());proc.stdin.flush()
  header=proc.stdout.readline();parts=header.rstrip(b'\n').split(b' ');assert len(parts)==3 and parts[0].decode()==expected_oid and parts[1]==b'blob' and parts[2].isdigit(),(path,'对象header异常')
  declared_size=int(parts[2]);data=proc.stdout.read(declared_size);assert len(data)==declared_size and proc.stdout.read(1)==b'\n',(path,'对象长度异常')
  object_hasher=hashlib.sha1 if len(expected_oid)==40 else hashlib.sha256
  assert object_hasher(b'blob '+str(declared_size).encode()+b'\0'+data).hexdigest()==expected_oid,(path,'对象内容OID不符')
  sha=hashlib.sha256(data).hexdigest();scanned.append({'path':path,'oid':expected_oid,'size':declared_size,'sha256':sha,'mode':mode})
  if b'\0' not in data and len(data)<=20_000_000:
   matches=all_matches(data)
   if classify_fixture(path,data,matches):classified.append({'path':path,'sourceSha256':sha,'matches':matches})
   else:
    for rule in sorted(set(x['rule'] for x in matches)):findings.append({'path':path,'kind':'密钥形状','rule':rule})
 proc.stdin.close();assert proc.stdout.read(1)==b'', 'batch多余输出';err=proc.stderr.read();assert proc.wait(timeout=120)==0,'batch退出异常'
except BaseException:
 proc.terminate();proc.wait(timeout=120);raise
assert len(scanned)==len(changed),'漏扫源文件'
assert git('rev-parse','HEAD').decode().strip()==head,'扫描中HEAD变化'
assert not findings,json.dumps(findings,ensure_ascii=False)
assert {f['path'] for f in classified}==set(fixtures), '夹具分类集合异常'

tracked=git('ls-files','-z').decode().split('\0');hashes={}
for path in filter(None,tracked):
 p=w/path
 if p.is_symlink():hashes[path]='symlink:'+os.readlink(p)
 elif p.is_file():hashes[path]=hashlib.sha256(p.read_bytes()).hexdigest()
 else:raise RuntimeError('已跟踪源路径缺失：'+path)
for path,sha in approved_bindings.items():
 if sha is not None:assert hashes.get(path)==sha, '冻结工作字节与独评不符：'+path
receipt={'reviewedScopeSourceUnchanged':True,'recordedAt':datetime.now(timezone.utc).isoformat(),'branch':'main','head':head,'originMain':origin,'versions':versions,'clean':working_clean,'scanOnly':scan_only,'buildFreezeAuthorization':not scan_only,'fixtureBindings':fixture_bindings,'reviewedSourceHead':approved_source_head,'fixtureReviewedSourceHead':reviewed_head,'currentAdmissionSha256':hashlib.sha256(admission_path.read_bytes()).hexdigest(),'approvedCurrentBindings':approved_bindings,'productDiffAfterBaseReview':source_diff,'incrementalIndependentBindings':incremental,'incrementalIndependentBindingsSha256':hashlib.sha256(incremental_path.read_bytes()).hexdigest(),'independentNarrowSourceReview':{'task':'T-1175','reportSha256':hashlib.sha256(narrow_report.read_bytes()).hexdigest(),'readSetSha256':hashlib.sha256(narrow_reads.read_bytes()).hexdigest(),'approvedBindings':narrow_bindings},'unreviewedProductDiff':[],'classifiedSyntheticFixtures':classified,'batchScannedBlobs':scanned,'diffCheckPassed':True,'secretShapeFindings':findings,'changedFileCount':len(changed),'relativeOriginChanges':changes,'trackedSourceHashes':hashes,'boundary':'本地无备份包；不推送/tag/Release；不包含用户库/App副本/原媒体'}
p=n/('package-source-scan-t1191.json' if scan_only else 'package-source-freeze-t1191.json');assert not p.exists();p.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n');p.chmod(0o600)
print(json.dumps({'head':head,'versions':versions,'clean':working_clean,'scanOnly':scan_only,'fixtureFilesClassified':len(classified),'fixtureMatchesClassified':sum(len(f['matches']) for f in classified),'secretShapeFindings':0,'changedFileCount':len(changed),'trackedSourceCount':len(hashes)},ensure_ascii=False))
