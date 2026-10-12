# T-1246 问题登记（首轮保留）

先记录真实问题及未验，完成首轮后统一复核和修复。准备期工具问题与产品运行失败分开计；此表不表示首轮已经执行。

| ID | 类别 | 首次事实 | 当前状态与证据 |
|---|---|---|---|
| PREP-001 | Appium工具准备 | 独立APPIUM_HOME首次未登记mac2，doctor exit1 | 已按真实本地driver登记，installed-registered回执doctor通过；保原失败。没有App PASS。 |
| PREP-002 | App原生前置 | macOS Automation Mode disabled；用户选择暂不授权 | App所有操作未验，未建立session/触发认证/启动App；USER_NATIVE_DECISION.md。 |
| PREP-003 | 原生数据隔离 | 只改bundle identifier仍共享CLI/keychain/defaults；不能安全当隔离启动 | 未采用该方案，未触碰原App/用户数据；独评保留。 |
| PREP-004 | 浏览器证据driver | 独评发现部分历史verification与orchestrator/evidence输出未迁移 | 仅准备期修driver输出位置，不改输入/数据/断言；待新SHA独立复核，不覆盖历史。 |
| PREP-005 | 浏览器启动driver | 仅匹配.js而真实Worker bundle为.cjs，会错误拒绝启动 | 仅准备期修消费者；待独立复核真实产物清单，不改产品/build脚本。 |
| PREP-006 | 单测数据库环境 | 部分原测试硬编码55422，但此端口属于T1117另任务PG | 不连接/修改/停止旧server；本轮新临时PG50028。原guard不提前改；危险连接须外层拒绝，原FAIL/skip/NOT-RUN如实保留。 |

产品首轮FAIL由子Agent逐项追加真实case/testId、原日志、截图、归属和复测关联，不能以计划、工具doctor或历史结果代签。

## 本轮已经实际发生的结果

冻结候选 `533224f334c43cdb81a344424e420cad93784dd1`；以下为首轮事实，不被后续修复覆盖。完整用例ID与原堆栈在 `unit-first` 和 `first-diagnosis`，下游尚未到达的断言不计通过。

| ID | 类别 | 首轮事实 | 处理与剩余验证 |
|---|---|---|---|
| DR-004 | 浏览器启动驱动 | webServer默认cwd造成launcher路径重复，MODULE_NOT_FOUND；用例正文0执行 | 仅驱动显式frontend cwd，独评保留；原启动失败日志保留。 |
| DR-PG-ROOT | 浏览器测试前置 | PGlite私有父目录不存在，ENOENT；正文0执行 | 仅建立本轮私有根并使用新run目录；不重置用户库。 |
| DR-005 | 浏览器输出隔离 | 原globalSetup写baseline fingerprint至原测试树；严格冻结门拒绝新文件。54个配置装载失败、116未运行，正文0执行 | 机械迁移输出至本轮目录并独立核全FS消费者；保原17个baseline输入及断言；未签170个功能失败或通过。 |
| CONTRACT-001 | 合同测试清单 | 76文件中2失败，499例456通过/43失败；批准的GET collection-plan-readiness已注册，旧穷尽清单缺此接口，42启动入口旧404门阻断 | 集中修复候选仅两个合同测试，精确加入已有获批接口；保穷尽性/唯一性/各入口真实初始化。尚未修复复测。 |
| WORKER-001 | Worker测试 | 159文件中8失败，1462例1437通过/25失败 | 独评22项有真实合同/fixture漂移证据；3项CJS execution提前退出尚无stderr根因。八文件全部仍FAIL，集中诊断与复测未完成。 |
| RUST-ENV-001 | Rust单元构建前置 | cargo test --locked --offline --lib真实exit101：Tauri资源creatoros-server-aarch64-apple-darwin不存在；测试正文0执行 | 保原log/execution；核能否使用本轮真实包产物补隔离树资源。禁止假binary、修改buildscript或声称Rust/App PASS。 |

