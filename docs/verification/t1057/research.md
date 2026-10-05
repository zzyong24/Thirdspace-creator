# T-1057 本地 Codex 全链路核对

2026-10-04。只读代码和公开源码核对；两次隔离 command/exec 协议实验。未读取真实 Codex 登录、发送模型请求、使用浏览器自动化或修改生产运行代码。

## 两个额外模型

推论为图片 `image.generate` 和视频 `video.generate` 两类；前提是全部文本与视觉入口迁到本地 Codex。Codex 使用自身登录和模型，不再要求 CreatorOS 文本 key。现状仍不满足此条件。

`frontend/src/features/settings/settings-model-region.tsx` 目前默认文本与 ASR 是主配置卡，图片/视频为按需媒体卡。ASR 在 `backend/src/modules/ai-runtime/multimodal/resolve.ts` 解析失败时采用真实本地 Whisper；`ai-worker/src/runtime/multimodal-whisper-local.ts` 实际加载权重与解码。Embedding 在组合根的 knowledge.search.embed 仅取专配，缺配置沿关键词检索。未找到验收完成的生产 TTS 音频合成适配器。

## 当前入口矩阵

| 入口 | 实际装配/执行 | 必须迁移的依赖 |
| --- | --- | --- |
| 引擎设置 | copilot/assistant-engine.ts → localStorage | 后台不能读；需后端用户偏好及创建时冻结 |
| 编导聊天 | chat-turn-submission.service.ts、worker-runtime.ts | 仅 chat.run executionEngine=codex；省略值默认为 pi |
| 脚本/规划/审核/复盘/平台改写 | application/generation/writing.ts、structured-business-execution.service.ts | API 文本凭据、Skill/schema 与调用身份 |
| 文章/图文/润色/发布文案 | application/generation/creative-post.ts | copy.generate 及提交 preflight |
| 选题/定位/诊断/研究 | application/generation/discovery.ts | capability 文本凭据 |
| 封面/图卡/文章配图 | cover-worker-run.ts、execution-cover.service.ts | 文案/构图 LLM 与真实图片模型分别冻结 |
| 视频编导/素材匹配/粗剪 | generation/media.ts、video-decisions-business-adapter.ts、production-rough-cut-adapter.ts | 逐 Skill API 模型 identity 及 resolveVideoModel |
| 每日选题 | daily-topic-business-adapter.ts | preparation 的 hasConfiguredModel 会提前冻结 model_unconfigured |
| 雷达候选 | intelligence-generation-bridge.ts | 独立 claimed Worker、模型 identity/lease |
| 飞轮对标/归因/知识蒸馏 | execution-flywheel-generation.service.ts | 逐阶段冻结 API identity |
| chat 生成子工具 | execution-chat-generation.service.ts、execution-chat-script-draft.service.ts、execution-chat-hooks.service.ts、各 task-host | Codex 父回合的工具仍独立申请 API 凭据；需继承父路由 |
| agentic 研究/采集/素材 | ai-worker/src/execution/agentic-worker-run.ts | 直接 createPiAgenticEngine/wrapDurablePiStream，不经过 modelFor；actualEngine=pi |
| 知识库同步接口 | app/api/knowledge/{distill,classify,relate,comment-sift}/route.ts | runner 宿主直接 modelFor/runStructuredNode；须经受控 Worker |
| 视觉归类/成片审核 | asset-processing-business-adapter.ts、persistence-client.ts 的 describeImageOpenAICompatible | 独立视觉 provider；Codex 当前 prompt 明确拒绝非文本附件 |
| 原生命令 | codex-app-server.ts、codex-app-server-protocol.ts | shell_tool/unified_exec/code-mode/view_image=false；read-only、environments=[]；RPC whitelist 不含 command/exec |

集中 resolver 在 `backend/src/modules/ai-runtime/llm/resolve.ts`。但只修改 resolver/modelFor 会漏 agentic、宿主同步旁路、视觉输入及原生工具，并破坏原身份合同。事务任务冻结入口另有 `application/generation/transactional-task-runtime.ts`，不能只改普通 createTask。

## 开源源码参考（固定 commit）

