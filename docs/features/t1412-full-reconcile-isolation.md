# T-1412 完整对账的执行预算与测试隔离

用户2026-10-25明确继续修复“官方Pi和没通过的验收，复验通过后再推送”；本项是其中已证实的验证入口维护。目标是让原full能够在明确执行预算和本轮隔离输入中真实运行，既不接触用户数据/凭据或生产网络，也不删检查或把未运行当通过。只修三个已定位问题，不修产品功能、审核引擎或新建通用隔离框架。

事实源：[只读安全报告](../verification/t1410/full-reconcile-safety-review.md)。当前基线 `778ea4559850b0d8dfbf279c312dc4c21d72866e`，报告列出实际文件SHA；实施前核实际差异，相关文件若已变需重核，不因其它任务正常新增行冻结整个工作树。本草案不是已实现、已审通过或已发生的红绿证据。主线程先处理当前打包，通知冻结结束后才实施。

## FR-141201 原runner预算配置

当前配置有55个lessons，却没有 `lesson_execution`；`planLessonExecution`在运行前拒绝缺预算。仅在 `orchestrator/process/reconcile.config.json` 增加现有runner支持的 `minimum_timeout_ms`、`default_timeout_ms`，按实际需要给原lesson增加 `timeout_ms`；不改lesson ID、顺序、check、onFail、数量、门阈值或执行器语义。

正执行下界仍为120000ms。数值均须为runner支持的有限安全整数；default/逐项预算不低于下界，重型Cargo、worker build、多工作区串行链须计入原命令完整执行、初始化与内部等待预算，不能统一以最低两分钟覆盖任意长链。实施证据 `budget-inventory.json` 逐项列原命令及摘要、已有内部test/hook/构建预算依据、拟定上界与余量；数值先可核再落配置。不缩短原内部预算、不添加自动重试、不把超时记成功。复用runner已有cleanup/settlement默认值；优先由runner原公式计算overall，若显式配置则须严格覆盖全部串行执行、清理和结果落盘，并在现有timer有限范围内。

只用现有 `planLessonExecution` 验证配置；缺项、低于下界、外层不足继续正常失败。未运行原lesson只记录NOT RUN，不能把计划通过当full通过。

## FR-141202 旧归档执行入口对齐现有owned PG

`docs/verification/t1022/run-archive-guard.mjs` 当前强制两测试URL为55422，而实际测试使用的 `backend/src/test-fixtures/owned-postgres.ts` 明确禁止55422和5432。只修旧wrapper：在启动原vitest之前，复用现有 `assertOwnedPostgresUrl/readOwnedPostgresMarker` 等公开测试夹具，验证本轮marker/nonce、用户、随机端口、PID出生时间、二进制、dataDir和管理身份。两URL都验证且指向同一本轮临时实例；不借仅hostname/port判断归属，不复制另一套宽松校验。

沿用现有T1246 owned PG的临时实例启动机制，保其marker格式和nonce语义。缺配置、旧55422、伪marker、nonce/owner/PID或实例不符在启动vitest前拒绝；不连接用户库、不清旧库、不修改守卫或设置绕过变量。原三个测试文件、参数和随机临时库CREATE/DROP登记及清理保持；不能用skip取代缺环境失败。若现有启动机制或Node加载TS测试夹具在本机无法安全使用，保阻断和原错误，不扩成新的数据库路由/管理框架。

## FR-141203 真实HyperFrames CLI子进程边界

保持真实安装的0.7.54及原patch/CLI SHA锁定，不修改依赖或生产代码。保留原公共链 `node <实际cli.js> render <本轮临时HTML> --browser-timeout 1` 和现有非零退出、错误包含120、没有ENOENT/缺模块断言；不换成mock函数、删测试、skip、改help/json模式或只跑词法检查。

