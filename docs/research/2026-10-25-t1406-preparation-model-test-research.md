# T-1406：模型连接测试与项目准备调查

2026-10-25。对应 I-03、I-04、I-05；实施与验收以 `docs/features/t1406-installed-eight-defects.md` 和 BACKLOG 的 T-1406 为准。本文记录只读调查、兼容决策和回归设计，不把源码分析写成已安装版通过。

## 证据和边界

- 安装版一次 `settings.models.test(default)` 返回空 provider/model 与配置解析兜底文案；相同配置下正式 Copilot、选题、审核和校准成功。具体底层异常未取得，不能写成已证实的网络错误或密钥拒绝。
- 自动准备的真实 `brief.fill` 回执曾为 `input={}`、`suggestion={}`，工具却标记 `ok/proposal`；父准备随后失败。有效真实候选与首次采纳 3/3 的正例也已保存。
- 准备提交创建 `scope='project'`，稿面历史读取 `project:<完整项目ID>`。旧原会话存在但列表入口不可达。
- 本次调查没有调用模型、操作安装库、切换 UI、读取密钥或操作 GitHub。codegraph 工具与命令不可用，按规则使用 rg。
- 任务包缺少既有 binding，由根代理记录实际失败；本次按 BACKLOG 与 SPEC 回退，不修控制门。

## I-03：连接测试沿正式模型来源

`settings-model-test-wrap.ts` 本身使用正式探针适配器，但组合根给它注入的是旧 `resolveLlmConfig`，其渠道优先级与 V2 用户选择不同。业务通过 `resolveRootExecutionRoute`／`prepareChatRouting`、`freezeSelectedModelRoutes` 和 `resolveFrozenExecutionSpec` 处理真实选择。修复应复用这些选择与严格身份解析，不复制配置优先级或改写用户配置。

| 测试入口 | 对齐的实际协议 |
|---|---|
| default 主文本 | `text:copilot.assist` |
| script.review | 写作 adapter 的实际 capability 为 default；对应 `structured:default`，catalog 没有 `structured:script.review` |
| chat.fallback | `text:chat.fallback`，保留只认专配、不回退主模型的规则 |
| asset.classify | `vision:asset.classify` |
| image.generate / video.generate / transcribe.audio | 对应既有 image / video / asr mode 与既有后端解析器 |
| web.search | 保留独立搜索配置路径 |
| knowledge.search.embed | 保留停用分支，零外呼 |

Codex 来源不能改测另一份 API 配置。保留现有引擎状态入口，API 探针返回准确的中性说明；没有真实回复时不称供应商连接成功。配置不可用、身份变化、鉴权拒绝、超时与未知故障使用稳定分类和安全人话，日志只留分类及 requestId，不输出原始错误、接口地址、渠道模型或密钥。未知本机异常仍保持未确定。

拟改：`frontend/src/server/settings-model-test-wrap.ts`、`persistence-client.ts` 的 settingsWithModelTest resolver 注入段；必要路由小叶子放 `settings-model-routing.ts`。避开其他代理的 reviewGate、seed、知识采纳装配和 bundle 返回段。

回归设计：隔离 public model-routing 保存后，正式业务冻结与连接测试捕获的 spec 必须来自同一选择；自配为主且存在坏渠道目录仍可测自配，官方未就绪不得落到自配，Codex 不调用 API 探针。覆盖 fallback 专配、兼容协议、真实错误分类、非空文本／思考流和脱敏。现有锚：`settings-model-test-wrap.test.ts`、`__module_integration__/model-routing.persistence-client.test.ts`、`script-review-worker-entry.integration.test.ts`。新增精确组合根回归，避免只测镜像 helper。

## I-04：结构为空时不伪造候选成功

`brief.fill` 只整理模型明确给出的六个可选文本字段；代码可以 trim、校验类型、判断是否至少有一个非空合法字段，不能判断观点好坏。当前清洗后空对象仍返回 proposal。宿主已有合法 `error/blocked`、`invalid_input/no_evidence` 和 `sideEffect=none`，可沿用，不新增假 success 协议。

准备读取必须区分：真实合法非空候选、合法但与现值相同（BRIEF_UNCHANGED）、资料不足的空回执、缺少／损坏／越权回执。仅资料不足进入明确等待补充状态；无合法来源或身份不符继续拒绝。任何分支都不自动重发模型、不写入占位资料、不把空候选算完成。

控制注意点：原 child 可能已 succeeded。只改父状态为 waiting_user 后直接继续，会反复读取同一空回执。显式补充后的下一步须保父 task、原 deadline、已完成步骤和旧 child 锚；复用既有 checkpoint `inputRevision`、`sourceRevisions`／`resumedChildren`，只在明确用户动作下准入一次新 child。没有用户动作不得热循环；相同动作幂等重放不得第二次提交。

拟改：`backend/src/modules/ai-runtime/chat-tools.ts` 的 brief 分支；`backend/src/application/projects/project-preparation-chat.ts`；`backend/src/modules/projects/project-preparation.service.ts` 及必要既有错误类型。保持普通候选人工采纳、事务基线和采纳后 3/3。

回归设计：`chat-tools.test.ts` 先重现 {}／全空白被标成功；`project-preparation.service.test.ts` 用既有 tool/external_tool 真实回执夹具测试等待补充、无自动重发、受控继续、原期限和步骤保持。有效候选、原样候选、损坏回执、错组／错 project／错父调用仍需分别覆盖。现有测试把空与非法结构一并期待 failed，实施时必须拆开，不能删除负例制造全绿。

## I-05：新 scope 对齐、旧会话只读兼容

新准备会话使用 `project:<project.id>`。旧 `scope='project'` 行、原消息、任务、调用和回执全部保留；不迁移、不复制、不自动重发。

