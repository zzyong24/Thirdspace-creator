# T-1318：恢复纯组策划论点候选采纳

## 当前真实失败
planning.thesis原task103可生成候选，但ai.tasks.confirm返回428 AccountRequiredError，ai.adoptThesisCandidate要求selected account。planning.contract259/outline318生成及采纳成功不覆盖thesis采纳失败。

新不可变包source 0e1dc6228f1fa3dc02f2b1c7a1cee77ab18d650a，owned-root qyb5ZR/50727；原失败、任务与响应保留，证据见docs/verification/t1318/OBSERVATION_INDEX.json。不用后续task succeeded覆盖单操作拒绝。


## 实施合同
仅thesis-adoption工作单元沿真实workspace授权/锁读取项目与任务，AiRepository装配携原完整scope，保原项目→任务顺序和同tx原子artifact/version/task终态。在本UoW同一transaction最外，先从原任务读出完整冻结user/group/account/groupVersion/membershipVersion并沿既有冻结membership锁A→member→G（pureG仅G），随后原project→task锁，锁后重新核同冻结身份及全部原候选/lease/状态映射。AiService.confirmTask外部短tx已释放，不代本UoW锁；外层读取身份后变更须锁后复核拒绝，不能凭未锁读写入。不新增current-group-version或页面筛选B可用性硬门，不把页面filterB伪装原taskA。业务artifact沿原合法group/filter或legacy范围；不更改positioning/其它采纳锁序。group/filter项目属组时accountnull，不自动选账号/伪legacyctx。新建ArtifactsService的assertProjectOwned窄端口来自本tx已锁真实项目证明，保原通用artifact归属guard，不跨root连接。无量表/contract-outline/通用workspace改动。

## 当场RED及回归
新完整公开projects.create→ai.tasks.create planning.thesis→真实prepare/immutable worker/settled ledger→原结果→ai.tasks.confirm前RED，基线428 AccountRequiredError；改产品前冻结源/完整测试/config/worker/父行/call结果/exit。GREEN从同公开链获得thesis_tree artifact/version与原task succeeded，重复confirm只读原版本不重复铸造。纯G/G+filter/legacy三族；外user/group/错account、原映射/原候选被改、已有版本响应丢失同key重放、artifact或version SQL失败真实rollback/无孤儿、归档取消等实际原门。后续ArtifactsService缺assertProjectOwned是已核第二门，完整绿必须真实写artifact而非stub采纳。

## 授权、范围与执行顺序
用户全功能修复授权及Root本轮明确窄修裁决覆盖本范围；现时尚未改生产/跑本任务RED。正式独评PASS与合法lease/packet后，准确W内一次完成当场完整RED→最小实现→GREEN/Gates/报告，正常RED命中已审范围可直接继续，意外新范围/语义停报，不为每一步重复求批准。三任务分别审核、保原initial与旧失败，不重置T1300审核/不改FUNCTION_MATRIX。现候选三路不换包、不重发旧任务；最终合包和必要真实公共复验由C统一。

## 测试与派生边界
外部Codex协议只在新owned loopback替身，真实服务/dispatcher/immutable worker/SDK/ledger不mock；以已绑定worker 3851b4fb132035f1b03528d68b0fa1c5ab86bda8134d8b98795252295c5a6454（5618216B）实核，禁止测试beforeAll重build ai-worker/dist或写W外源码。新专用test以独立config明确include唯一目标、不merge默认include，cacheDir仅own runtime；固定timeout-policy原Gate的五包node_modules/.vite/vitest结果缓存按真实footprint登记，不能改guard/shim。所有正执行/观察>=120000ms、保原更长；新test/hook至少180000、全链test3600000、外层86400s覆盖启动串行清理；不缩/续持久任务deadline，未知保原taskID。

产品仅下述精确路径，原其它tests只读参考/有build或短预算的suite不原样run：
- backend/src/application/thesis-adoption.ts

测试W：
- frontend/src/server/__module_integration__/group-thesis-adoption.persistence-client.test.ts

自有docs/verification/t1318/runtime/**与IMPLEMENTATION_RESULT.md，后续acceptance/**及REPORT.md；无contract/schema/通用权限/guard修改。精确MODULE_SCOPE与INPUT_LOCK为本轮初审输入。受影响type/boundary/semantic/timeout与当场完整业务回归必做；原PG无环境按实际缺测/skip，不冒PGlite多连接PG。最终pmem/reconcile/taskctl按实际统一收尾，不签未发生的前RED/新包/原生壳或整父功能。

## Round2锁序增量
完整公开confirm入口记录实际SQL锁轨迹，证实冻结workspace锁在project→task前、同tx无另一页面B锁；纯G、冻结A而页面filterB、合法legacy、错owner/转组/取消和SQL回滚覆盖。锁图源码不冒PG已观察死锁；PGlite只证明真实消费者顺序与rollback。原初审PASS保留，本轮是已审方向的可执行精化，生产仍一文件。

固定timeout-policy原Gate最终由C独占一次执行，三路只引用实际当时源码与原结果/五缓存footprint；本任务其余受控test用own config/cache，不在并行时重复共享Gate。未发生的Gate保持待验。