仅这个真实CLI子进程进入本轮私有临时HOME/cwd与缓存/配置路径，环境采用必要值白名单，禁止继承真实凭据、模型/平台/数据库endpoint、NODE_OPTIONS等注入项；不复制用户配置或读其正文。临时根0700、必要文件0600，路径按真实解析及所有权校验，argv无shell拼接，清理只限本轮精确根和owned子进程。测试仍用绝对CLI路径加载同一依赖，不能因换cwd误启别的版本。

原生能力以当前macOS已有 `/usr/bin/sandbox-exec` 和T1368实际使用机制为起点：对子进程及后代禁止全部network（含loopback），限制写入仅本轮必要临时输出；读取满足现有Node/依赖即可，不授予真实用户配置/数据/Keychain读取。确切profile与有效argv/env白名单在实施证据记录，执行前用本轮合成控制探针证明有效，不能凭profile字符串自报隔离成功。不得把原 `(allow default)`、只deny某一个用户目录的profile宣称全用户目录保护。

传实际有效的 `HYPERFRAMES_NO_TELEMETRY=1`、`HYPERFRAMES_NO_AUTO_INSTALL=1`，可同时设NO_UPDATE_CHECK抑制通知，但隔离不能依赖env关网络：已安装CLI顶层update/skills仍可fetch。原生隔离不可用、权限不明或能力探针无法证明时fail closed并保阻断，不裸跑CLI、不退回只有env的方案，不skip后PASS。其他平台仅在同等实际隔离已证时运行该入口，本次不新增未证跨平台沙箱实现。

保持有限执行/清理预算和完整child退出；超时、被信号终止、残留后代或无法确认清理均为incomplete/fail，不以wrapper成功代签。禁止把沙箱扩大到整个full后再随意放开localhost：LED060原本需要自有loopback HTTP，LED052需要本轮owned PG，均保持其原合法输入。

## 精确候选写集

本次先写SPEC和本任务证据，尚不实施。评审通过后允许的实施候选限定为：

- `orchestrator/process/reconcile.config.json`：仅FR141201的预算字段。
- `docs/verification/t1022/run-archive-guard.mjs`：仅旧入口复用owned PG校验及可测试的入口组织。
- `docs/verification/t1022/run-archive-guard.test.mjs`（新增）：旧入口准入/拒绝及真实owned链回归。
- `tools/timeout-policy/hyperframes.test.mjs`：仅真实CLI子进程隔离、原断言与finally清理。
- `tools/timeout-policy/hyperframes-cli-isolation.mjs`（新增）：该测试专用的env/路径/原生隔离边界，不导出产品运行能力。
- `tools/timeout-policy/hyperframes-cli-isolation.test.mjs`（新增）：合成能力探针与失败关闭回归。
- `docs/verification/t1412/**`：预算纯计划测试、原件/红绿日志、合成输入、当前安全及运行收据；实际执行原门产生的ignored缓存/owned临时实例按原机制管理。

`reconcile.mjs`、`lesson-runner.mjs`、owned PG守卫/启动器、原HyperFrames补丁、原lesson check和产品路径均只读。若现有机制不足，先列精确原因和必要delta补审，不临时扩写；不改T1373旧规格/状态/历史证据。任务状态/评审/DEC由root按现有工具串行登记，本子任务不手改。

## AC-141201–05 真实红绿与收尾