开发包实际构建exit0、45项基础测试通过；DMG hash、hdiutil、内外App签名与只读挂载/卸载结果见 `package-first/RESULT.json`。它们不能代签上述失败或原生App验收。Backend/Frontend/类型检查和浏览器仍在执行，不在此填最终计数。

## 额外覆盖与Rust实际执行

- 原contract config未包含两个src测试文件。经独立审查，另用临时config读取原冻结输入实际执行：2文件、30例全部通过、exit0，见 `unit-first/contract-extra*`；保原76文件/43失败，不将不同运行混为原首轮通过。
- Rust只复制本轮真实包的3项资源，经精确SHA和消费者独评后，原命令实际执行280个声明：267通过、0失败、13忽略，134.02秒、exit0。原资源缺失exit101及0正文保留。实际结果见 `rust-first/SUMMARY.json`，没有启动App/系统认证。
- RUST-COVERAGE-001：IPC子进程 `--exact` 缺 `workbench::` 前缀，父测试成功不能代签子harness实际执行；集中修复时保原行为断言并核子用例非零执行。
- RUST-COVERAGE-002：mac cancellation机制探针的固定Python依赖可用性需要单列核验；原条件返回不代表该机制已经测过。相关静态预审和真实harness日志保留，不把13个忽略或条件缺口签成App成功。

## WF005独立启动探针

首轮Worker的3个CJS execution未知提前退出已补实际诊断，原3项FAIL不变：使用原冻结源码/旧test esbuild参数的自有startup-only探针447毫秒真实exit1，无ready、无IPC call、未发任务、禁fetch。原test遗漏外置 `@openclaw/fs-safe`，其 native.js 顶层 `createRequire(import.meta.url)` 内联CJS后得到undefined，真实 `ERR_INVALID_ARG_VALUE`；正式build已外置该依赖。证据 `first-diagnosis/wf005-startup-probe`。集中修仅测试打包夹具/真实stderr/预算与退出清理，不能据此代签官方包执行或原3项复测成功。

## 新整合旅程首轮与实际包探针

| ID | 实际事实 | 状态 |
|---|---|---|
| NEW-DRIVER-001 | INT-ROUTES 假定全部真实页面含 main；/topics HTTP200，但 main 不存在，120秒失败 | 新测试定位器错误，原红保留，集中修正用例后重跑；不宣称页面产品坏。 |
| NEW-DRIVER-002 | INT-ENGINE 假定 models.list 返回空数组；真实7条默认DTO均无 provider/modelName/secret/baseUrl 配置 | 新测试合同断言错误，共享前置可能阻断后续官方49调用；不能把默认空项计为独立模型已配置，也不能签49生成通过。 |
| PACKAGE-PROBE-001 | 实际包Node+execution Worker已发ready，未发task；根工具手动parent.disconnect后未记录exit/close，owned child已不存在 | 保首轮ready/未完回执及工具SIGTERM143，不补签exit0；独评确认Node25 IPC close计数路径后，另轮改工具用SIGTERM和exit监听；产品和包不改。 |

新59启动准入只证明精确源码、驱动和独立运行环境绑定；680个tar成员匹配及Worker ready不能代签生成、UI消费或原生App验收。

实际包独立探针v2随后1437毫秒真实完成：ready + observed exit0 + IPC disconnect/close，owned临时根已清理，`package-worker-tool-v2/result.json`。这是限定无任务加载PASS；原PACKAGE-PROBE-001未捕退出回执及143保持不变。

## Copilot独立分诊

- BC-001：已获用户批准删掉的次区仍被旧E2E要求可见，首例实际停在dashboard；保单AppShell/居中/aria/快捷chip和已跑关闭/Esc/Back行为，集中校准原spec，不恢复退役UI。
- BC-002：旧fixture-only要求发送全POST为0，真实当前合同已要求持久聊天；实际7POST含dispatch/Next诊断/1次chat，只证明提交，不能签模型成功。集中校准为本次仅一次真实提交/原ID/空输入与预填不自动发，不把expect改成泛非空。
- BC-003：确认的静态可达产品需求违背：封面chip及material/cover URL fallback预填仍要求独立生图配置，经applyQuickPrompt注入发送文字，违背T1238 Codex免独立API合同。当前图片素材chip已无此文字，勿泛化。精确最小产品写集两文件+原prefill测试，需真实Codex服务值下点击/提交/同ID回读；首图chip存在不能代签点击。原参考封面资格、归属与用户采纳门必须保留。

