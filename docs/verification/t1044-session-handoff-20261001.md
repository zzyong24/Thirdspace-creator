# CreatorOS 工作台与本地 Codex：新会话交接

2026-10-01 用户明确要求：将当前工作委派给新会话，原会话上下文太长。本文只记录当前事实和接手位置；任务队列、范围、审核仍以 BACKLOG、SPEC 和审计事件为准。

## 工作目录与边界

**所有产品代码操作继续在现有隔离目录执行：**
`/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator`

分支 `codex/user-diagnostics`，HEAD `5d97b750`。主目录 `/Users/zyongzhu/Workbase/Thirdspace-creator` 只读。当前有 322 条 dirty/untracked（包括此前平台、文章、结果、上报和剪辑改动），不可 reset、覆盖、整批提交或从参考分支整文件覆盖混合文件。先审计实际差异，只提交已验收的闭包。没有推送/部署授权。

按 AGENTS 顺序读取 BACKLOG→任务 SPEC→PROJECT/PROJECT_CONTEXT→技能 `product-to-code-orchestrator`→architecture。技能 3.27.2 与本地版本相同；当前 4-build maintenance。需求已建任务，不需要重建计划或重复索要已确认范围。taskctl 是唯一状态入口；T1044 Research Gate 已通过真实差分实验恢复并重新 start，audit 当前无开放门。

## 用户已确认的产品要求

- 保留原完整工作台的素材、脚本、观点、版本、审核、发布、复盘与编导功能，不能用简化新页替掉原稿面。
- 原顶部导航增加“图文”和“公众号”，与“脚本 / 制作视频 / 复盘”共处一处。
- 创作入口统一仅“文章 / 图文 / 视频”，平台是可选设置，不增加重复入口。
- 真实模型整稿或部分内容互转；保留源作品，候选预览与采纳由 owner 落库。
- 编导输入框选择 CreatorOS 或本地 Codex，自动启动运行时，沿用本机模型和登录；保留旧引擎、取消、恢复、输入和多账号隔离。
- 多媒体基础设施、无限画布、平台工作台、可视视频剪辑和编导剪辑均需完整整合与验证，优先复用开源。用户已授权实施与集成测试，避免再停在方案上。

```mermaid
flowchart LR
 A[一个项目工作台] --> B[脚本／制作视频／图文／公众号／复盘]
 B --> C[原编导输入框选择引擎]
 C --> D[CreatorOS 或本地 Codex]
 D --> E[同一持久任务和受控工具]
 E --> F[真实结果卡和候选]
 F --> G[用户采纳后保存]
```

## 当前队列和审核

- T1043 🔨，SPEC `docs/features/t1043-unified-creation-content-conversion.md`，PASS e2e39b125920。
- T1044 🔨，SPEC `docs/features/t1044-local-codex-workbench-integration.md`，PASS 8aaf8465a7a4。
- T1036 ✅（开源选型）。T1037 🔨（已提交作品级制作服务，验收未完成）。T1038 🔨（可视视频工作台大量 WIP）。T1042 📋、PASS91743d51ee0e（画布/各工作台集成）。T1039/1040/1041 待审，不能凭旧聊天补拍前置 PASS。

## T1043 已实现与实际验证

主要文件：`frontend/src/features/projects/project-workspaces.ts`、`work-type-fields.tsx`、`new-project-form.tsx`、`quick-create-work.tsx`、`project-output-home.tsx`、`frontend/src/components/overlays/new-project-dialog.tsx`、shell-router/stepper、项目 root/image/article 页面、article-workbench。

- 五个工作面链接真实可达；项目 root 默认恢复完整 DraftWorkbenchPage，`?view=works` 为作品列表与同一创建表单。
- 唯一图文/文章导航到准确 output ID；多稿先选择，非法明确 ID 不落到第一稿；文章脏稿切换有保存/放弃/继续编辑。
- 同一表单三类、平台兼容、高级设置；创建后留当前项目选项有效；成功后保留类型/方向/平台，下一次提交不被隐藏必填项阻断。
- 公共 createOutput 幂等已补：project repository 事务保存 output/stages/activity/receipt；article 使用完整请求摘要；改标题复用 key 返回409。迁移 `0116_output_creation_requests.sql`。不要只抄迁移或绕公开 API 改真实数据库。

真实日志在 `docs/research/evidence/t1043/`：output-creation-green 4PASS、owners-creation-final 99PASS、led047-regression-corrected 157PASS、draft-choice-regression 16PASS、common-form-final 16PASS、frontend-types-canonical exit0。历史红测/失败均保留，没有全部客户端验收结论。

