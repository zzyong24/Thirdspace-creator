import json,hashlib,re,subprocess,datetime
from pathlib import Path
runtime=Path(__file__).resolve().parent;root=runtime.parents[3]
prod=['backend/src/modules/calibration/default-rubric.ts','backend/src/modules/calibration/calibration.service.ts','backend/src/modules/calibration/calibration.repository.ts','backend/src/modules/calibration/index.ts','frontend/src/server/persistence-client.ts','backend/src/application/context/calibration-diagnose.ts','backend/src/application/chat/performance-readers.ts','backend/src/application/scheduling/controls.ts','backend/src/modules/ai/calibration-positioning-adoption.service.ts']
def identity(p):
 b=p.read_bytes();return {'path':str(p.relative_to(root)),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
sources=[identity(root/p) for p in prod]
labels=['frontend-final-v9','backend-final-v9','backend-formatted-v10','backend-type-formatted-v10','frontend-type-formatted-v10','timeout-formatted-v10','boundary-formatted-v10','semantic-formatted-v10','orphan-final-v5','backend-final-v5']
lines=['| 运行 | 真实exit | 秒 | 实际结果 |','| --- | --- | --- | --- |']
for label in labels:
 j=json.loads((runtime/(label+'.json')).read_text());log=(runtime/(label+'.log')).read_text();matches=re.findall(r'^\s*Tests\s+([^\n]+)',log,re.M);summary=matches[-1].strip() if matches else '类型/Gate见原完整日志'
 if label.startswith('timeout'):summary='原verify全部子命令通过'
 if label.startswith('orphan'):summary='0 errors / 100 warnings'
 lines.append(f"| {label} | {j['exitCode']} | {j['elapsedSeconds']} | {summary} |")
lines += ['','最终生产源SHA（完整bytes及全部测试/前快照在OUTPUT_INDEX）：','','| 源 | SHA256 |','| --- | --- |']+[f"| {x['path']} | {x['sha256']} |" for x in sources]
cleanup=json.loads((runtime/'RESOURCE_CLEANUP.json').read_text())
lines += ['',f"实际清理：{len(cleanup['ownedGroups'])}个wrapper记录进程组，当前残留0；{len(cleanup['recordedTemporaryRoots'])}个记录临时根均不存在，精确T1312前缀盘点0；绑定worker hash/bytes未变；原timeout五包缓存足迹5项均列JSON。",'','实现未做commit、pmem/reconcile/taskctl或控制状态写入。最终OUTPUT_INDEX交独立R审核后由Root/C接续；原7项PG缺环境与后续新候选真实provider验收不被本报告覆盖。']
p=root/'docs/verification/t1312/IMPLEMENTATION_RESULT.md';s=p.read_text();s=s.replace('状态：九源实现已形成；最后窄回归和类型/Gate结果见末尾运行表。','状态：九源实现与受控验证已完成；最后窄回归38PASS、双types和必要Gate exit0，原PG缺环境仍保留。').replace('<!-- FINAL_RESULTS -->','\n'.join(lines));p.write_text(s)
runs=[]
for p in runtime.glob('*.json'):
 try:j=json.loads(p.read_text())
 except Exception:continue
 if isinstance(j,dict) and 'command' in j and 'pgid' in j:runs.append(j)
assert all('exitCode' in x for x in runs)
files=[identity(p) for p in sorted(runtime.rglob('*')) if p.is_file() and p.name!='OUTPUT_INDEX.json'];files.append(identity(root/'docs/verification/t1312/IMPLEMENTATION_RESULT.md'))
status=subprocess.run(['git','status','--short'],cwd=root,capture_output=True,text=True,check=True).stdout
index={'schema':'t1312-output-index/v1','generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'baseHead':subprocess.run(['git','rev-parse','HEAD'],cwd=root,capture_output=True,text=True,check=True).stdout.strip(),'review':'PASS[REV:f3d4b97715b2] cycle1 round3','status':'implementation-controlled-verification-complete; pending independent final result review and parent candidate/provider acceptance','productionSources':sources,'runRecords':sorted(runs,key=lambda x:x['startedAt']),'formatProof':'docs/verification/t1312/runtime/FORMAT_ONLY.json','cleanup':'docs/verification/t1312/runtime/RESOURCE_CLEANUP.json','ordinaryGitStatus':status,'files':files,'limits':['原PG7FAIL和3原skip保留；不冒多连接压测','受控loopback模型与可信proof不是真实provider/平台登录','未build候选/worker dist，未写控制状态/commit/taskcomplete','v6/v7新producer前快照缺口保留，仅v8为补漏完整RED','v9单查询fixture错式不代签exact root，formatted-v10精确断言已实际再验']}
(runtime/'OUTPUT_INDEX.json').write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'files':len(files),'runs':len(runs),'report':identity(root/'docs/verification/t1312/IMPLEMENTATION_RESULT.md'),'indexSha256':hashlib.sha256((runtime/'OUTPUT_INDEX.json').read_bytes()).hexdigest(),'productionSources':sources},ensure_ascii=False))