来源SHA、已批准行为与每个原失败映射见 `first-diagnosis/t1246-copilot-first-diagnosis.md`，未改产品/断言或重跑。

## 前端公共链独立分诊

- FF-001：确认产品回归：持久任务入队追加可信executionRoute，绑定业务在执行/恢复直接用四字段strict body解析整个payload，正常扫码在staging/login前被拒绝。12例10FAIL仍保留；两negative PASS不能代签旧身份/事务拒绝分支。最小产品叶子为binding service，只剥已知runtime字段、其余未知键仍strict，不取消父子冻结、不为扫码加模型准入。完整10例错误堆栈待原整包结束。
- FF-002：抖音两Fake Page计时收到真实250/370秒内部完成等待，而原外层180秒先超时，content-error映射未到；集中夹具可确定性模拟同类下载拒绝并核生产合法预算，不能恢复生产60毫秒短期限。
- FF-003：文章9红有退役入口、严格保存v2读回夹具错，以及已登记品牌/资料/事实和元数据保护缺口，不能全部删成旧断言；准确逐例映射保留独评分诊。
- FF-004：review.script/publish.package仅两空稿旧succeeded期望与新精确partial合同漂移；不得补假文字或放宽正常稿成功。原零子任务、错误回执等后置未验。

以上未改实现/断言，不签动态完整归因或复测通过；`first-diagnosis/t1246-frontend-first-additional-diagnosis.md`包含来源SHA、原case、最小处置和未到下游。

## 2026-10-12 首轮完成批次补记

- 原浏览器54spec/170唯一case实际结束exit1：131PASS、39FAIL、0skip、0retry；170真实最终截图及trace。完整SHA/原case见 `round-1/533224f/browser-original-dr005/FINAL_FIRST_ROUND.json`。
- DR-006：本轮输出迁移驱动在T1070原spec插入resolve(...)却未导入，2case实际ReferenceError；属于本次工具缺陷，原红保留，集中修驱动并核全逆变换/SHA，不归为产品失败。
- Frontend原完整559文件/5078例actual exit1：4911PASS、158FAIL、8SKIP、1TODO；另1 unhandled error不并入158。完整559来源SHA与实际结果集合一致，未改原源码。
- FRONTEND-UNHANDLED-001：settings-interactive-region原测试遗留refresh.mockImplementationOnce引用已卸载tree.rerender，后续refresh触发Cannot update an unmounted root；原异常保留，集中修fixture生命周期并复验，不签产品异常已消失。
- TIMEOUT-COVERAGE-001：原整包timeout-browser-public为1SKIP；按独立闭包审查另轮启用原未改用例，真实reader31138ms、1PASS、exit0、retry0，保原550000ms预算和取消断言，仅本地HTTP route/新Chromium，不签平台/App。
- 新59首轮actual exit1：框架4PASS55FAIL；业务分类4页面PASS50FAIL5前置缺失，实际生成model call=0。59case、87实际图、trace/ledger/source关闭核对已封存；我们写的错误默认DTO/main假设及未完成Pi/recoveryfixture须集中纠正，不能作为外部用户阻塞或49生成通过。

Backend643与4类型检查尚在执行；上述完整批次不表示全首轮已完成，不在此前动产品或原断言。

## 2026-10-12 首轮结束后的进一步只读归因

