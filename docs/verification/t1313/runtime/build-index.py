import datetime,hashlib,json,subprocess
from pathlib import Path
runtime=Path(__file__).resolve().parent;repo=runtime.parents[3]
production=['backend/src/modules/review/work-reviews.service.ts','backend/src/modules/review/work-review-task-adapter.ts','backend/src/application/generation/work-review-root.ts']
tests=['backend/src/modules/review/work-reviews.service.test.ts','backend/src/application/generation/work-review-root.test.ts','frontend/src/server/__module_integration__/legacy-work-review-preparation.persistence-client.test.ts']
def entry(p):
 p=Path(p);p=p if p.is_absolute() else repo/p
 raw=p.read_bytes()
 return {'path':str(p.relative_to(repo)),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
runs=[]
for p in sorted(runtime.glob('*.json')):
 try:d=json.loads(p.read_text())
 except Exception:continue
 if isinstance(d,dict) and 'command' in d and 'pgid' in d:runs.append(d)
files=[]
for p in sorted(runtime.rglob('*')):
 if not p.is_file() or p.name=='OUTPUT_INDEX.json':continue
 # Vitest可再生cache单列足迹，不作为交付的完整源/证据。
 if any(part.startswith('vite-') for part in p.relative_to(runtime).parts):continue
 files.append(entry(p))
files.append(entry('docs/verification/t1313/IMPLEMENTATION_RESULT.md'))
result={'schema':'t1313-output-index/v1','generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'baseHead':'9e596ec1d18b9a9cbad940c11dc50e7de20d2465','review':'PASS[REV:c53068dc3216] cycle1round1','status':'controlled-implementation-delivery; pending independent final review and parent provider/candidate acceptance','productionSources':[entry(p) for p in production],'tests':[entry(p) for p in tests],'files':files,'runs':runs,'integrationInstruction':'C须同时核productionSources+tests+files；不可仅暂存files漏掉源/测试。','limitations':['受控owned provider协议替身，不是真实供应商模型','PGlite同session/savepoint与原SQL轨迹，不是PG多连接死锁压测；原PG用例按真实环境skip','T1311原5PASS/1FAIL及本轮全部原FAIL保留，父任务未在此完成']}
(runtime/'OUTPUT_INDEX.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'productionSources':len(production),'tests':len(tests),'files':len(files),'runs':len(runs),'incomplete':[r['label'] for r in runs if 'exitCode' not in r]},ensure_ascii=False))
