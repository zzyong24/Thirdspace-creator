# T-1411 独立代码与证据复核

日期：2026-10-25。审查者：`/root/t1427_contract_review`；未参与本项实现，未修改产品、测试、SPEC、控制面或原测试回执，仅写本报告。当前精确模型 ID 未核实，不作异构模型声明。

**结论：本次三项产品修改及两项测试修改符合已审 SPEC，未发现需要继续修改的产品代码问题，可以进入后续提交与构建门。** 该结论不等于安装版通过、官方 402 根因已定位、完整对话已恢复或全任务可以推送。T1427 的源码 UI 补充核对见下文，其范围不并入 T1411 鉴权修复结论。

## 绑定与方法

基线为 `778ea4559850b0d8dfbf279c312dc4c21d72866e`。已重读 T1411 任务包 §1–5、§7–9，写证据前核对 §6；对照 SPEC、产品宪法、当前差异、全部新增 backend 测试、frontend 真实 worker fixture、request IO、worker-entry 和 Pi 适配器。已读取各原红绿日志、静态门日志和实施交接，独立重算下表哈希并与 `source-hashes.json` 相符。评审者没有另跑模型/HTTP 测试；这些运行证据由实施代理当场执行，本次通过源码、原失败断言和最终日志交叉复核。评审者另执行五文件范围 `git diff --check`，exit 0。

产品宪法：`docs/产品定位.md`，SHA-256 `86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`。以下冻结值仅覆盖本次审查，不为共享工作树其余改动签字。

| 文件 | SHA-256 |
| --- | --- |
| `contract/src/internal/model-probe-io.ts` | `70fa5fc9cded08e650e5924cfdf4d78b23aeb8b004b9ed63a2de2d0011064a8a` |
| `backend/src/modules/ai-runtime/model-probe-io.service.ts` | `84539272de5b3430ac64847e7fb5cb3f64ef768812f6e0b16bdd662094f93abd` |
| `frontend/src/server/settings-model-test-wrap.ts` | `b8b750e3150509a2dfd5778ede26c06724d5c0be6a8141e7b5d2e660a85a9959` |
| `backend/src/modules/ai-runtime/model-probe-io.service.test.ts` | `c4a22cb356fed0d869a933239960a3d5768930253006cdb41fe4f6c01434de5c` |
| `frontend/src/server/settings-model-test-wrap.test.ts` | `bb2a872c1321fe559198e84edfe4fe82ddc010958115da8dead46793e67cfc18` |
| `docs/features/t1411-model-probe-auth-parity.md` | `9f96d971292778c094418199950aaa289ba9e403c381768458618f188b04dc44` |

## 代码审查事实

- `contract/src/internal/model-probe-io.ts:5` 只给文本内部 schema 增加可选二值枚举，外层与 spec 仍 strict。省略值继续被接纳，非法大小写、空串、null、数字被拒；图片仍拒绝 authStyle，任意 headers 仍不能注入。公开 operation 未改。
- `backend/src/modules/ai-runtime/model-probe-io.service.ts:9` 在原窄投影保留 authStyle。request IO 在启动 worker 之前解析同步 payload，派发时再解析；新增负向测试用 entryPath spy 证明非法值不会被静默丢弃后启动进程。
- 原 worker-entry 直接把解析后的 spec 交给 modelFor，仍使用 128 输出上限、零重试与原取消/清理链。现 Pi 的 Anthropic bearer 路径关闭 apiKey 并设置 Authorization，其余路径沿原规则；本次没有第二套请求构造器。可选值为 undefined 时仍走原 Anthropic x-api-key 默认，OpenAI 两协议原行为未变。
- `frontend/src/server/settings-model-test-wrap.ts:213` 保持非空正文或思考流即可确认最小探针的原判断，只统一准确成功文案。空流失败、支付白名单、401 分类和脱敏日志均未改变。文案不再把首个流式片段表述为完整正式聊天完成。
- 本次没有新增记录 token、headers 或上游正文的生产日志，也没有配置/钱包/业务库写入、模型替换、预算提升、自动重试或 fallback 改动。