- D01（原浏览器第38例）：真实 `/accounts` Cookie 已是本例组；shell 第二页返回目标组，而管理页只读 page1/100 后退到旧组，导致真实两微信成员链接不见。确认为管理分页缺口，最小产品消费者 `account-group-manager.tsx` 及原测试；不删除历史组或把本例提前插入第一页。原报告、scope/成员ID、trace见 `round-1/DEEP_REMAINING_DIAGNOSIS.md`。后置0报告/身份拒绝尚未执行，不签通过。
- 设置原两例关闭后 `about:blank` 风险未定因。另准备严格原 history 透传、独立 fresh 根的诊断工具；尚在独立审核，未执行，不能从源码猜双返回或路由替换。
- 精确写集证据 `first-diagnosis/consolidated-write-set-evidence.json` 已核69个原失败源与533 Git字节相同，映射158前端、25 Worker、43合同、39浏览器真实失败；这是归因映射，不是全文件改写许可/新验收计划/已修或PASS。后端首轮和4个typecheck仍未闭包，正式SPEC写集待完整根因与独评。


## 2026-10-12 全首轮真实EOF与独立补充

- 四包及4types已实际结束。backend643文件/6893例：554文件PASS、88FAIL、1SKIP；6492例PASS、400FAIL、1SKIP，exit1。contract/worker/backend/frontend类型exit0/0/2/2；完整源253×两树、原测试发现/SHA保持。unit原suite改写两个历史render诊断输出，不能称整树clean，见unit-first/first-final-source-scope-check.json。
- BACKEND-ENV-001：400失败中195经原stack与冻结guard行逐case确定（191旧固定55422 guard、4真实Socket拒绝），实际26文件；不能统归余205。仅测试owned PG helper/URL/CLI最小修法待评，保真实PG原正文/并发/恢复断言，不接他任务55422或用户库。
- COLLECTION-001：另2 collection缺既有canonical历史fixture，不计入400失败case；旧Git/raw/wrapper分别有SHA，不能新造历史PASS。复制真实fixture后仍须实际collect正文/类型检查，见unit-first/MINIMAL_FIRST_CLOSURE_CONTRACT.md。
- SETTINGS-RETURN-001：隔离真实短诊断direct /settings一次back→about:blank；侧栏一次back→accounts。实际60183/exit0仅诊断，不是原case通过。原两完整body透明历史补充50968/exit0、2PASS、3backs全部accounts/blank0，仅fresh独立条件，原170两FAIL保留、长suite原因UNKNOWN。真实日志ECONNRESET/aborted未屏蔽；限定可信来源返回合同待独评。
- PROTOCOL-PRODUCER-001：旧V3草案假定native branch可由新公开聊天到达；实际服务冻结ACP，不能删binding/写DB切换。按真实ACP adapter/MCP/turn-start在途拒绝/unknown后只读绑定/原同IDread恢复修合同。MCP ACK不能证明后台provider/usage已持久；合成协议不代官方调用/收费。
- T1097正式品牌/资料/字段与事实采纳合同真实独立复评并reviewctl PASS，SPEC SHA8221447156d8；canonical3f5ea43b69f5/integration75d84c709f8e。该回执不是产品实现或E2E PASS，当前尚未实施。


## 最新完整复测新增事实（不覆盖原FAIL）

- T1250-HOSTS-WHOLE-001：V8精确资格库存修后，原3文件36声明完整运行为29PASS/1FAIL/6原资格SKIP；唯一新停止owner cleanup例24ms返回failed，期待succeeded。原focused成功不能代签整组；待核本例装配/前例状态。证据`docs/verification/t1250/runs/ct1250-regression-hosts-RRhxJc`，source同字节/closed/group0/signals0。
- T1250-CDP-WHOLE-001：原完整31为30PASS/1FAIL/0SKIP；新慢公共case平台账号a不存在404，尚未到慢动作断言。保原负族与新慢断言，待独立核初始化/跨case数据。证据`docs/verification/t1250/runs/ct1250-regression-cdp-2YtCnR`。
- T1254-DOOCS-HTTP-001：最新完整原超时门剩两份Doocs真实request的30秒abort，不能当作原十处动画误报豁免；T1254两树登记CONTRACT，当前只读归档确认同共享fetch源。现原生host.importMedia路径绕过外部providers，旧static CSP拒外连，不能为慢链验收启图床/新权限或把模块探针称当前上传公共链。来源/预算/交付一致性写集仍待独评。
- T1252真实标准检查已结束：完整8文件116PASS/0FAIL/0SKIP、proper MCP types0、scanner8PASS、真实bundle build/smoke0；210源与4914安装实现同字节，5子进程完整关闭/group0。仅此批次通过，不代App/最终开发包或公共慢原生/渲染链。
- T1253-TOOL-SOURCE-GUARD-001：私有未来runner原05c的prepared虚拟候选SHA不能发现已apply三文件恢复known-before，独评在运行前拒绝；新ebee增加actual ready及前后三实际SHA等值。原工具/负路全保，真正原25/46/types已获双方精确准入，正在运行；未提前签测试PASS。


