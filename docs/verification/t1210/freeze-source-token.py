from pathlib import Path
import subprocess,json,re,hashlib,gzip,tomllib,datetime
w=Path('/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator');o=Path(__file__).resolve().parent
run=lambda *a:subprocess.check_output(a,cwd=w)
assert not run('git','status','--porcelain=v1').strip(), '构建树不干净'
subprocess.run(['git','diff','--check'],cwd=w,check=True)
versions={'package':json.loads((w/'frontend/package.json').read_text())['version'],'tauri':json.loads((w/'frontend/src-tauri/tauri.conf.json').read_text())['version'],'cargo':tomllib.loads((w/'frontend/src-tauri/Cargo.toml').read_text())['package']['version'],'lock':next(p['version'] for p in tomllib.loads((w/'frontend/src-tauri/Cargo.lock').read_text())['package'] if p['name']==tomllib.loads((w/'frontend/src-tauri/Cargo.toml').read_text())['package']['name'])}
assert set(versions.values())=={'1.2.0'},versions
head=run('git','rev-parse','HEAD').decode().strip()
objects=run('git','rev-list','--objects','origin/main..HEAD').decode().splitlines();oids=[x.split(' ',1)[0] for x in objects]
metadata=run('git','cat-file','--batch-check=%(objectname) %(objecttype) %(objectsize)',input) if False else subprocess.check_output(['git','cat-file','--batch-check=%(objectname) %(objecttype) %(objectsize)'],input=('\n'.join(oids)+'\n').encode(),cwd=w).decode().splitlines()
patterns=[rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',rb'gh[pousr]_[A-Za-z0-9]{30,}',rb'github_pat_[A-Za-z0-9_]{30,}',rb'(?<![A-Za-z0-9_-])sk-(?:proj-)?[A-Za-z0-9_-]{32,}',rb'xox[baprs]-[A-Za-z0-9-]{20,}']
known={'f18c8abc124b461da4202fb16d8ef35746d96dba53936cab484790212b16c2da','fd0a8513d5bd3f85e5338930aa1a7e56d80792d33193182d8b8203372945ca3e','47b4fc408f4f1013c0ee25a795165833ad5c55ab21088be471136b7440999eab'}
findings=[];fixtures=[];scanned=0
batch=subprocess.Popen(['git','cat-file','--batch'],cwd=w,stdin=subprocess.PIPE,stdout=subprocess.PIPE)
for line in metadata:
 oid,typ,size=line.split();
 if typ!='blob':continue
 batch.stdin.write((oid+'\n').encode());batch.stdin.flush();header=batch.stdout.readline().decode().split();assert header[1]=='blob';data=batch.stdout.read(int(header[2]));assert batch.stdout.read(1)==b'\n';scanned+=1
 if any(re.search(p,data) for p in patterns):
  sha=hashlib.sha256(data).hexdigest()
  (fixtures if sha in known else findings).append({'object':oid,'sha256':sha})
batch.stdin.close();batch.stdout.close();assert batch.wait()==0
(o/'secret-shape-review.json').write_text(json.dumps({'unclassified':findings,'knownFixtures':fixtures},indent=2)+'\n')
assert not findings, '发现未知secret形状；仅诊断不打印值'
hashes={}
for n in run('git','ls-files','-z').decode().split('\0'):
 if not n:continue
 p=w/n
 if p.is_file():
  h=hashlib.sha256()
  with p.open('rb') as f:
   for b in iter(lambda:f.read(1048576),b''):h.update(b)
  hashes[n]=h.hexdigest()
f={'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'head':head,'cwd':str(w),'clean':True,'versions':versions,'scannedCommittedBlobs':scanned,'secretShapeFindings':findings,'knownExactFixtureMatches':fixtures,'trackedHashes':hashes,'candidateCommits':run('git','log','--format=%H %s','origin/main..HEAD').decode().splitlines(),'candidateFiles':run('git','diff','--name-status','origin/main...HEAD').decode().splitlines()}
raw=(json.dumps(f,ensure_ascii=False,indent=2)+'\n').encode();(o/'source-freeze.json.gz').write_bytes(gzip.compress(raw,mtime=0));summary={k:v for k,v in f.items() if k not in ['trackedHashes','candidateCommits','candidateFiles']};summary['trackedFiles']=len(hashes);summary['fullArchiveSha256']=hashlib.sha256((o/'source-freeze.json.gz').read_bytes()).hexdigest();(o/'source-freeze-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');print(json.dumps(summary,ensure_ascii=False))
