# 完整 reconcile 的 T-1373 安全复核

2026-10-25，只读核查；当前 HEAD `778ea4559850b0d8dfbf279c312dc4c21d72866e`。本次没有执行 full、HyperFrames CLI、LED-052/053 测试、数据库连接、模型、浏览器或网络请求，没有修改产品、测试、配置、HOME、状态或旧验收。本文件是唯一写入。

结论：**现有 full 不能作为安全且可完整通过的命令直接启动。** T-1373 的真实CLI隔离问题仍成立；另有执行预算缺项和 LED-052 旧端口入口与当前数据库归属守卫冲突。它们是三个不同问题，不能把某项先失败导致后续没执行解释为安全闭环。T-1410 本身要求的 quick read-only 可以继续；不能将其结果称 full 或完整发布GO。

## 当前真实执行路径

```text
node orchestrator/process/reconcile.mjs --profile full
  ├─ 控制审计、asset-check（非 static）
  └─ runLessonChecks：55个配置lesson，按序执行
       ├─ LED-052：node docs/verification/t1022/run-archive-guard.mjs
       ├─ ……其它原守卫……
       ├─ LED-053：node tools/timeout-policy/verify.mjs
       │    └─ 第2组 node --test check.test.mjs hyperframes.test.mjs
       │         └─ node <安装的hyperframes/dist/cli.js> render <临时HTML> --browser-timeout 1
       └─ LED-060：worker build + 3个真实本地HTTP消费者测试
```

旧 T-1373 SPEC 所述 `execSync(L.check)` 已不是当前实现。当前 `reconcile.mjs:781–799` 调用 `lesson-runner.mjs`；runner 的 `runLessonCommand:112` 用 `/bin/bash -c`、独立进程组、有限预算和清理，**没有传独立 env/cwd沙箱或网络策略**，因此仍继承父环境。超时及进程组清理有用，但不能隔离 HOME、真实服务、网络或已另起会话的后台安装。

当前配置没有 `lesson_execution`，55个lesson也没有逐项有效预算。只读取配置并调用纯 `planLessonExecution` 计算，得到 `ok=false`，首项错误为 `lesson_execution.minimum_timeout_ms must declare the project execution lower bound`，其后各项缺 `timeout_ms/default_timeout_ms`。没有执行其命令。若前置控制流程正常到达该分支，当前 runner 会拒绝运行这些lessons并输出 `lesson checks NOT RUN`。这不是一次full运行收据，也不证明补预算后裸跑安全。

`asset-check.mjs:末尾` 在full模式可启动 `assets-runner.mjs`，发生在上述预算验证之前。已核本树 `orchestrator/decisions/assets` 不存在，而 runner 固定扫描该目录，当前没有可执行example；本轮未发现这里另有实际示例副作用。以后若新增example需重新核查，不能推广为所有full前置命令永久安全。配置里的 `frontend_verify_commands` 也不是默认全部重跑；当前流程主要审已有frontend收据，不能据配置存在就声称全UI旅程已执行。

## 已确认的问题及最小处理方向

|问题|当前证据|影响|最小处理方向|
|---|---|---|---|
|真实CLI无有效环境/网络隔离|`tools/timeout-policy/hyperframes.test.mjs:40–46`|真实安装CLI可读写调用者HOME并发起辅助网络/后台安装；本次仅证静态可达，未声称已发生|只收窄这个真实CLI子进程的环境与OS能力；保真实公共命令及原断言，不改产品、依赖补丁或门目标|
|full执行预算缺失|`reconcile.config.json`；`lesson-runner.mjs:12–45`、`reconcile.mjs:781–799`|lessons计划拒绝，无法取得完整执行结果|按实际55项命令的预算补项目执行策略；重型Cargo/多工作区链不能随便填统一120秒；保执行/清理/外层严格关系，不改runner绕过校验|
|LED-052固定端口过期且矛盾|`docs/verification/t1022/run-archive-guard.mjs:5–7` 与 `backend/src/test-fixtures/owned-postgres.ts:19–31`|wrapper强制55422，当前owned守卫却明确禁止5432/55422；合法随机实例在wrapper就拒绝，伪装55422在实际测试再拒绝|旧wrapper复用现有owned PG身份校验及本轮启动流程，不新建PG路由或削弱守卫；缺配置应继续fail，不能skip冒PASS|

