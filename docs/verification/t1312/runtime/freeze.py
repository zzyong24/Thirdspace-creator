import hashlib,json,re,sys
from pathlib import Path
repo=Path(__file__).resolve().parents[4];runtime=Path(__file__).resolve().parent;label=sys.argv[1]
if not re.fullmatch(r'[a-z0-9-]+',label):raise ValueError('label')
target=runtime/(label+'-snapshots');target.mkdir(exist_ok=False)
locked=json.loads((repo/'docs/verification/t1312/INPUT_LOCK_ROUND3.json').read_text())
paths=[x['path'] for x in locked['inputs']]+['backend/src/modules/calibration/default-rubric.ts','frontend/src/server/__module_integration__/group-default-rubric.persistence-client.test.ts','backend/src/integration/group-default-rubric.integration.test.ts','backend/src/modules/calibration/default-rubric.test.ts','docs/verification/t1312/runtime/frontend.vitest.config.ts','docs/verification/t1312/runtime/backend.vitest.config.ts']
paths += [x['path'] for x in json.loads((repo/'docs/verification/t1312/INPUT_LOCK_TEST_ADDENDUM.json').read_text())['entries']]
paths += ['backend/src/db.ts', 'backend/src/modules/platform-account/verified-account-binding.port.ts', 'backend/src/modules/platform-collection/platform-collection.service.ts', 'backend/src/schema/platform-collection.ts', 'backend/src/modules/learnings/learnings.repository.ts', 'backend/src/schema/learnings.ts', 'backend/drizzle/0103_group_projects.sql', 'backend/drizzle/0105_group_shared_domains.sql', 'backend/drizzle/0114_legacy_shared_group_stamp.sql', 'backend/drizzle/0128_workspace_convergence.sql', 'backend/drizzle/0130_legacy_source_ownership.sql', 'contract/src/resources/platform-capabilities.ts','contract/src/resources/platform-native-reports.ts']
binding=json.loads((repo/'docs/verification/t1312/WORKER_BINDING.json').read_text());paths.append(binding['executionWorkerPath']);items=[]
for path in paths:
 p=Path(path) if path.startswith('/') else repo/path
 if not p.exists():items.append({'path':path,'absentBeforeRun':True});continue
 b=p.read_bytes();name=path.replace('/','__');(target/name).write_bytes(b);items.append({'path':path,'snapshot':str(target/name),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
(target/'INDEX.json').write_text(json.dumps({'label':label,'files':items},ensure_ascii=False,indent=2)+'\n');print(json.dumps({'label':label,'entries':len(items),'path':str(target)}))