1. [T3 Code CodexDriver](https://github.com/pingdotgg/t3code/blob/ee7b49d638e412590b09b415cc48399d51644b60/apps/server/src/provider/Drivers/CodexDriver.ts)：服务端 provider 实例同时装配 Codex 会话/turn/approval runtime 与非聊天 `codex exec` 文本生成，按实例管理进程及 CODEX_HOME 生命周期。可参考统一 provider、native execution/event 与实例隔离；其 shadow auth/密钥读取策略不直接照搬。
2. [T3 Code 启动参数](https://github.com/pingdotgg/t3code/blob/ee7b49d638e412590b09b415cc48399d51644b60/apps/server/src/provider/Layers/codexLaunchArgs.ts)：app-server 与 exec 参数分开投影，可参考明确执行通道，不能把不受限制的用户 launchArgs 引入当前产品。
3. [Zed codex-acp thread](https://github.com/zed-industries/codex-acp/blob/296069e841634cd4bb9bc4515602d836e49231ec/src/thread.rs)：原生线程 Op::UserInput、事件/工具调用与 permission preset 映射；可参考会话、权限和取消的真实回执，不应通过 iframe 或网页超链接做集成。
4. [官方锁版 command/exec 源码](https://github.com/openai/codex/blob/01fc69f4026735edfdf6789820549727a4867b11/codex-rs/app-server-protocol/src/protocol/v2/command_exec.rs)：argv、cwd、sandboxPolicy/permissionProfile、退出码/stdout/stderr、连接级 processId、stdin/terminate；独立命令不创建 thread/turn。
5. [官方锁版 thread](https://github.com/openai/codex/blob/01fc69f4026735edfdf6789820549727a4867b11/codex-rs/app-server-protocol/src/protocol/v2/thread.rs) 与 [turn](https://github.com/openai/codex/blob/01fc69f4026735edfdf6789820549727a4867b11/codex-rs/app-server-protocol/src/protocol/v2/turn.rs)：environments 空数组禁用环境；turn 的 outputSchema 可约束最终结构结果。

源码目录清单下载到 `/tmp/t1057-open-source`，仅保存公开文件和固定 commit。网页官方 [App Server 文档](https://learn.chatgpt.com/docs/app-server) 展示 readOnlyAccess 示例，但本机锁版 RPC 已拒绝；实际运行事实优先，不能按网页示例声称隔离生效。

## 两次有界实验

脚本：`node docs/verification/t1057/command-probe.mjs`。使用随包 0.159.3 macOS arm64、独立 fake HOME/CODEX_HOME、私有临时目录、无真实认证、无模型 turn。目标是在允许目录执行一个只写测试标记的脚本，并拒绝读取目录外的非敏感 sentinel。

| 次数 | 结果 | 证据 |
| --- | --- | --- |
| 1 | RPC timeout；初始化目录未预建、未捕获进程退出，不能确定机制 | command-probe-first-result.json |
| 2 | 预建隔离 Codex home 并捕获退出后，握手完成；command/exec 拒绝权限参数 `workspaceWrite.readOnlyAccess is no longer supported; use permissionProfile for restricted reads` | command-probe-result.json |

第二次没有执行测试脚本；没有允许目录成功、越界拒绝或命令退出码验收。第一失败未改写成成功；按最多两次实验的研究门要求停止追加探针，继续只读核对锁版 permissionProfile 源码。实际业务 Codex 模型/工具/命令路径均待验证。

## 下一步合同候选

[SPEC](../../features/t1057-codex-execution-routing.md) 的 FR-1057-1 至 7 明确后端设置、不可变路由、全部入口、原生命令、安全目录、真实回执/unknown 和公共调用链验收。用户要求统一本地 Codex 的方向已记录；底层 ffmpeg/Whisper/下载也迁入的具体范围仍在澄清，权限机制尚未验证。此次不能据此宣称“只配两类模型已可用”或“所有命令已统一”。


## 实际任务命令入口（只读核对）

排除应用启动、版本探测、安装/系统界面、构建测试及进程清理，确认外部业务命令在八个文件：

| 文件 | 真实命令 | 当前位置 |
| --- | --- | --- |
| backend/src/modules/assets/localfs-object-storage.ts | ffprobe 元信息 | 存储 owner |
| backend/src/modules/production/production-asset-asr-media.ts | ffprobe/ffmpeg 抽音与音帧 | backend ASR owner |
| backend/src/modules/production/production-asr-pcm.ts | ffprobe/ffmpeg PCM 映射 | backend ASR owner |
| backend/src/modules/execution/media-probe.ts | ffprobe 媒体探针 | deterministic executor |
| backend/src/modules/execution/video-render/executor.ts | ffprobe/ffmpeg/HyperFrames render | deterministic executor |
| backend/src/lib/copy-file-copy-on-write.ts | macOS /bin/cp -c | 存储及渲染副本 |
| ai-worker/src/runtime/transcribe-audio-extract.ts | ffmpeg URL 流式抽音 | Worker，部分旧 host 调用 |
| ai-worker/src/runtime/multimodal-whisper-local.ts | ffmpeg PCM 解码 | ASR Worker |

下载/搜索还有 Node HTTP 与随包 Chromium，没有独立模型密钥，但仍有权限、网络和进程生命周期。HyperFrames 本身会启动 Chromium/ffmpeg，必须考虑整棵子进程。普通上传元信息/存储复制属于既有合法保存任务，不能因为 Codex 迁移被强制转为 AI 会话、模型额度或新权限 Gate 阻断。底层范围澄清与原成功公共链验证是实施前提；本轮不能把所有八个文件已搬入 Worker 或 Codex作为事实。


## 独立审查初步结论

独立 reviewer `/root/review_t1054_entry` 只读核对后明确不能进入生产实现，以下四点保持未闭合；完整审查已附 [报告](independent-review.md) 和 [JSON](spec-review-round-1.json)，不能用文字增补代替实际证据：

1. 底层命令范围及入口/owner/同步返回语义。localfs 上传 put/headObject 的 ffprobe 原失败返回 null，迁移不能把 Codex 登录/profile 失败升级为上传、手工保存失败。
2. permissionProfile 的创建/注入及 active 配置未验证，command env 在服务端是 merge 而非替换；原 app-server 环境含 OPENAI_API_KEY/CODEX_HOME，不能假定启动环境裁剪就等于子命令隔离。
3. 请求模型配置与 thread/start 返回实际 model/modelProvider 必须分别冻结；服务器授权/capability、漂移拒绝与历史恢复身份尚未落实。
4. 非聊天模型/独立 command 的原 call 状态机，发送丢 ack、租约失效、子工具 unknown、连接级 processId 失联的后置条件未闭合。thread completed 或命令退出 0 不能直接视为业务可结算。

研究门已正式暂停 T1057：`node orchestrator/process/research-gate.mjs audit` 返回有效暂停 T1044、T1057。`git diff --check` 无错误；这只验证文档/差分格式，不是运行全链验收。本轮未完成 T1057，未做完成提交，也未影响现有预览服务。


## 官方锁版权限与工具机制追加事实（仅源码核对）

锁版 commit `01fc69f4026735edfdf6789820549727a4867b11`：

- command/exec 字段为 `permissionProfile`，thread/start 与 turn/start 为 `permissions`；均是已配置 profile ID 的字符串且为 experimental，与原 sandbox/sandboxPolicy 互斥。
- `[permissions.<id>]` 支持 filesystem read/write/deny、workspace_roots 和 network。workspace_roots 本身不授权；新 profile 默认无文件系统授权并限制网络。不得继承内置 `:workspace` 来声称受限读，该内置有全盘读授权。`:minimal` 提供必要系统/运行库读取；macOS 平台/helper 有额外依赖读取，因此应验证任务数据隔离，不假称系统文件也不可读。
- command env 合并服务端环境，必须按真实子环境继承机制裁剪密钥。域名 allow/deny 依赖实际代理启用；不限制 Codex Web Search/Apps/MCP。
- Windows unelevated 不支持 restricted reads/deny-read，并拒绝无沙箱降级；协议字段存在不等于各平台权限等价。
- 模型元数据 tool_mode 优先于模式开关；CodeModeOnly 需要可用 code-mode host 且无普通 Direct 回退。嵌套命令另外需要 selected execution environment、ShellTool 和模型 shell 能力；environments=[] 会关闭环境。
- command/exec 独立 argv 执行证明通道经 Codex，不能独自证明命令是 Codex 模型规划的。

权威源码：[配置](https://github.com/openai/codex/blob/01fc69f4026735edfdf6789820549727a4867b11/codex-rs/config/src/permissions_toml.rs)、[profile 编译](https://github.com/openai/codex/blob/01fc69f4026735edfdf6789820549727a4867b11/codex-rs/core/src/config/permissions.rs)、[工具决议](https://github.com/openai/codex/blob/01fc69f4026735edfdf6789820549727a4867b11/codex-rs/core/src/tools/mod.rs)、[命令注册](https://github.com/openai/codex/blob/01fc69f4026735edfdf6789820549727a4867b11/codex-rs/core/src/tools/spec_plan.rs)、[Windows](https://github.com/openai/codex/blob/01fc69f4026735edfdf6789820549727a4867b11/codex-rs/sandboxing/src/windows.rs)。

真实 profile 加载/选择、helper 与环境健康、目录/网络隔离、跨平台效果仍未验证。本轮没有追加第三探针或模型调用。


正式独立评审回执：CONCERNS[REV:bd24aad65a0b]，4 项 open major，不能进入生产实现。research-gate audit 与 git diff --check 本轮退出 0。全局 reviewctl audit 退出 1，报告 19 条其他任务的过期或未闭合记录，本轮输出未列 T1057 回执问题；完整结果见 audit-results.json，不能记成全绿。未运行整项目 reconcile 或补写 T1057 通过验收。任务保持研究暂停。