LED-052 的目标测试 `backend/src/integration/startup-group-collectors.postgres.integration.test.ts:5,17–20` 使用 `OwnedPostgresPool/assertOwnedPostgresUrl`；每例随机创建 `t1022_startup_<UUID>` 库并登记、清理，只能操作已证归属的实例。当前守卫验证marker/nonce、0700根、PID出生时间、二进制、数据目录、账号、端口及实际服务器身份。**不能开一个55422服务、复用旧服务、设置审批绕过变量或改守卫来满足旧wrapper。** 两个URL都要指向经当前规则证明的本轮实例，不能一个合法、一个指真实业务库。

## HyperFrames风险的源码事实

安装版本为0.7.54，CLI SHA256 为 `1250669d951c4a462b7e4b5d574256f61978797ba3b941cc8491d620e3ef925b`，与原测试的锁定摘要一致；没有升级依赖。

- 测试第43行只设置 `HYPERFRAMES_TELEMETRY=0`，其余使用 `...process.env`，没有隔离HOME或cwd。此变量在已安装CLI源码中零次出现。真正关闭遥测的是 `HYPERFRAMES_NO_TELEMETRY=1`（CLI第79114–79130行）。
- CLI配置位于 `homedir()/.hyperframes/config.json`（第60254行附近）；`readConfig` 的首次/错误恢复可写默认配置，`writeConfig` 建目录并以临时文件rename落盘（第60223–60243行附近）。所以“配置只是读一下”不成立。
- 顶层在第185792–185817行调度遥测、`reportCompletedUpdate`、`checkForUpdate` 和 `checkSkillsForUpdate`。`render` 非help/非json会进入更新分支；子命令参数最终拒绝一秒预算，并不能证明这些先调度的异步动作没发生。
- `checkForUpdate` 第83175–83205行可访问NPM registry并更新配置；skills检查第185353–185375行可读取/刷新skills状态和缓存。第185186行起的auto-install路径可启动detached Node进程，再执行包管理安装、写日志与配置。
- `HYPERFRAMES_NO_AUTO_INSTALL=1` 有效阻止后台安装。`HYPERFRAMES_NO_UPDATE_CHECK=1` 在已安装源码中的作用是抑制通知、报告已完成安装及auto-install；**顶层实际调用的 `checkForUpdate()` 和skills检查没有据此跳过fetch。** 因此只补几个env开关，或把CI置1，仍不能作为零出网保证。禁止读用户配置来猜其当前缓存是否恰好避免网络。

保留原真实CLI调用的 `render <临时HTML> --browser-timeout 1`，以及“非零退出、包含120、没有ENOENT/缺模块”的断言。不得改用函数模拟、删除此测试、加skip或把CLI返回错误改成成功，不能用单纯静态检查代替公共入口回归。

## 推荐的窄修复与复验边界

本轮只提出方案，不实施。按既有 T-1373 收敛一个精确测试入口/执行环境delta并做正常独评；不新增通用隔离引擎，也不要求用户重复确认已授权的修复任务。

1. **先修真实CLI测试自身的子进程边界。** 为该子进程创建本轮全新私有HOME、配置/缓存和工作目录，采用最小环境白名单，保必要Node/模块解析；不得复制用户配置、凭据或注入业务endpoint。传入实际有效的NO_TELEMETRY/NO_AUTO_INSTALL开关，但不依赖它们承担网络隔离。
2. **仅对这个不需要HTTP的真实CLI子进程禁全部网络。** macOS可评估并复用T1368已实际成功的原生 `sandbox-exec` 能力；仍需对本次修改后的cwd/HOME/写入边界、子进程继承和清理做真实证据，不能拿旧单门收据代签。原T1368的 `(allow default)(deny network*)(deny file-write* (subpath "原HOME/.hyperframes"))` 仅保护一处用户目录，不能声称保护全部用户数据；新边界应保证仅本轮必要输出路径可写。其他平台若缺对应已证能力应明确失败/阻断，不能skip后PASS。不要顺手把全部full套进未经审查的新沙箱。
3. **保持其它测试的合法本地HTTP。** LED-060 的 `pi-provider-json-compat.test.ts:21`、`radar-model-result-unknown.repro.test.ts:74`、`transcribe-postprocess.integration.test.ts:52` 用 `listen(0,'127.0.0.1')` 创建各自合成服务器；使用合成token、内存PGlite，实际闭环验证SDK/worker。全部禁network会误杀这些合法回归；“放开整个localhost”又不能证明不会访问已安装App/代理。窄CLI子进程禁网络可避免改变这些原用例的行为。
4. **处理LED-052旧入口和执行预算。** 采用现有owned PG启动/marker/URL验证，验证wrapper与正式测试同一实例身份，预算按命令实际能力配置。不要临时覆盖生产配置、放开旧固定端口、改测试目标或伪造receipt。
5. **再分步执行原目标。** 先真实验证新CLI边界及原LED-053八组，再验证LED-052真实owned PG链，最后在相关改动独审通过且剩余命令环境查明后运行原full，保原命令/阶段/自然退出、完整输出、运行前后受保护metadata、归属/清理和结果。不能把两单门成功拼成full已跑。当前55项完整副作用闭包尚未逐一证完，本报告不为未读的所有测试签安全PASS。