## 红绿与回归证据

| 证据（本目录） | 实际结果与可证明内容 |
| --- | --- |
| `baseline-frontend.log` | 原 66 项通过。 |
| `red-backend.log` | 7 失败、2 通过：原 strict schema 拒绝合法 authStyle；原服务投影丢弃非法值后走到 worker 启动。失败点与缺陷一致。 |
| `red-frontend.log` | 首轮 5 失败、66 通过，原样保留。 |
| `red-frontend-final.log` | 补全思考流文案断言后的原代码红测 6 失败、65 通过。真实 loopback 收到的 Authorization 是 undefined；x-api-key 场景因旧成功文案失败，不伪称其原鉴权失效。 |
| `green-backend.log` | 2 文件 12 项通过，含新增 9 项及既有 request IO 3 项。 |
| `green-frontend.log` | 当前文件 71 项全部通过，包含新增 5 项真实 HTTP 集成和此前受管支付诊断。 |
| `typecheck.log`、`implementation-report.md` | 全 5 个 workspace 按 6144MiB、串行命令完成；实施方已确认进程 exit 0。未把单独的 route typegen 输出视为完整 typecheck 终态。 |
| `timeout-policy.log` | 完整 verify 已完成、exit 0；其中既有 localstorage 警告原样保留。 |
| `boundary.log` | exit 0，无新增违规；仍有 5 条既有基线，不表述为违规总数为零。 |
| `diff-check.log` | 实施方全树检查 exit 0、空输出；本评审另查五文件范围也 exit 0。 |

具体命令及退出状态见 `implementation-report.md` 和本次已读取的 `verification-results.json`；后者登记 typecheck session 54293、最终 chunk 78627b 的真实 exit 0，并包含各门实际工具收据标识。真实测试均显式 `--retry=0`。鉴权集成 fixture 临时打包原 `model-probe-worker-entry.ts`，使用真实 Pi 初始化插件、子进程 IPC 与 HTTP 服务器；只注入合成模型解析结果，没有 mock IPC/modelFor/Pi。三档成功直接断言 `/v1/messages`、model、128、stream、无 tools、单次请求与两种鉴权头互斥。401/500 场景同样检查一次请求、128 与 Bearer 头，并检查重建后的 Error、公开结果和 frontend 日志不含合成 token。原 402 通用拒绝/明确额度/私密正文/自配提示的真实 IPC 回归仍在。

每例 finally 停 IO 子进程并关闭 HTTP 连接，afterAll 删除临时 bundle。测试不读取用户配置、真实凭据或用户库。日志 spy 覆盖 frontend 日志；子进程 stdio 使用原 ignore，故这里不声称此次动态测试捕获了 worker 的每个日志 sink。生产脱敏路径和没有新增日志的结论另由实际源码核对支持。

**本轮产品 finding：0。** 没有把既有宽范围问题或未发生的安装测试虚构为本次代码 finding，也没有据本地合成响应把官方服务判为可用。

## T1427 源码 UI 证据的附加只读复核

适用依据仍为 T1407 导入实际 UI 行为、T1427 补真实旅程的合同，以及 `docs/research/2026-10-25-t1426-t1407-frontend-gate-applicability.md`。T1426 与 T1411 没有新增页面结构/交互旅程，不因此免除 T1407/T1427 的源码及安装态义务。

已读新环境 README、preparation/runtime/entities 回执、实际 `cua-exact-path.js`、各 JSON，并查看两份 exact 截图；另只读旧 `journey-actions-editor.mjs` 对照原动作和计时边界，未运行旧 Ego 驱动。准备回执绑定干净来源 `778ea4559850b0d8dfbf279c312dc4c21d72866e`、新私有数据和正常 Next dev；本轮没有桌面握手注入或用户凭据读取的证据。截图为源码开发态最终画面，不是安装 App。

