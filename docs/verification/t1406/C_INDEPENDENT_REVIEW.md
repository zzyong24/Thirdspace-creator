# T-1406：C 子任务独立代码审查

评审者：`/root/v120_local_validation`（A）；被审改动：C 的 I-03/I-04/I-05。日期：2026-10-25。

本工件为实际源码阅读与调用链核对记录，不是 `reviewctl` 回执。评审只读实现与测试，没有修改 C 源码、访问原安装数据库、调用真实模型或操作原生 UI。被审代码仍在收尾，不能把中间 301 条通过或缺 golden 文件的运行当作最终全绿。

## 最终限定结论

**PASS（源码与受控公共链独评，C-R01/C-R02 已修复并有实际红绿证据）。** 最初确为 FAIL；以下保留初审发现与修复复查过程，不抹除真正失败。根代理统一类型、构建、完整 Gate 及 Windows 安装版复验仍各自记录，本结论不替代它们。

最终复读了 reader、父 partial 前置分支、独立 inputDigest 与旧 checkpoint 补锚，以及移动到 integration 后的真实完成链测试。`c-green-backend-complete.log` 实际 8 文件 367/367；后续补充只读 context、旧 checkpoint 与边界整理后，`c-green-affected-final.log` 实际 3 文件 74/74（与前述用例重叠，不相加计数）。`c-green-model-routing-second.log` 实际 38/38。`c-boundary-after-move.log` 无新增违规，剩余 5 条与原基线一致。

C 冻结后的最终汇总及实际日志再核：`c-green-frontend-final.log` 四文件 77/77（覆盖此前路由探针/neutral UI 的重叠用例，不能与 38/38 相加）。C 报告其最终 backend/frontend 类型检查 exit 0，但 `c-results.json` 最初引用的 `c-typecheck-backend-after-move.log` 与 `c-typecheck-frontend-final.log` 当时并不存在；评审者已要求更正为实际工具回执或真实文件，未将这两份不存在的日志当作独立核读证据。更大的类型、构建/全仓控制门由根代理依据自己的真实运行记录统一确认。

## C-R01：真实空输入 host 回执完成为 partial，父准备提前阻断，无法进入待补充恢复

- 严重程度：major；状态：resolved，具体修复见下方复查。
- 实际来源：`chat-tools.ts` 的空 `brief.fill` 抛出 `ChatToolUserError`，`chat-host-tool-adapter.ts` 在冻结版本 1 下返回带真实 `brief.fill` data envelope 的 `invalid_input` / `sideEffect:none`，这部分能被新 reader 识别。
- 关键后续：`chat-receipt-projection.ts` 的 `tailFailed` 将无交付、末次工具 error/none 的正常 stop 投影为 `outcome:'partial'`；`chat-turn-completion.service.ts` 把业务和执行 child 的真实状态均保存为 `partial`。
- 初审时父链缺口：`project-preparation.service.ts` 在 `collect` 前先以 `child.runtimeStatus==='partial'` 分支设置 `CHILD_PARTIAL`、`availableActions:[]`；`project-preparation-chat.ts` 的 `read` 也只接受 `task.status==='succeeded'`。因此实际新 host 空输入链到不了 `ProjectPreparationInputRequired` → 父 `waiting_user` → 补充后显式新尝试。
- 原测试盲点：`briefReceiptFixture` 先直接把 child 写成 `succeeded`；后来“真实 host 空输入回执”测试仅替换工具 outcome，没有经真实聊天完成状态，所以不能覆盖上述状态边界。
- 必须修复并验证：保留真实 partial，不将任意 partial 冒成成功或放开普通候选采纳。仅在原项目/组/child/账本已核验、具体 `brief.fill` 为空结构 `invalid_input` / `none`、无其它未知或已交付候选的条件下，允许父任务诚实进入待补充。需要实际完成投影/完成 service → 父准备的公共链红绿；同时保留普通 partial、mixed 结果、取消、unknown、权限错误不可旁路的负例。

最终复查：child/business 真实 partial 保留。reader 对 partial 要求可解析的冻结工具定义、全部调用已结算；仅可信 `brief.fill` proposal 工具的 `invalid_input`、不可重试、`sideEffect:none` 识别为待补资料。冻结为 `effect:none` 的成功只读 `ok/none` context 允许保留，不误判为其它交付；其它错误、未知、交付或无冻结定义均阻断。父 partial 分支只捕获该类型化输入要求，其余仍走原 `CHILD_PARTIAL`，没有把 partial 改成 succeeded。

`backend/src/integration/project-preparation-brief-terminal.integration.test.ts` 的四条真实完成链分别覆盖 empty→partial→父等待并补充后一次新 child、普通读取失败仍阻断、empty 混合其它失败仍阻断、冻结成功只读 context 后 empty 仍可进入等待；已在最终 74/74 中通过。实际父 ID、deadline/预算、原 child partial 与原调用字节都被断言保留。