LED-053当前八组还包括 contract、worker、backend、frontend、MCP及Node回归，`verify.mjs:20`均继承环境。已核其中MCP `tests/cli.test.ts` 使用mock fetch和合成token，并非本轮此前真实业务CLI对话；不能把所有名字含CLI的测试一概视为真实业务。反之，测试自称隔离也不等于OS隔离。LED-061明确会暂写两份历史内存观测再恢复；LED-060会重建 `ai-worker/dist`。full还会写 `.lessons-stats.json`，它本身不是只读操作，应在已知主线程串行边界内执行，保全原证据，不能与冻结打包/依赖构建交叉。

## 可执行/不可执行命令结论

|命令|本轮判断|
|---|---|
|`node orchestrator/process/reconcile.mjs --profile quick --read-only`|本任务已授权的控制审计路径；不执行配置lessons和asset example，不替代full|
|`node orchestrator/process/reconcile.mjs --profile full --read-only`|同样跳过可执行检查；不能借full名字宣称完整覆盖|
|`node orchestrator/process/reconcile.mjs --profile full`|当前不直接启动；预算缺失、LED052冲突和CLI隔离需先正常闭环|
|`node tools/timeout-policy/verify.mjs` 或直接 `node --test tools/timeout-policy/hyperframes.test.mjs`|包含未隔离真实CLI，当前不得裸跑|
|只设置NO_TELEMETRY/NO_AUTO_INSTALL后跑full|不足以关闭update/skills实际网络，也没有用户目录保护；不是可接受闭环|
|将T1368禁全部network的profile直接包住整个full|会阻断合法owned PG及合成本地HTTP，且原目录写边界过窄；不能直接复用为全门证明|

旧T1368单门174PASS、旧full58/childUNKNOWN、T1373预检阻断及本轮quick结果分别保留。未发生的新full次数、退出码、错误数量全部不补写；不更改T1373状态或旧验收。

## 核查文件绑定

|路径|SHA256|
|---|---|
|orchestrator/process/reconcile.mjs|414042d814bbd1c88c1d210d2f2bbe9481e693d842c60b7ad67fe89199f4b6c8|
|orchestrator/process/reconcile.config.json|00f439feb731856257da65f0ee25d4929f58e59ddeef8aa8e3ef2fdb619a8a76|
|orchestrator/process/lesson-runner.mjs|84a467cfe2ea109e35f84d46cd1f3fa320986d993b84126d6ae7ef1bdea19c4a|
|tools/timeout-policy/verify.mjs|7db6f10f79d91829fae56a2f902737bc4977462b39da5c01c8f50f15e40e0fae|
|tools/timeout-policy/hyperframes.test.mjs|988e1cdb67cf68a9cc7225c8007e6b2078f1402f7dc632e1fed3de67d383db38|
|docs/verification/t1022/run-archive-guard.mjs|ebd96c358100d3275f32228c9330da5ba0e4fc6e23bc5ef31a5f506dae61aedd|
|backend/src/test-fixtures/owned-postgres.ts|4eb42679bdaf9cef93957472d91a69471f42ac6de57e32a81901d28e3fe61ad0|
|docs/features/t1373-reconcile-cli-side-effect-isolation.md|95107f96829489c4b3b2e508849bd468eadc65f7aaa3a7848de71532f61e1694|

另读原T1373 OS_ISOLATION_READONLY_ASSESSMENT、T1368报告、DEC-137301/137302、asset-check/assets-runner、LED060三项测试、LED061资源驱动及MCP CLI测试。独立性为继承宿主模型的同构子会话；不声称核实具体模型型号，不代表产品全部验收或发布批准。
