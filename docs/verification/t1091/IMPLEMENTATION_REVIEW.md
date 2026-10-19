# T1091 独立实施复核

## 结论

当前六个产品文件和三个新增测试与已通过的 T1091 SPEC 一致，未发现范围内 blocker、major 或 minor。静态结论为 `PASS_STATIC_CURRENT`：可继续等待原 Worker/任务回归、双端类型和其余既定 Gate 的真实终态；本报告不代签这些尚未完成的检查。

本次只读审查基线为 `fae2d1f595b70a45d3c8b40c424c035150f5a851` 上的未提交工作树。没有修改产品、测试、控制面或任务状态，没有运行测试、模型、业务、构建、应用或数据库命令。

## 当前字节绑定

| 路径 | SHA256 |
| --- | --- |
| `contract/src/resources/ai-public-message.ts` | `12ee680df05b4922a157b760832aeda3fb9cd503e332a49acc7479980f7972fd` |
| `contract/src/operations/ai.ts` | `f0774d320edac0afa7c26f15cc2c12a6e58158dca7b7534a278f7bbb775e1afb` |
| `contract/src/index.ts` | `c1fb9444e20382972f21676e9f56ba13a34104333377632abd6df366eff7ebaa` |
| `contract/src/resources/work-creation.ts` | `792f20c7e1d93a7272974054134629813a2b3f041f4aa8f6b02062467c49db9c` |
| `backend/src/modules/ai/ai.service.ts` | `a69ffb0b6de571dc46dda47ef8d82f312f72f1c6d5dbd635d7b2d175b23e6c22` |
| `frontend/src/server/persistence-client.ts` | `bf6773563b857dd2cf663057558f9a59819c5868f5dd9891a7102eb8a8c3a242` |
| `contract/tests/ai-public-message.test.ts` | `d68c6eda0c6eb1f66d9256cd9a3e2313cda5bde6d90b2852e0351726de79f474` |
| `backend/src/modules/ai/public-chat-options.service.test.ts` | `598de22a86ce11ac58363c06a3dac1b4328ba12093681ffb05011cfd6a83ad4a` |
| `frontend/src/server/public-chat-options.integration.test.ts` | `ddda8b6ff9e0c4996eb94bef6022e86e26aa31569faf82504dc4551389569eab` |

SPEC 正式初审标识为 `REV dcd0b932fca7`；SPEC SHA256 为 `f170559edf6d630ffd97d5d365e044bbbc575ef9eda7ce523bad8f2aa8a70cf7`。

## 代码复核

`aiPublicMessageBody` 是严格对象，只增加可选 `pi|codex` 与二选一的严格目标。公开 creation wire 由 `workCreationTarget.omit({scriptConfirmation:true})` 派生，客户端不能携带 `current-click`、`public-request` 或其它内部确认；editor wire 继续完整复用原 `WorkEditorTarget`。operation ID、method、path、返回 Message DTO、CLI effect/confirmation 和工作区 scope 没有改变。

AiService 在运行时再次用同一 schema 解析输入。默认引擎仍为 Pi；显式引擎被放入唯一 `options`，同一值传给事务外 `prepareChatReply` 和事务内 `chat-turn-submission.submit`。原 submission 继续把引擎写入严格 worker input，并以 `modelInputDigest`、`hostContextDigest`、历史消息 ID 和 `chatHistoryDigest` 绑定来源；显式重放引擎不一致仍拒绝。

作品目标要求实际 conversation 具有非空项目且 target.projectId 与之相同。原 `assertChatProject` 仍在准备前验证真实项目 owner；prepare 后仍在 membership 锁和 conversation parent update 锁内重读会话及历史，比较摘要后原子写用户消息和任务。纯组的 nullable account、同组不同真实账号的平台筛选以及原 workspace filter 没有被改写。