待完成：模态创建三类回归；偏好迟到用 key 重挂会清空已输入表单（先红测再修）；canonical 无/多/非法/跨账号页面路径回归；Quick 新视频仍到简化 scoped 视频页，完整项目root恢复不等于所有 scoped 页完整；文章/图文/scoped 视频还需同一编导 rail 和准确 output/version 冻结。**内容互转尚未实现**。

## T1044 已实现（最新代码均尚未提交）

参考分支 `codex/external-agent-bridge@7d2087a8`。只复用外部回合账本/工具服务；**不复制 ACP/MCP bridge、auth文件、不复制0101迁移/反向配对全套，不合并另一分支BACKLOG/events**。

- ai-worker 已锁定官方 `@openai/codex@0.159.3`（pnpm实际安装）。PATH旧0.144.5仅诊断，不能静默备用。
- `codex-app-server.ts` / `codex-app-server-protocol.ts`：shell-free stdio JSON-RPC、方法白名单、配置摘要仅内存、禁用hosted web/features/继承MCP、stdin/stderr不落敏感日志、进程树关闭、abort先interrupt。
- **启动 bug 已真实定位/修复**：override左侧 key不解析TOML引号，`mcp_servers."probe".enabled=false`产生错误新服务。改根值 `mcp_servers={"原名"={enabled=false}}`，普通/含点/含空格三类真实禁用。研究卡 `docs/research/t1044-native-startup-exit.md` 和 evidence/native-startup-*；同一假环境编码差分通过，无模型回合。
- `codex-native-turn.ts`：environments=[]、dynamicTools、真实thread/turn、回调先保存、工具核对真实ID、拒绝审批/伪造原生用户回复、取消interrupt、未知恢复只thread/read同一turn，不重放。
- `external-chat-worker-run.ts`：任务预留/线程预备/回合入场/真实ID保存/工具执行/结算；用现有 execution_calls JSON持久化protocolKind和providerTurnId，不需新SQL字段。
- `external-chat-turn.service.ts` / `external-task-tool.service.ts` 已择取参考实现，并补prepareThread、recordProviderTurn、native收据比较、未知子工具阻断结算。safeNames 中新增 script.patch / video.edit，仍需后续真实候选验收。
- contract/internal/execution-worker、chat-worker、model-worker-dispatcher、worker-runtime/worker-entry、chat-turn-submission、chat-production-runtime 已接native分支；提交冻结引擎，重复源消息不同引擎冲突，native主模型不用CreatorOS模型密钥。
- 状态诊断独立私有IO：`codex-status-entry.ts`、`local-codex-status.service.ts`、contract `local-codex-status.ts`、`/api/chat/engines`，实际调用官方binary/config/account，不是假installed:true。
- 原编导输入框已接 `AssistantEngineSelector`、安装级localStorage偏好、跨面板同步；状态实读、重检、输入保留；live-session按源消息记录引擎，恢复不随当前选择换引擎。当前native只接受纯文本，附件保留并提示改用CreatorOS，不冒称图片支持。
- ai-worker build增加codex-status-worker.cjs；桌面worker打包验证新增native package/platform package。但**尚未运行完整桌面制品验证、平台包实际复制/许可证闭包仍要核查**。

### 真实测试与首轮实连（不要夸大）

`docs/research/evidence/t1044/`：
- native-isolated-final：5PASS（官方0.159.3真实假home、三种MCP名，无模型turn）。
- native-turn-green：9PASS。
- native-worker-regression：42PASS（含原worker-runtime回归）。
- native-owners-final：9PASS（真实fixtureDB external owners）。
- worker-native-types-final2：exit0；frontend-native-types：exit0；native-worker-build：exit0，CJS import.meta fallback有两条warning，需处理/核实。
- backend-native-types：既有测试类型错误仍失败；未见native新文件错误。旧chat-turn-submission测试“提交时产品说明”仍失败，官方guide快照未注入，不能声称全绿。

**原工作台实际选择本地 Codex，状态显示“本地 Codex 可用 · 0.159.3”，提交一次只读项目名称和素材件数请求。公共 ai.tasks.list 证实 succeeded：**
AI task `ai-task-53479cc5-dbc3-40b5-a6d9-d80b989afb21`
Execution `execution-task-c3e2ae07-65db-46d6-8857-47e13b97870d`