`ai.repository.ts.listConversations` 对明确的 `project:<id>` 请求增加窄只读兼容：只返回同用户、同 workspace、精确 projectId 且父项目归属成立的旧 project scope 行。正常 scope 的过滤不放宽；total 与分页查询使用同一条件。现前端 WireConversation 只消费 id/title/createdAt，可直接载入原会话；原有 history owner／epoch／切组保护保持。

拟改：准备 chat 的创建 scope、AI repository 的列表条件；现有 `ai.repository.integration.test.ts`／`ai.scope-migration.integration.test.ts`、准备提交服务测试。红测须证明旧会话在当前项目历史原 ID 可达、其他项目／组／用户不可见，以及查询没有新增会话、消息、任务或模型请求。

## 执行环境与记录

使用缓存 Node 25：`C:/Users/Administrator/Documents/Codex/2026-10-19/xian/work/runtime-v25/node-v25.9.0-win-x64/node.exe`；pnpm 入口为同 workspace 的 `work/corepack-cache/v1/pnpm/10.32.1/dist/pnpm.cjs`。不调用全局 pnpm、不联网安装替代版本。

SPEC 独立评审通过后先写可复现红测并保存实际日志，再修复并跑限定公共路径绿测。证据写 `work/creatoros-eight-defects-fix-20261025/c-*`，保留其他代理修改。源码绿测、隔离供应商协议测试、构建、Windows 安装 UI 与真实供应商复验分别记账；没有发生的步骤不标通过。


## 实施与受控回归结果（2026-10-25）

I-03 已改为从真实所选业务路由冻结、解析凭据；default 复用 `prepareChatRouting` 的 `text:copilot.assist`，script.review 对齐真实 adapter 的 `structured:default`，其它已登记探针消费对应 frozen route。自选 self 不再解析未选坏渠道；选 official 不可用时不借用已存 self。Codex/API 不适用返回 `ok=false,status=warn`，UI 保持中性“未验证”。未知解析异常只显示“配置解析未完成、尚未发起服务连接”，日志仅稳定类别及 requestId；已知超时与鉴权拒绝分别报告。没有更改调用预算或发真实供应商请求，原安装版当时底层解析异常仍未确定。

I-04 使用真实工具结构判空，经已有 invalid_input/none 合同报告，不产生候选或写资料。父等待补充保同父 ID/原期限/预算/已完成步骤；明确补资料并发起新控制才增加 inputRevision、登记旧子来源并只准入一次新 child。只改 updatedAt 不算补充：独立 inputDigest 排除时间戳，既有 CAS digest 保持原字段。旧 checkpoint 缺 inputDigest 时在首次可信等待补只读锚，原 CAS 摘要不变。

独立评审发现最初 succeeded 回执夹具没有覆盖新工具错误的真实完成状态：正式 ChatTurnCompletion 会把末尾空资料错误保存为 child/business partial。已新增跨模块完整链测试，实际走 chat.submit、真实 host 执行与账本、checkpoint、completion.commitResult，再由父处理；不手改 child 成功。只有已核实 brief.fill invalid_input/none、无其它失败/交付/未知的 partial 可转父等待；该任务冻结且成功的无副作用读取允许保留。普通 partial、读取失败、夹杂其它错误维持 CHILD_PARTIAL 原阻断。该完整链在 `backend/src/integration/project-preparation-brief-terminal.integration.test.ts`，项目 module 不直接跨入 AI repository。

I-05 新会话保存精确 project:<id>；明确项目列表只读兼容旧 scope=project 的同用户/同 workspace/精确父项目行，仍核父项目当前归属，不迁移或复制原会话。新准备会话在真实完整链中校验原 ID 可从项目范围读取；另覆盖分页、不同用户/账号/真实账号组以及项目移出后的不可见。

实际日志位于 `work/creatoros-eight-defects-fix-20261025/`：

- 初始行为红：`c-red-backend.log`、`c-red-scope-preparation.log`、`c-red-model-routing-behavior.log`。
- 真实完成与时间戳行为红：`c-red-actual-completion-behavior.log`（2 失败/47 通过）；成功只读 context 的追加行为红：`c-red-context-read-recovery.log`（1 失败/51 通过）。
- 扩大后端回归：`c-green-backend-complete.log`，8 文件 367/367；随后补旧 checkpoint、移动集成与成功只读兼容后的受影响回归：`c-green-affected-final.log`，3 文件 74/74。
- 公共组合路由、错误分类、neutral UI 与准备面板：`c-green-frontend-final.log`，4 文件 77/77。
- C 的 backend/frontend tsc 实际工具回执均 exit 0，但 stdout 为空，PowerShell Tee 未生成日志文件；此前摘要的两个日志名不存在，已撤销引用，未补造历史日志。frontend 已核读根代理保存的 `frontend-typecheck-20261025T141206Z.json`（63.381 秒、exit 0，实际存在 0 字节 log）；backend 目前如实记为 C 的工具回执，最终归档由根代理另行执行。
- 边界：`c-boundary-after-move.log`，无新增，剩余 5=基线 5；未改守卫或基线。

保留中间失败记录：最初 I-03/I-05 运行被共享迁移半态挡住，不算行为红；部分新夹具曾误用 public status/deadline 和缺真实完成校验端口，修正后才记录实际行为红。第一次扩大 302 项中缺 T1248 原 Git fixture 的一次失败保留，根代理恢复原对象后 367 项实际通过，未新造 golden 或修改旧守卫。所有这些都是源码与隔离协议/完成链证据，未重验或更新已安装 Windows 程序、未调用真实模型，不替代新版安装 UI 或真实服务验收。