2026-10-12T00:10:34.230899+00:00 T1253-V3-SHAPE-002：完整25和46各同两FAIL；真实usage是2input/3output及完整details、call.totalTokens仍5；advanced IPC原own retryAfterMs undefined被旧严格expected遗漏。仅私有V4精确expect候选，不修生产或降断言。T1250-CDP-WHOLE-001补充：失败实际target未采集故为UNKNOWN；旧case只删除publication，不能称platform account已删除，V9隔离阻断默认HOME连接。

- **T1252-PT002（实际自动化工具失败）**：83BEID 原 collect 声明240000ms，实际240375ms耗尽、退出143；进程组已闭合、源未漂移。Vite mergeConfig拼接test.include，原广域src/scripts范围被带入，名字过滤发生在收集后，三个目标正文均未启动。保留工具32468/live5d62与原始日志；下一候选只修文件scope和静态发现的Unix socket路径长度，不扩大收集预算、不放宽正文断言。静态socket风险尚非原生实际失败。

- **T1252-MINIMUM-DELAY-001（真实时钟下界失败）**：公共渲染第三body实际661486.826334ms后1FAIL，受控阶段109999.8515ms未达到原严格110000ms下界；原16份raw/JSON按SHA封存于`docs/verification/t1252/actual-public-second-render-failed-interrupted/EVIDENCE.json`。此前两body各1PASS保持。wrapper被用户中断，无case2 child/proof/final，不能补拍历史关闭或签整轮通过。当前进程零/全输入未漂移仅为本次现状检查。仅单次出生minimum与提前callback补等的私有候选待独审，原>=110000、六真实SDK阶段、同source/hash、原D和全部57例不放宽；尚未复测。

- **T1254-SB001（实际工具profile语法失败）**：V8 55d29...实际EOF1/55735.437334ms，首sandbox child65/118ms/closed/group0，系统错误host must be * or localhost in network address。24步骤完成0；checker/newdeps测试/两RED/build未开始，fetch仍原a46；source-after绑定同字节，无生产复制。前置review未检出不支持的127.0.0.1:*写法，原工具/准入/错误保持。下一候选仅方向分离localhost网络过滤和受控边界验证，不准*公网/改HOME/启App或自动重跑。

- **T1254-NODE-STDIO-001（真实工具初始化失败）**：V9 b559d...实际exit1/58346.031625ms，首child PID89663 274ms/SIGABRT、closed/group0，25步骤0。独核actual .ips与同UUID libnode映像确认fstat(fd1)错误分支ABORT；helper实际将HOME内docs日志FD用于stdout/stderr，目录限制冲突为有证据的机制推断，具体errno未观察。下一候选只移日志至owned private根，真实关闭后父按SHA归档，并封真实非系统动态库依赖；原HOME/network规则不变，原0 JS/0 RED/0 apply保留。ROOT原始证据：docs/verification/t1254/ROOT_V9_ACTUAL_NODE_INITIALIZATION_FAILURE.json SHA e165362c7dd9fa30deb6fc616880a495500714f7670b7d539156eab34d95aab3。