1. **预算红绿。** 在现有未改配置上新增纯计划回归，调用真实 `planLessonExecution` 期望当前项目计划有效，旧配置自然失败；同时覆盖缺预算、低于下界、外层不足继续拒绝。补配置后同组转绿，并比较全部原lesson ID/顺序/check/onFail完全相同，55项不删不skip。纯计划不会执行任何lesson；保存此边界。
2. **归档入口红绿。** 先用本轮真实owned PG生成的合法随机URL/marker运行原wrapper，记录它因旧55422限制拒绝的红测；无须连接旧固定端口。修复后同一准入条件下原三个vitest目标自然运行并保真实退出/库登记与清理证据。缺marker、nonce错、旧固定端口、异实例URL在进入vitest之前拒绝；负例可用合成伪值，不为测试制造真实不受控实例，不读取用户库。
3. **CLI隔离红绿。** 在安全合成能力探针上证明旧子进程规划没有独立HOME/cwd/OS断网边界；红测不得为制造失败而裸跑未隔离的真实CLI。新边界实际证明允许读取必要Node/依赖、写本轮临时fixture，拒绝读取合成敏感目录、写临时根外合成canary、连接本轮自有loopback canary；子进程/后代执行限制继承，原生机制缺失会在真实CLI启动前拒绝。探针只触及本轮合成文件/自有listener，不能请求真实外网或用户服务。然后在已证边界内实际运行原0.7.54 CLI到原一秒参数拒绝，完整保留原断言和自然退出；不把能力探针结果代真实CLI结果。
4. **原守卫与完整运行分证。** 相关纯计划/隔离/owned PG测试转绿、独立代码复核后，原 `node tools/timeout-policy/verify.mjs` 八组与 `node docs/verification/t1022/run-archive-guard.mjs` 在合法本轮环境真实执行，保所有原文件/断言且0skip。核其余原full命令的实际输入/副作用在允许边界内后，才串行执行原 `node orchestrator/process/reconcile.mjs --profile full`，不改检查集合、命令或结果计数；真实记录命令、候选、配置/依赖摘要、有效环境边界、child退出/信号、完整输出、耗时、受保护metadata前后和owned资源清理。未能安全证明/运行的项保blocked/unknown，不称full PASS；其它新失败保原错误，按因果另行收敛，不顺手扩产品范围或改门洗绿。
5. **流程收尾。** `git diff --check`、适用boundary、相关已有owned PG回归和pure runner预算回归；`reviewctl audit`、`backlog-health`、quick read-only及full各报真实结果。最后pmem sync/reconcile/taskctl由主线程串行处理；历史>30KiB、状态矛盾、旧full58/childUNKNOWN、T1368单门174PASS及T1373原阻断各保来源，不倒填新收据。不触发UI旅程、真实账号/模型/采集、安装或发布；本任务通过不能代签官方402恢复或全产品验收。

本SPEC沿用用户既有修复授权，不增加用户选择、支付、生产网络、用户目录写或再次安装授权；普通修复细节由执行代理按事实推进。打包冻结期间不写主树；实现及运行必须在主线程通知冻结结束后进行。

## 六项失效测试引用的串行交接与最终完整运行

实施期间独立核查确认原55项中有6处引用了3个已删除测试文件，已另立 T-1413 并获得规格评审 PASS[REV:494c1524a579]。T-1412 的 FR141201/AC1 保持不变：本任务冻结候选必须证明只增加预算，原55项 ID、顺序、check、what、onFail及其它原配置逐项守恒。两项原单门、完整合成隔离证明、owned PG归属与清理、独立代码审核全部保留。

T-1412 实现及聚焦回归通过、独审并冻结后，由root串行交接T-1413，前者继续保持进行中，不能为解除队列依赖提前标完成。两任务不并行写配置或产品路径。T-1413独立按其规格迁移六项check并补当前正式链覆盖；它的合法变更不冒称T-1412原命令逐字守恒。追加目标后须重核实际预算适用性，若需预算增量先独评，不缩减原内部等待或重试。

第4条的最终full改为在两者合并且已独审的明确配置SHA上执行原 `node orchestrator/process/reconcile.mjs --profile full` 入口，保55项ID/顺序/what/onFail及无关check token、保真实结果计数，不改引擎或改写输出。先证明安全输入/副作用，再运行；一份真实完整收据可由两任务分别引用其范围，无须重复高成本full。没有执行或仍有失败/缺失覆盖的项目仍如实记录，不能以交接、局部通过或引用同一收据宣称全部验收通过。
