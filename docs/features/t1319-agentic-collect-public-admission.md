# T-1319：恢复公开agentic采集任务执行器准入

## 当前真实失败
group18公开创建BBC Technology RSS source intelligence-source-e80980cf-349，runInitial=false/monitorEnabled=false。execution.tasks.create agentic.collect实际400 ValidationError“未注册的 executor: agentic.collect”，无task ID/模型，不绕ai.tasks.create或manual runs.start。

新不可变包source 0e1dc6228f1fa3dc02f2b1c7a1cee77ab18d650a，owned-root qyb5ZR/50727；原失败、任务与响应保留，证据见docs/verification/t1319/OBSERVATION_INDEX.json。不用后续task succeeded覆盖单操作拒绝。


## 实施合同
仅persistence薄装配把public execution hasExecutor/loopType接到真实已装配worker definitions/supports，definitions key=exec.agentic.collect/material/research而公开spec.taskType=agentic.collect/material/research，准确规范映射，不能错前缀或return true/硬白名单注册假executor。deterministic registry原样，未知类型仍拒。初始化closure须真实就绪，不在定义前同步访问TDZ。已有agenticBusiness支持表作为能力真相，public准备继续原spec/network=deny/输入归属/browser grant/attempt fingerprint/ledger/fence/期限，不新增模型provider/新Runtime/工具链/凭据机制。

## 当场RED及回归
新owned真实RSS source runInitial=false/monitor=false，公开execution.tasks.create agentic.collect在基线实际400未注册为前RED（0task/provider），不能raw ai.tasks.create exec.*或直接supports代签。GREEN同public create→真实prepare/dispatcher/immutable worker/protocol替身→collect.plan/run稳定key→真实ownedHTTP RSS item/snapshot→ledger/终态，全部外部协议只有自有边界替身，不mock业务service。另actual同definitions material/research公开准入和规范loop；未知type/deterministic echo、network非deny/未授权browser参数、外组asset/source、旧key不同body与原预算不续期、取消/fence/unknown不重发回归。未发生真实外部网站/供应商模型不冒公共实采；新包真实RSS/工具仍另验。

## 授权、范围与执行顺序
用户全功能修复授权及Root本轮明确窄修裁决覆盖本范围；现时尚未改生产/跑本任务RED。正式独评PASS与合法lease/packet后，准确W内一次完成当场完整RED→最小实现→GREEN/Gates/报告，正常RED命中已审范围可直接继续，意外新范围/语义停报，不为每一步重复求批准。三任务分别审核、保原initial与旧失败，不重置T1300审核/不改FUNCTION_MATRIX。现候选三路不换包、不重发旧任务；最终合包和必要真实公共复验由C统一。

## 测试与派生边界
外部Codex协议只在新owned loopback替身，真实服务/dispatcher/immutable worker/SDK/ledger不mock；agentic链必须由真实resolveAgenticWorkerPath→createAgenticWorkerDispatcher消费已包内agentic-worker.cjs，1538258B/SHA24c1e7d8eb385e87ed7c69bc5d9b5f4d180df61abe09afe561335a30804a8728；原execution-worker.cjs 5618216B/SHA3851b4fb132035f1b03528d68b0fa1c5ab86bda8134d8b98795252295c5a6454仅绑定其它execution模式，不能代agentic入口。两产物均在原不可变包按实际路径核SHA，禁止测试beforeAll重build ai-worker/dist或写W外源码。新专用test以独立config明确include唯一目标、不merge默认include，cacheDir仅own runtime；固定timeout-policy原Gate的五包node_modules/.vite/vitest结果缓存按真实footprint登记，不能改guard/shim。所有正执行/观察>=120000ms、保原更长；新test/hook至少180000、全链test3600000、外层86400s覆盖启动串行清理；不缩/续持久任务deadline，未知保原taskID。

产品仅下述精确路径，原其它tests只读参考/有build或短预算的suite不原样run：
- frontend/src/server/persistence-client.ts

测试W：
- frontend/src/server/__module_integration__/agentic-public-admission.persistence-client.test.ts

自有docs/verification/t1319/runtime/**与IMPLEMENTATION_RESULT.md，后续acceptance/**及REPORT.md；无contract/schema/通用权限/guard修改。精确MODULE_SCOPE与INPUT_LOCK为本轮初审输入。受影响type/boundary/semantic/timeout与当场完整业务回归必做；原PG无环境按实际缺测/skip，不冒PGlite多连接PG。最终pmem/reconcile/taskctl按实际统一收尾，不签未发生的前RED/新包/原生壳或整父功能。

固定timeout-policy原Gate最终由C独占一次执行，三路只引用实际当时源码与原结果/五缓存footprint；本任务其余受控test用own config/cache，不在并行时重复共享Gate。未发生的Gate保持待验。
