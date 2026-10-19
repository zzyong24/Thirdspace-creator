import hashlib, json, shutil, sys
from pathlib import Path
repo=Path(__file__).resolve().parents[4]
base=Path(__file__).resolve().parent
label=sys.argv[1]
target=base/label/'snapshot'
target.mkdir(parents=True,exist_ok=False)
paths=[row['path'] for row in json.loads((repo/'docs/verification/t1313/INPUT_LOCK.json').read_text())['inputs']]
paths += '''backend/src/db.ts
backend/src/modules/platform-account/platform-account.service.ts
backend/src/modules/platform-account/platform-account.repository.ts
backend/src/schema/platform-account.ts
backend/src/schema/account-groups.ts
backend/src/modules/projects/projects.service.ts
backend/src/modules/projects/projects.repository.ts
backend/src/schema/projects.ts
backend/src/modules/artifacts/artifacts.service.ts
backend/src/modules/artifacts/artifacts.repository.ts
backend/src/schema/artifacts.ts
backend/src/modules/moments/moments.service.ts
backend/src/schema/moments.ts
backend/src/schema/work-compositions.ts
contract/src/resources/work-compositions.ts
contract/src/resources/work-reviews.ts
contract/src/resources/moments.ts
contract/src/resources/review-gate.ts
contract/src/resources/projects.ts
contract/src/operations/work-compositions.ts
backend/src/modules/execution/worker-supervisor.ts
frontend/src/server/__module_integration__/legacy-work-review-preparation.persistence-client.test.ts
docs/verification/t1313/runtime/frontend.vitest.config.ts
docs/verification/t1313/runtime/run-owned.py
docs/verification/t1313/runtime/freeze.py'''.splitlines()
records=[]
for path in sorted(set(paths)):
    source=repo/path
    raw=source.read_bytes()
    destination=target/path
    destination.parent.mkdir(parents=True,exist_ok=True)
    destination.write_bytes(raw)
    records.append({'path':path,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
binding=json.loads((repo/'docs/verification/t1313/WORKER_BINDING.json').read_text())
worker=Path(binding['executionWorkerPath'])
raw=worker.read_bytes()
assert len(raw)==binding['bytes'] and hashlib.sha256(raw).hexdigest()==binding['sha256']
(target/'execution-worker.cjs').write_bytes(raw)
records.append({'path':str(worker),'snapshot':'execution-worker.cjs','bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
(base/label/'SNAPSHOT.json').write_text(json.dumps({'label':label,'files':records},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'label':label,'count':len(records)}))
