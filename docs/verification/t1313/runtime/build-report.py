import json
from pathlib import Path
r=Path(__file__).resolve().parent;repo=r.parents[3]
runs=[]
for p in r.glob('*.json'):
 try:d=json.loads(p.read_text())
 except Exception:continue
 if isinstance(d,dict) and 'command' in d and 'pgid' in d:runs.append(d)
assert all('exitCode' in row for row in runs)
notes={
'frontend-red-v1':'筛选未命中展开引号名称，6 SKIP；不计RED',
'frontend-red-v2':'cwd错误，binding ENOENT前置FAIL；不计目标RED',
'frontend-red-v3':'有效公共legacy/work RED：1 FAIL/5未选；原prepare报告不存在',
'frontend-core-v1':'legacy/work 1 PASS/5未选；真实worker→settled→公开confirm',
'backend-type-core-v1':'生产core-v1类型通过，当时新增矩阵尚未加入',
'backend-matrix-v2':'40 PASS/3新fixture FAIL/1原PG SKIP',
'backend-top-project-red-v3':'有效安全RED：顶层项目篡改后mapped/private实际均fulfilled，期待rejected',
'backend-final-v4':'43 PASS/1错误码fixture FAIL/1原PG SKIP；绝非整轮全绿',
'backend-type-final-v4':'exit2，仅新test:220 unknown spread TS2698',
'frontend-final-v4':'6 PASS：六族完整worker；其中三work公开confirm/current status',
'frontend-type-final-v4':'类型通过',
'boundary-final-v4':'boundary通过',
'semantic-final-v4':'semantic通过',
'orphan-final-v4':'0 errors/100原warnings',
 'timeout-final-v4':'原verify全部子命令通过，五包固有缓存足迹保留',
'backend-focused-final-v5':'9 PASS/23未选；正式枚举错误码+真实对象收窄，覆盖v4唯一fixture失败',
'backend-type-final-v5':'类型通过',
'backend-deadline-final-v6':'1 PASS/31未选；原lease校验保留，增实际deadlineAt过期commit拒绝',
'backend-type-final-v6':'最终backend类型通过',
'backend-list-final-v6':'仅收集测试名，不执行测试、不计功能PASS',
'frontend-list-final-v6':'仅收集测试名，不执行测试、不计功能PASS',
}
manifest=json.loads((r/'SOURCE_MANIFEST.json').read_text())
text='''# T1313 本地受控实现交付

本轮恢复真实旧账号入口的作品审核：新报告与原AI任务使用同一真实冻结归属，原noGroup ctxA仍交给AI创建任务；worker准备只从原任务和持久快照读取。普通组创作继续account=null。实现限三个生产源、三个测试；未执行提交、控制状态变更、候选构建或真实模型验证。父任务与T1311原历史5PASS/1FAIL不在此改写。

```mermaid
flowchart LR
 A[实际旧ctxA] --> B[阶段1 原事务预约\n真实冻结owner盖新报告]
 B --> C[独立提交]
 C --> D[阶段2 实际ctxA提交原AI\n原fingerprint与映射核验]
 D --> E[独立提交后原wake]
 E --> F[同tx真实task DTO与owner\n私有持久冻结读取]
 F --> G[不可变worker与真实ledger结算]
 G --> H[原公开父门下读回与用户确认]
```

## 前RED与历史失败

red-v3事前64件完整source/test/config/worker快照覆盖原38输入；原始project/composition/request/report/task及SQL在runtime/red-v3。实测project=legacyG/A，composition=null/A，report=null/A，AI=legacyG/A，原堆栈create→wake→prepare→readFrozenTask报“审核报告不存在”，0execution、0call、0provider请求。这是本任务有效公共RED，未用直接settled种行或mock完成服务替代。旧T1311父行缺证仍保持缺证，不从本轮补拍成旧事实。

red-v1名称正则未匹配展开的引号，6项全未选；red-v2从错误cwd读取binding ENOENT，均保原件且不算目标RED。之后core-v1真实legacy/work完整GREEN。

独立预核发现原task顶层projectId未核。top-project-red-v3在事前65件快照下真实篡改任务顶层项目，input/report/frozen仍原项目；mapped重放与private读取实际均fulfilled，负例明确FAIL。随后本地接口如实声明DTO已有projectId:string|null，并在原映射校验中比对report.projectId；不扩DTO/schema/AI源。

matrix-v2三个新增fixture首错为：Drizzle logger不记录事务commit/rollback控制SQL；显式G构造错fingerprint库存前project尚null而原父门拒；已cancelled再次取消被原AI合同拒。修正为现场producer一致的projectG、按真实持久行证明stage1提交、回到queued再走真实cancel，未改生产配夹具。

final-v4真实43PASS/1FAIL/1PGskip。唯一FAIL为测试把枚举名称AttemptPayloadMismatch写成代码值，实际正确抛ATTEMPT_PAYLOAD_MISMATCH；v5引用ErrorCode枚举后9项新增安全矩阵全部通过。v4类型exit2仅test未知JSON展开，v5对真实inputData做非null对象/非数组收窄后类型通过。原失败日志、源/test/config快照保留。

## 实现与证据边界

两个阶段保持独立事务，wake在stage2提交后。仅noGroup旧A入口新增最外account→member→实际G锁，stage1新report盖真实冻结user/group/account及版本；request/key/digest/scope保实际请求。stage2再次锁真实ctxA，核完整请求/回执、不可变report/snapshot/frozenContext与fresh owner；rename版本推进可继续。已映射重放核原真实任务及owner，未绑定attempt必经原AI createTask fingerprint校验。旧混合pending不restamp、不新task/attempt、不自动wake，公开读取/取消仍按原合同。

私有prepare在同tx通过readTask与既有getTaskExecutionRuntime读取真实owner，exact null-safe查report，核task type/顶层与input项目/attempt/report/task/fingerprint及snapshot scope、compositionId、scopeKey、frozen project和重算快照；不重读当前父/当前稿、不放宽公开workspaceFilter。公开get/list/status/request/confirm的原父门不变。普通G+不可用筛选B用例仍正常创建account=null任务且SQL无平台A/B锁；不凭页面筛选增权限。

三层证据分别为：①新compositeTransport公开创建六族，真实prepare→immutable worker→host→ledger→原报告，三work均公开confirm/current status；②受控历史/故障库存上的真实review/AI/authority/settlement事务和安全负例；③不可变worker文件原hash/bytes逐例验证。owned loopback provider只替代外部协议回复；真实prepare、supervisor.invoke、完成服务、ledger、权限均原样执行。未用真模型或真实平台登录，未访问候选65353/controller94030/用户库，未build dist。

## 验证结果

原v4全量两文件为43PASS/1fixture FAIL/1原PG SKIP；v5同生产字节9项新增安全回归PASS，v6同生产字节原取消/lease例补deadlineAt真实commit拒绝PASS。逐项最终覆盖合并为44个backend独立用例PASS、1个原PG SKIP，加6个公共完整worker用例PASS；这不是一次全量命令exit0。全部实际测试名与证据run映射见runtime/TEST_COVERAGE.json（51条=50PASS/1SKIP）。list命令只收集名称；原skipIf PG名称由原源和实际skip计数补入，不冒执行。

范围内覆盖两stage中断/同key原attempt恢复、wake失回复/终态重复、完整body/fingerprint、错user/group/account/owner/task/report/attempt/snapshot/scope/frozen project/顶层项目、rename、归档与受控membership移动、公开parent拒绝和真实project delete清理、取消/lease/fence/deadline、真实trigger/savepoint回滚及普通G筛选B。legacy-lock-order.json为最新v5 SQL轨迹（测试固定输出路径）；PGlite logger不输出顶层commit/rollback，阶段提交/回滚依据真实持久report/request/AI行与故障恢复断言。PGlite同session/savepoint和SQL顺序不冒PG多连接死锁压测；CREATOROS_TEST_POSTGRES_URL未配置，原PG用例原skipIf保留未运行。

正test/it3600000、hook180000、outer86400s、retry0、单worker、显式唯一include/CLI文件、自有cache；原task deadline1800000不缩不续。既有显式180000测试预算保留。类型仅最终新测试修正，未为fixture错误重复已绿六公开链或原Gate。

| 实际命令run | exit | 秒 | 实际结果 |
|---|---:|---:|---|
'''
for row in sorted(runs,key=lambda d:d['startedAt']):
 text+=f"| {row['label']} | {row['exitCode']} | {row['elapsedSeconds']} | {notes.get(row['label'],'见原日志')} |\n"