## C-R02：仅时间戳变化误当补充输入

- 严重程度：minor；状态：resolved。
- 新恢复分支用 `readBaseline.digest` 判断输入变化；该 digest 还包含 `project.updatedAt`。初审建议的“仅时间戳变化，brief/briefDetail/confirmed script 相同”用例现已实际加入并运行：`c-red-actual-completion-behavior.log` 中 `submitBrief` 实际由 1 次变为 2 次，而预期仍为 1。
- 需把恢复所用输入身份与现有 CAS 基线区别处理，不能削弱用于正式采纳的版本保护。仍需保留一次明确操作最多一次、父 deadline/预算不续期及旧 child 来源锚。

最终复查：新增独立可选 `inputDigest` 只绑定项目输入和确认稿，排除 `updatedAt`；原用于采纳并发检查的 `digest` 仍包含 `updatedAt`，未削弱 CAS。纯时间戳变化不新建 child 的行为回归已绿。旧 checkpoint 缺新字段时，在首次可信待补回执阶段补输入锚且保留旧 CAS 字段，之后补资料与明确操作可继续；新增旧 checkpoint 用例在最终 74/74 中通过。

兼容复读更正：评审者曾只读恢复分支，临时怀疑缺 `inputDigest` 会永久等待；重新读取 typed catch 后确认已有补锚路径，已向根代理和 C 更正，未将该不完整判断列为确定缺陷。随后新增兼容测试验证了该路径。

### 已核对的新增红测证据

初始位于 projects 模块、后按边界移到 `backend/src/integration/project-preparation-brief-terminal.integration.test.ts` 的测试，实际执行准备 `chat.submit`、宿主工具适配器、真实 ledger/checkpoint、`ChatTurnCompletion.commitResult()`，后者真正把执行与业务 child 保存为 `partial`，没有 SQL 冒改成功状态。然后才调用父 `tick` 并断言待补充；同时有真实读取失败 partial 仍保持普通 `CHILD_PARTIAL` 的负例。

`c-red-actual-completion-behavior.log` 的 2 失败、47 通过分别重现 C-R01 与 C-R02，已核对为行为失败，不是缺 golden 或建库失败。该日志仍不表示修复后已绿。

## 已核对、暂未发现确定漏洞的部分

### I-03 连接探针

`settings-model-routing.ts` 固定 capability/mode 映射；`persistence-client.ts` 测试包装通过 `prepareChatRouting` 或正式 `resolveRootExecutionRoute` 冻结所选路由，再由 `readFrozenModelRoute` 与正式 spec resolver 解析。没有在探针中额外拼接文本模型 URL 或偷用未选 self 配置。Codex 采用不适用的中性 warn；`model-connection-test.tsx` 的 `data-ok` 只在 `status==='ok'` 时为 true，不把 warn 标为 API 连通。

已阅读公共 persistence 测试对 self 与坏的未选渠道、正式主对话 freeze 身份、script.review、未配置 fallback、official 不可用不偷换 self 的断言；它们使用隔离数据库和受控 probe，不能算真实供应商稳定性测试。已知超时识别只按固定协议/错误类别，不把普通取消或未知网络错误猜成超时，没有改变调用预算。

### I-04 恢复保存与控制

新分支在真实父任务行锁中核验 running、attempt、fence、lease owner 和有效期；旧 child 保存在 `sourceRevisions`，其他已完成步骤沿 revision 合并，未续父 deadline/预算；相同控制 ID 记录进 `resumedChildren`。在已读代码中尚未确立第二个并发覆盖 bug。现有“无新输入不新建、补充后一次、相同请求重放不二次”的测试仍需结合 C-R01 的真实 partial 链复核，不能由强制 succeeded 夹具替代。

### I-05 legacy 项目 scope

新准备会话写 `project:<完整项目ID>`。精确项目列表只兼容同一真实 `projectId` 的旧 `scope:'project'` 行，仍叠加原会话 user/workspace 过滤，并通过父项目的 user/workspace EXISTS 验证现归属；没有用 scope 前缀宽搜取代权限门，也没有迁移或新造旧会话。已阅读同账号另一项目、另一账号/用户、父项目移走以及 group 无平台账号的测试。公开查询的 rows 与 total 共享同一过滤条件，分页不会泄露其它范围计数。

## 剩余证据边界

1. 本评审实际阅读了 C 的执行日志与完整实现/测试路径；没有由评审者重复运行同一套大测试，也没有冒称独立真实供应商测试。
2. 最初缺 T1248 golden 为独立前置问题；根代理用既有 Git 原对象核对恢复后，后续 367/367 才包含该旧回归，不将原缺件失败涂改成通过。
3. 根代理统一类型/构建/Gate 与后续 Windows 安装版验收仍待各自真实结果；本独评不把源码回归冒充运行 EXE 已更新。
