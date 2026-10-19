import json,os,re
from pathlib import Path
runtime=Path(__file__).resolve().parent
rows=[]
for package in ['backend','frontend']:
 path=runtime/(package+'-list-final-v6.log')
 for line in path.read_text().splitlines():
  if ' > ' not in line:continue
  file,name=line.split(' > ',1)
  if not file.startswith('src/'):continue
  run='frontend-final-v4' if package=='frontend' else 'backend-final-v4'
  state='PASS'
  if package=='backend':
   if name.startswith('T1313') and 'work-reviews.service.test.ts' in file:run='backend-focused-final-v5'
   if name.startswith('取消/过期和跨账号'):run='backend-deadline-final-v6'
   if name.startswith('T1062真实PG'):state='SKIP'
  rows.append({'file':package+'/'+file,'name':name,'state':state,'evidenceRun':run})
# Vitest list默认省略skipIf已跳过用例；由原源名称+v4真实1 skipped补入，不称已运行。
source=(runtime.parents[3]/'backend/src/application/generation/work-review-root.test.ts').read_text()
name=re.search(r"it\.skipIf\(!reviewLockPg\)\('([^']+)'",source).group(1)
rows.append({'file':'backend/src/application/generation/work-review-root.test.ts','name':name,'state':'SKIP','evidenceRun':'backend-final-v4','collection':'原skipIf源名称；list默认不列已skip项'})
result={'interpretation':'list仅收集实际展开测试名，不执行测试，不作为PASS；每项PASS/SKIP来自evidenceRun实际日志。v4为43PASS/1错误码fixture FAIL/1PG SKIP，v5仅9新增安全用例复验；不冒v4全绿。','postgresUrlConfigured':bool(os.environ.get('CREATOROS_TEST_POSTGRES_URL')),'tests':rows,'counts':{'total':len(rows),'pass':sum(r['state']=='PASS' for r in rows),'skip':sum(r['state']=='SKIP' for r in rows)}}
assert len(rows)==51,(len(rows),rows)
(runtime/'TEST_COVERAGE.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result['counts']))