text+='''
## 精确交付字节

完整路径/bytes/SHA见runtime/SOURCE_MANIFEST.json。C集成必须同时处理OUTPUT_INDEX.productionSources、tests与files，不可只暂存files遗漏源与测试。最终deadline-v6前快照67件与当前六个受测文件均0漂移；production自final-v4起未再改。

| 文件 | SHA256 |
|---|---|
'''
for row in manifest['productionSources']+manifest['tests']:
 text+=f"| {row['path']} | {row['sha256']} |\n"
text+='''
## 资源与交接

runtime/RESOURCE_CLEANUP.json实查所有21个wrapper记录PGID均无进程残留、所有8个记录自有临时根均不存在，实际TMPDIR与/private/tmp精确T1313前缀盘点无目录；不可变worker hash/bytes未变。失败binding轮创建的绝对临时根未单独记录，只保afterEach清理行为与当前精确前缀盘点，不声称所有系统临时文件清零。afterEach真实stop dispatcher、dispose自有persistence、closeAllConnections并await server.close、rm自有root；无stop/restart候选动作。

原timeout命令五包.vite结果缓存实际足迹保留并与CACHE_BEFORE单列，不删缓存隐瞒副作用；其余runtime缓存自有。OUTPUT_INDEX排除可再生vite-*缓存，明确索引所有生产源、测试、快照/原日志/报告/清理记录。资源查询仅只读owned进程匹配，没有按进程名全局清理。

本地实现及受控验证交付，待Root/R最终索引审核与C集成；执行者不自行签父全功能、真实供应商可用性、PG并发或候选验收，不执行metadata/taskctl/commit。完成冻结后明确RELEASE。
'''
(repo/'docs/verification/t1313/IMPLEMENTATION_RESULT.md').write_text(text)
print('report written',len(runs),'runs')
