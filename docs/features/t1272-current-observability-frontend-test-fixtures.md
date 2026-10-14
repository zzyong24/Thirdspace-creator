# T-1272 校准新增观测后的前端回归夹具与迁移库存

用户已经授权 T1246 全功能验收、记录问题后集中修复。正常整轮 2,627 实际执行的 16 个 FAIL 保留，来源 /private/tmp/t1246-full-190-normal-gates/final-actual/ACTUAL_COMPLETE_NORMAL_2627_RESULT.json（703fa14701d7ff26ec6d91275aff5a4911fcca8bdf9803b1820f1d5f047aaf43）。本任务仅处理其中前端 6 项：三个旧冻结来源回归把当前 journal 末条硬编码为 0133；三个设置模型保存/切组/ABA回归的 client 替身缺少当前加密日志卡正式 getLogReporting，卡片因此显示不相关的共享状态读取错误，原全页 alert 断言先遇该错误。只读定位 a632fc977e4978b8c3d48f7ef0618da2acf9d71a31324a6643a47b4d6c02fea9。另一个 303 秒 TypeError fetch failed 的图像/PDF真实host回归与缺素材六项均不在本叶，不删除、不签通过。

给人看的结果：新观测功能不会因测试替身缺接口而遮住模型保存的真实错误；旧库升级到当前版本后仍逐项保留老数据、原执行与重放保障。

写集仅 frontend/src/server/legacy-frozen-source-read.integration.test.ts、frontend/src/features/settings/settings-interactive-region.test.tsx，本任务 SPEC/审核/证据及既有主控制面。不改产品组件、共享状态/error策略、任何 getLogReporting/setLogReporting 服务合同、journal/SQL、provider/SDK、用户数据库或任务。当前主工作区合法含 0134/109 和完整观测 DTO；打包树仍 108/425，没有该观测产品变化，不能单独把这些夹具改动复制进打包树，也不能回退观测生产来凑绿。

迁移回归保原四例、旧 104 前缀、完整实际 SQL hash/when 账本全等、0130固定条目、偏好列、归属、完整原Worker/原completion与同source重放。固定旧0133必须仍在 idx107；当前最后新增的 idx108/when1791043200007/tag0134_client_observability用固定已审核 SQL 哈希 d9ffc8a011672cc985015d3f6cafcb693be8b77f33b5f04d6906d25939f80494 核，不能只改成任意末条或删原尾保障。

设置回归保原81项全部断言/标题/预算。给替身补当前正式日志共享 getLogReporting/setLogReporting 的完整合法 DTO（consentVersion2、测试专属固定合法 UUID、真实零/关闭/空队列状态），经原 contract Schema 验证，仅测试虚构输入，不声称真实账户或上报成功。已有模型/存储等替身和scope生命周期照旧；不mock掉整个加密日志组件、不删共享错误，也不放宽模型保存错误、probe0、切组及ABA晚到保护或只换宽松selector遮异常。若按需要收窄selector，必须仍精确观察模型原错误、原scope且前述不相关getter真实正常返回。

先独立评审本 SPEC 与两原测试/当前生产消费者和 DTO。原当场6红保留，不补拍TDD。私有候选先完整85原例正常独占私有 PG/PGlite和正式Workerfixture链验证，不调用真实模型/用户库；retry0、保原1.8M body/3M hook与更长明确预算，外层完整覆盖启动/串行/关闭。完整正常frontend原tsconfig noEmit通过，保护源码前后字节和全部进程/库归属关闭。初评和真实候选通过后 Root 精确应用，应用后的正常完整85和类型复验，不将私有变体签成正式源绿色；原未进入Worker的3例后置必须这次实际执行。pmem/reconcile/任务审计与可追踪提交按真实结果收尾，父新包和全浏览器/App未验独立保留。

```mermaid
flowchart LR
 A[旧库与旧测试替身] --> B[当前109迁移与正式共享DTO]
 B --> C[保原记录和原模型错误]
 C --> D[85原例完整复验]
 D --> E[精确合入并正常复验]
```