| 记录 | 本次审查裁定 |
| --- | --- |
| 原 1440×900 10,262ms / `EDITOR_PATH_EXCEEDED_10S` | 保留旧 FAIL，不能扣掉调度或布局耗时后重写。 |
| 新交互分步 17,889ms | 保留 FAIL；模型/工具往返包含在该轮 wall clock，不作扣除。 |
| 初轮 1440×900 2,286ms | 保留该轮窄证据；最终以可追溯完整动作的 exact 记录核原路径。 |
| 1024×900 2,285ms | 仅补充证据，高度不符，不能替代规定的 1024×680。 |
| 第一轮 1024×680 2,556ms | 按钮容器内完整可见性 false，保持 FAIL。快于 10 秒不能抵销断言失败。 |
| exact 1440×900 2,527ms | 本次源码空工程路径的新成功记录，所有规定空态/禁用/可见性/未 dirty/尺寸断言成立。 |
| exact 1024×680 2,416ms | 同上，原生滚动后按钮完整位于实际容器内；不需要放宽高度、可见性或时间阈值。 |

对照实际函数，两个 exact 起点均在布局稳定检查后、打开“素材与转写”之前；终点为取消选择、回到“画面”、播放控制可见之后。素材/转写切换、文案与禁用检查、原生滚动、选择器检查、取消、回画面以及 CUA 调度开销都在同一 `Date.now()` 区间中，无扣时。滚动量由当前按钮与容器 rect 求得并除以真实 viewport height；1024 轮 `scrollTop` 从 38 到 123.5，按钮从 top 424.70/bottom 506.70 移至 top 339.20/bottom 421.20，位于容器 324.70–425.02 内；1440 轮同样保留几何读回。没有强制点击或合成业务事件。改正滚动单位的测量动作不能称为修复产品性能。

测量脚本复用提示（不阻断已发生的两份记录）：当前函数在 frames 达 240 时也 resolve，而旧驱动会 reject。两份 exact 实际都为 13 帧、stable=12，已达到旧稳定前提，本次结果不受影响；若以后复用，必须要求 stable>=12，不能接纳超帧但未稳定的起点。此提示已交 Root，不由本评审修改其证据脚本。

上述新成功记录只证明该来源、新空工程、两规定尺寸下的“原片→转写→选择器→回画面”源码 UI 路径；不能证明旧 FAIL 的产品根因已经查明，也不能覆盖素材预览连续导航、真实平台报表、自动许可恢复、全部标准旅程、安装态或官方 Pi。最终推送仍受 T1427 全部约定验收约束。

UI 原件均位于 `docs/verification/t1427/ui-source/runs/editor-778ea455-01/`，本次读取哈希如下；没有覆盖原件。

| 原件 | SHA-256 |
| --- | --- |
| `cua-exact-path.js` | `5d747396f3b7d666d6192854567f30b2fa8372996a1b1cadf845e1dbd836cf15` |
| `cua-editor-1440x900-exact.json` | `3b60c7ff536dd03ac1fd623561fdc14174e2b6f015801978383409e3ada8b724` |
| `cua-editor-1440x900-exact.png` | `cfbab2071594ea517f4d022e62bc8c2772ee0320da305963500996643108e58a` |
| `cua-editor-1024x680-exact.json` | `7a67c9e3bc1a7c5897ab49a68aa1bddb2026be9a43f0265632e5785f52a8890d` |
| `cua-editor-1024x680-exact.png` | `b133eab37d6d5e8ff27308a031f1330c21e7e00905357a36069ee676e5e0ffc6` |
| `cua-1440-instrumentation-attempts.json` | `a62bdcf68a8e5d2f26bc98cdda83dfb4d1da2f798d1e1cdcc7e5d114668ed0fa` |
| `cua-editor-1024x680.json` | `f8a624abf6dede941349b36d80ace6351548cced025a0f5570c0aef5d8056f3e` |
| `cua-editor-1024x900-supplement.json` | `fd6d223e737bfed2b3a19074532146e4e5ff865fdf384e972db53f156c1a87cd` |