公开 creation 的内部确认只在项目绑定通过后生成。实现按独立来源复核意见增加 `ctx.source === "user"` 守卫；`ai`、`ingestion` 的直接 service 调用不能借公开 target 获得 `confirmedBy:user/source:public-request`。普通无目标消息和 editorTarget 不受该窄守卫影响。`WorkCreationTarget` 只把内部来源联合从 `current-click` 扩为 `current-click|public-request`，原 UI 构造仍固定 `current-click`，旧目标读取、proposal 和 adoption 端口未变。

frontend 组合根只透传引擎，并在存在公开目标时用实际 snapshot conversation 派生 `{surface:"project", projectId}`，随后调用原 `prepareChatReply`。目标仍由原 `readEditorTarget`/`readCreationTarget` 读取，hostContext 仍校验 user、group、nullable account、项目和目标归属；候选工具仍是 proposal effect，没有新增正式保存或采纳权限，也没有新增 Worker、模型端口或执行器。

## RED/GREEN 证据复核

外部证据位于 `/Users/zyongzhu/CreatorOS-local-acceptance/main-installed-20261008/t1091`。本报告读取既有结果，没有重跑：

- contract RED：`red-contract-final.json` exit 1，日志 SHA256 `03d98c0b508b8660d2a2b49dc6695691d9ff90e1cd4fa2dd5bc5f84e9c874af5`；GREEN `green-contract.json` exit 0，49 PASS，日志 SHA256 `be355daa1c887c7997ea4eb6a7154caa1af6da8cd81eb1310c84cff1f014b949`。
- service RED：`red-service-final-typed.json` exit 1，日志 SHA256 `ae35e9e8e4af489c677d6dd58674b53c3540e1556f62a5ba3b2cc69f7fc6904f`；GREEN `green-service.json` exit 0，31 PASS，日志 SHA256 `e509e76d5d6deead68e5ba02a4867313b3a10a88564b6dd37bebaf310360275a`。
- frontend RED：`red-frontend.json` exit 1，日志 SHA256 `ad79ba3c6053ac1116bf3c022f3993e50bf5bd38a845b547c7ec37b50e8fb442`；GREEN `green-frontend.json` exit 0，17 PASS，日志 SHA256 `c9b10033b5b948f8cd6eb0bdfdf10910347e319639e828eb8d3714f5a9145ab0`。

新增 contract 测试验证默认兼容、两引擎、三个 editor owner、creation wire 无 confirmation、双目标和额外权限字段拒绝。service 测试使用真实 PGlite owner/事务，覆盖 prepare/submit 同引擎、项目和会话绑定、纯组、同组双账号、历史漂移、prepare/task/submit 失败零孤儿，以及 `ai|ingestion` creation 来源拒绝。frontend 测试通过 composite transport 和真实目标 reader 覆盖 article、graphic、native、creation 各自 Pi/Codex 冻结，并核准备阶段不改业务表及四种 stale target 拒绝。durable start 和模型准备被有界替身隔离，因此这些结果不冒充真实模型或完整 Worker。

三个测试均为新增文件；本轮产品 diff 没有通过删改既有测试断言取得绿色。已报告 boundary、semantic、orphan 和 contract types exit 0 仅作为 ROOT 的当前证据边界，本报告没有自行重跑。

## 尚未签署的 Gate

原完整 Worker、消息/提交/完成/proposal/external 回归和双端 types 在本报告形成时仍由 ROOT 执行，必须以最终实际结果绑定。后续仍需实施最终源码 hash 复绑、独立 Gate 复核、main 提交、固定入口本地打包、包内字节与安装启动、动态 describe，以及公开 Pi/Codex 的真实任务和回执验证。

当前结果不证明真实 Codex、候选质量、浏览器来源、原生 UI、安装版或父 T1062/T1070/T1074 全功能通过。普通浏览器的 local application origin 403 必须保留，不能通过注入 cookie、连接文件或放宽来源守卫绕过。完整 reconcile 的 42 项既有错误也须按 SPEC 当场重跑和归因，不能写成全仓绿色。
