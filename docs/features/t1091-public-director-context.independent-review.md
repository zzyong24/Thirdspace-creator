# T1091 公开编导消息的引擎和真实稿面目标：独立 SPEC 初审

- 评审类型：`initial`
- 评审结论：未发现可确证的 blocker、major 或 minor；建议由 `reviewctl` 依据本轮 `findings=[]` 计算正式结论后进入当场 RED。
- UI 验收分类：`—`。本任务没有新增页面、视觉或交互控件，frontend 仅承担既有服务组合根接线。
- SPEC：`docs/features/t1091-public-director-context.md`
- SPEC SHA256：`f170559edf6d630ffd97d5d365e044bbbc575ef9eda7ce523bad8f2aa8a70cf7`
- 宪法：`docs/产品定位.md`
- 宪法 SHA256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`
- 基线 HEAD：`fae2d1f595b70a45d3c8b40c424c035150f5a851`
- 上下文：`/Users/zyongzhu/CreatorOS-local-acceptance/main-installed-20261008/t1091/context-current.md`，记录当前 context compile exit 0。

## 独立结论

当前 SPEC 可以在既有产品边界内实施。公开 `ai.conversations.messages.create` 仅增加可选 `executionEngine` 和严格 `chatContext`；缺省仍为 Pi，原 operation ID、effect、确认策略、gateway 幂等和 Message DTO 不变。显式 Codex 不允许回落 Pi，且同一解析结果必须同时传给事务外 prepare 与事务内 submit，这与当前 `ai.service.ts` 两处固定 `pi` 的真实缺口精确对应。

目标合同没有扩大保存权限。`editorTarget` 原样复用三个 owner 的 `WorkEditorTarget`，包括真实 saved base、文档摘要、选区和原生 120000 tick 时钟。公开 `creationTarget` 复用现有联合创作目标，但 wire 层不接受 `scriptConfirmation`；后端在会话、工作区和项目归属通过后才补 `{confirmedBy:"user", source:"public-request"}`。这只冻结本次公开请求选择的真实版本，不伪装页面 `current-click`，也不改变候选采用端口。旧 `current-click`、旧冻结任务和历史摘要字节均被 SPEC 明确保留。

会话与目标绑定充分：新增目标要求实际 conversation 具有非空 `projectId`，目标 `projectId` 必须与之相同；原 `readEditorTarget`、`readCreationTarget` 和 `validateChatHostContext` 继续核真实版本、摘要、composition/script、父根、组和可空账号。准备仍在事务外完成，提交事务内继续重读会话历史并比较 `chatHistoryDigest`，随后在原 membership/parent 锁中原子写消息和任务。显式引擎和 host context 进入原 task/modelInput 冻结、lease/fence、回执及未知不重发链，客户端不能传 functionKey、任意 surface/projectId、工具目录、owner proof、摘要替换或期限。

六个产品路径形成最小闭包：新 public wire schema；operation 和根导出；`WorkCreationTarget` 增加内部 `public-request` 来源；AiService 解析、归属校验、prepare/submit 同选项；frontend 组合根从真实 conversation 派生 surface/projectId 并调用既有 `prepareChatReply`。不需要新增 Worker、SDK、执行器、数据库表、采纳 API 或 frontend 业务 owner。

三个新增测试足以承担本次新增行为的专门证据：contract 测严格字段和兼容默认；backend 真实 PGlite service 测 Pi/Codex、项目和工作区越权、准备/历史/提交失败零孤儿；frontend composite transport 测 article、graphic、native、creation 四族通过原 reader 进入原 task freeze。SPEC 同时要求重跑原 Worker、消息/提交/完成/proposal/external、相关 contract、双端类型、boundary、semantic、orphan 和 reconcile，因此没有用三份新测试代替既有回归。

## 实际证据边界

安装证据 `describe-ai.conversations.messages.create.json`（SHA256 `a95f1b1cbc8781cd2d5cfbaacc4630ef411c5771b42d411b10450abbb09bb784`）显示当前 body 只有 `content` 和 `attachments`；`cli-operations.json`（SHA256 `e1c81d2f7ff87ac40645ced3c0feb3f815e5ce8f0aaa7fd79d612ad57582e814`）记录 420 项动态 operation。普通浏览器快照（SHA256 `e285fa5b0f95962ae31c85591e8ed3fa33d24dfbfd39cee9b68d94fe8cdc003a`）被 local application origin 守卫拒绝；该事实既不是 UI 失败，也不是成功证据。

本次只做源码、合同、SPEC 与既有安装证据的只读审查；没有运行模型、数据库、浏览器、构建、测试或安装流程。报告不证明实现完成、真实 Codex 成功、候选内容质量、原生点击、用户签收或父 T1062/T1070/T1074 全功能矩阵通过。真实用户稿件、图 401、平台扫码/采集/发布、凭据与新候选采用仍不在本任务授权写入范围。

## reviewctl 记录形式

ROOT 可在确认实际 reviewer metadata 后运行：

```bash
node orchestrator/process/reviewctl.mjs record T-1091 \
  --spec docs/features/t1091-public-director-context.md \
  --constitution docs/产品定位.md \
  --input docs/features/t1091-public-director-context.review-input.json \
  --review docs/features/t1091-public-director-context.review.md \
  --backlog BACKLOG.md \
  --review-mode <实际-review-mode> \
  --model <实际可见-model-id>
```

本子会话无法读取精确模型 ID，因此不虚构型号或跨模型关系；ROOT 应使用控制面掌握的真实值。本报告没有运行 `reviewctl`，也没有改任务状态、BACKLOG、SPEC、产品或测试。
