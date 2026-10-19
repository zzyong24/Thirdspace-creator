import hashlib,json,re,sys
from pathlib import Path
root=Path(__file__).resolve().parents[4]
label=sys.argv[1]
if not re.fullmatch(r'[a-z0-9-]+',label): raise ValueError('snapshot label')
target=Path(__file__).resolve().parent/(label+'-snapshots')
target.mkdir(exist_ok=False)
paths=[
 'frontend/src/server/__module_integration__/group-review-completion.persistence-client.test.ts',
 'docs/verification/t1311/runtime/frontend.vitest.config.ts',
 'docs/verification/t1311/runtime/backend.vitest.config.ts',
 'backend/src/modules/review/execution-review-report.service.ts',
 'backend/src/modules/review/execution-work-review.service.ts',
 'backend/src/modules/review/execution-review-report.service.test.ts',
 'backend/src/modules/review/execution-work-review.service.test.ts',
 'frontend/src/server/persistence-client.ts',
 'backend/src/modules/ai-runtime/script-review-context.ts',
 'backend/src/modules/review/work-review-task-adapter.ts',
 'contract/src/resources/work-reviews.ts',
 'contract/src/internal/execution-worker.ts',
 'docs/verification/t1311/INPUT_LOCK.json',
 'docs/verification/t1311/WORKER_BINDING.json',
]
binding=json.loads((root/'docs/verification/t1311/WORKER_BINDING.json').read_text())
paths.append(binding['executionWorkerPath'])
items=[]
for value in paths:
 source=Path(value) if value.startswith('/') else root/value
 if not source.exists(): continue
 data=source.read_bytes();name=value.replace('/','__')
 (target/name).write_bytes(data)
 items.append({'path':value,'snapshot':str(target/name),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
(target/'INDEX.json').write_text(json.dumps({'label':label,'files':items},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'label':label,'files':len(items),'path':str(target)}))