但该轮当前UI只有用户消息，没有助手正文。已定位 external commit 只保存finish/工具events，漏text-start/delta/end；最后已加入真实最终正文事件。**尚未复测真界面，也没恢复旧任务正文流**。

最后一次 `native-message-events-green.log` 实际 **8PASS 1FAIL**，不是全绿：旧工具卡事件断言只期望tool输入/输出/finish，新增正文事件后多text-start/text-delta/text-end。新增“真实正文必须进入事件流”回归已通过；接手应核对新协议、更新该旧断言然后重测，保留原始失败日志。不要删正文事件来迎合旧断言。

### native 仍待修/验事项

1. 先完成上述正文事件回归和真实UI读取验收，刷新读回旧成功消息；保存当前回合metadata/tool账本的公开证据，确认是否真的调用了读取工具。
2. 新增native worker完整回合/unknown/rejected/取消/重复工具/旧租约/跨账号测试、source engine重复提交测试、selector与状态IO生命周期测试。
3. `runExternalChatInWorker` 的 createControlledSession 在try外；preflight失败时reserved未明确拒绝。reserved已有prepared thread当前返回waiting_user，需与已批准恢复表一致，不能重发已入场回合；完善pre-admission确定性拒绝与真实状态归属。
4. raw native thread/start 和 later response/notification races需更全面验证；onTurn已用同一ack Promise防双重持久。工具失败/unknown不能让拒绝回调被吞后继续模型最后称成功；对账只读取completed的原turn，子工具unknown禁止结算。
5. 补准确的output/type/savedVersion冻结和核验。现有chatHostContext selection已含outputId/versionId但嵌入rail/URL没有完整接上；禁止默选第一稿。
6. 至少一次真实本地Codex候选→原稿面用户采纳→刷新读回，目前script.patch/video.edit仅加入审核过的受控候选工具名单，没有真实本轮候选采纳证据。
7. 运行当前boundary/orphan/reconcile、更新交付证据；全局旧reconcile失败不得写全绿。完成后按taskctl/pmem/reconcile真实收尾，不提前complete。

## 本地验收环境

隔离 devserver `http://127.0.0.1:4187`，PGLITE `/tmp/creatoros-t1029-acceptance-db`。不要用真实生产DB/加密密钥库来造fixture；本机Codex认证只让官方runtime自己使用，不读auth.json。

账号 `acct-t1029-local`，项目 `project-0d04195a-122`（一人运营三个平台）。图文 `output-0d04195a-133`；文章120/199及新建 `output-bd31ba80-878`；视频151/189。根页面可看原完整功能。

旧会话自建CUA tab26在该项目root，选择Codex；tab25是图文canonical。**别控制用户正在使用的topics等标签**；新会话先恢复CUA文档、自己创建隐藏验收tab。主会话工具session ID27372是devserver，切会话后不假设exec session可复用；先只读核对服务。

通过公开HTTP读开发API时可用urllib ProxyHandler({})绕过用户环境代理对localhost造成的502；不修改全局代理，也不读取用户浏览器凭据。dispatch支持已知x-account-id，开发握手如现环境正常校验；若真授权失败不要伪造/绕过。

已存T1043截图：evidence/t1043/project-workspaces-1440.jpg、project-workspaces-900.jpg、graphic-workspace-canonical.jpg。最终用户交付需嵌入真实可核验图，不只工具输出。

## 后续已授权批次：别遗漏视频/画布

T1038 可视编辑WIP：@xzdarcy timeline-editor1.0.0 MIT、作品级plan/revision/history/render、同源预览/时钟协议已写；必须核查 preview debounce 在途串行、history/render轮询背压/epoch、未知写入requestRef不覆盖、迟到history、保存readback保留草稿、unmount guard、legacy render callback旧方案回写、素材链接、iframe函数bundlerhelpers实际浏览器。T1040还需本地GSAP/font/sound资源与最终渲染一致；没有本轮真MP4验收。

T1042画布分支尚未整合；T1043转换未做。请按各自SPEC与真实独立审查继续，不从此交接文档推导已通过未发生的Gate。用户音效zip之前缺失可先继续可做部分，不能假素材；字体OFL SourceHanSans已有参考。合成验收视频 `/tmp/creatoros-t1036-probe/public/test-master.mp4` 可经真实上传接口用于隔离验收，不原始SQL灌数据。

当前主会话停止继续代码修改；新会话是唯一后续写入者。用户希望直接推进到功能完整可用、真实集成验收，不需要重复询问是否继续。