- **T1254-AST001（真实校验工具失败）**：V10 nonce2829整轮103057.347417ms/exit1，首network0/215ms，第二checker1/2096ms；两child闭合group0，失败日志父原字节归档。真实mapDeps正例reuse未满足当前LogicalExpression断言，checker结果JSON缺失；原8/两预算RED尚未运行，private apply/生产copy为false。source-after同913587/cd995。按实际OXC AST窄纠错，保原9族正确/缺失文件断言，不能修改期望、删case或拿此红作预算TDD。ROOT原始文件docs/verification/t1254/ROOT_V10_ACTUAL_STATIC_GRAPH_CHECKER_FAILURE.json SHA 101ea460bfa6c0d244c963922a97e95343f48e37247dce524e9c4707a173cd8e。

- **T1254-SOCKET-CLOSE-001（真实清理证明失败）**：V11 nonce7898实际旧默认请求30003.785833ms/AbortError/1POST/sourcea46，原合法31秒成功断言真实失败；nativeRED child1/30288ms/closed/group0。报告listenerClosed=true而remainingSockets=1，完整RED准入严格停止，wrapper245642ms/exit1/4of25，未apply/生产copy。下一候选connection即记录真实socket close Promise、完整停止与关闭后再断言Set0，禁止tick/清空Set或改socket.closed为事件证明；独立setup/cleanup均120k、两个RED槽540k/full109.98M以覆盖串行，原31/120/130和请求/单POST断言保。证据docs/verification/t1254/ROOT_V11_ACTUAL_OLD30S_RED_AND_SOCKET_CLOSE_PROOF_FAILURE.json SHA 7e474fb4171bbb75a94cfec1d6accce59c934f2e5a2e77779c79273a40747884。

- **T1254-COPY-MODE-001（真实private应用后模式漂移）**：V12 nonce14bc两完整旧RED及各原8已经实际齐；四private候选bytes正确，但static fetch/test的原0664由fs.copyFileSync变0644，后验guard真实FAIL。wrapper494006.856042ms/exit1/6of25/appliedtrue，application收据与成功source-after缺失，原错误保存。仅准备两mode回原值和原19后续阶段continuation，完整新状态/源/实现双审后进行；不重旧RED、不补历史成功、不改生产。证据docs/verification/t1254/ROOT_V12_ACTUAL_TWO_REDS_AND_PRIVATE_COPY_MODE_FAILURE.json SHA 75e921d90010c41925f5d2e9a96bc3c02f0d979d9ae6ec2a855156eaae39c639。

- **T1254-BROWSER-BUDGET-001（source-v2静态检查，尚未runtime）**：6816完整8工具读出131个file/arch串行otool、实际194contexts，原collector900k不能覆盖每次120k的完整串行；source/runtime verify的多次Git、Next首verify和ledger读库也须进入父槽。原工具和40字节项封存，独审b4f68ced保留。本项属于未运行工具候选缺口，不计E2E body失败；route在保所有旧单槽基础上一次派生父预算，待新绑定双审。

- **T1256-STATIC-UNUSED-BINDINGS-001（真实完整构建类型失败）**：T1254 V13静态原build先完成Vite资源编译，vue-tsc报EditorPanel.vue65/68/75三TS6133，child1/16981ms/closed/group0；wrapper EOF1/10of19，完整69原件ROOT逐SHA f1a69dc保存。原a7+55ab适配保留三个无消费者绑定，真实模板直读viewMode。T1254非shared原源冻结，单独T1256精确SPEC/独评只清这三个声明，保UI模板/原构建与类型策略；当前尚未实施，后续原9步骤待续，原失败不洗绿。

- **T1254-GRAPH-PATHNAME-001（实际图校验失败）**：V14静态完整原build/type0后Graph真exit1/closed/group0，误把window.location.pathname.includes(BASE)根路径成员判断当文件；当场生成图仅两BASE裸literal，另一是已识别Vite参数拼接。保旧Graph017、原9case和失败21件；精确pathname结构notAFile+其它真实资源完整校验与negative族另双审后续，不skip全部BASE、未知引用或删除断言。

2026-10-12T06:51:41.031951+00:00 T1254/T1256后续真实修复结果：V14原static完整build/vue-tsc0；V15全部9正执行child0、原485JS scanner0、两源码完整tar/patch/三个原Gitchecks0，源码后验无漂移。原30秒Abort/模式/三TS6133/Graph pathname误判的失败原件保留；生产精确复制与新完整Gate/包/最终浏览器未完成，App按用户决定未验。

2026-10-12：浏览器运行器纯预算真实 FAIL（27cf，child209ms/exit1，wrapper EOF1，group0），证据 `round-2/actual-external-27cf-only-pure-fc389d5651b5c5a4faf23a8e/EVIDENCE.json`。旧清单 startup1.8M 与原工具实际2.4M相差600k；全部16raw和7私有原件已核，原wrapper-after缺失保留，后续独立审计不回填。新7391仅pure/reseal修真实公式和履历，尚未执行，170/111浏览器验收未完成。

2026-10-12：Doocs交付只读验证9f4三child均真实exit0/closed/group0（静态23、四编辑器、构建prepare），wrapper EOF1：`PREPARED_OWNER_PATH`错误使用父进程默认tmp而子进程实际TMPDIR为owned/tmp。原source-after143462输入未变；原缺失build-entry-results与真实FAIL保留。仅补验结果归属/完整binding，禁止重复三项。后续继承最早UTC2026-10-12T13:12:37.651Z，尚未复制产品。证据 `../t1254/execution/delivery-validation-9f4bdd0b7db6150e1b31768309508baa/summary.json`。

2026-10-12：7391修正真实消费者公式后的唯一纯预算测试实际PASS：child92716 exit0/243ms，真实positive close108.416ms，wrapper EOF0/2391.313ms；343源码及Node82/37link/51边beforeafter零漂移、group0、无signal。新EVIDENCE `round-2/actual-external-7391-only-pure-7dd0492156b02ee92c531d89/EVIDENCE.json`；29档及13私有原件已核。旧652FAIL与原缺after完整保留；本次未运行metadata/reseal/服务/浏览器，不签170/111或App通过。

2026-10-12：Doocs最终交付实际完成，唯一copy73141 EOF0/61239.279ms，73写/53删/636原字节/完整709与66 before备份全核；原132raw保持，独立实际复核8328d830通过，主线程精确stage126 exit0，whole产品ROOTS unstaged0。`../t1254/EXACT_PRODUCTION_COPY_V2_ACTUAL_EOF0_COMPLETE_RESULT.json` 和 `../t1254/ROOT_EXACT_COPY_AND_STAGE_COMPLETE.json`。仍未新commit、开发包或浏览器复测；原9f4 wrapper1/missing保留，独立后处理d759实际EOF0闭合，不合并成原run全绿。

2026-10-12当场工具问题闭合：源码审计真实v5 EOF1/52个自动Git R展示，独核全部对应批准删除+新增；v6精确52tuple投影及52正/421反例实测通过，实际审计EOF0，原969 FAIL保留。打包工具PKG001（中途来源检查未预留完整剩余预算）仅工具v2修闭包并通过独评，尚待新包实际运行；原45例/retry2/原构建脚本不变。三项原Gate已当场通过，boundary5条基线/orphan100warning仍存在；不代签Windows/App或缺offset输入与冻结前端4类型错误。

T1246当场完整全局对账真实23ERROR，旧25原文逐项包含这23，不再报日期/LED053。根因责任沿已存在T1204/T1171登记，19旧审核缺失/过期不补造历史评审；LED052/018/057本轮前置独核，不凭原reconcile标签推断新业务失败或全绿。原94775/raw/比较证据保持。

LED018/057原观察环境PATH遗漏Cargo的精确独立补测78569 EOF0，155/17/15原例全部PASS，当前源码/资源不改；不将原94775缺leaf归因为具体历史127或擦除23FAIL。LED052入口缺隔离PG且原55422与当前owned marker安全规则互斥，沿T1204保存ENV债，不连接foreign55422、不扩guard。
