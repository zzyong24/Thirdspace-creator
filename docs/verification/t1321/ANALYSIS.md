# T1321 只读分析：图文重组没有正式候选

## 已知和未知

原 U14 auto/manual 各自实际回合 succeeded，但没有可采纳候选。auto 有十个成功 read 类工具 part，manual 有四个；两者没有保存成功的 `tool-work.editor.propose`（成功业务输出 kind 才叫 `work.editor.candidate`）。read 的 error/failureCode 均 null，完整 document 为 graphic_post、六页，baseDigest 与实际提交 target 一致；后续 field_window 返回 document=null 是窗口视图的合同。不能把缺 part 当作绝无 native 尝试。

安全日志确认 auto 三次、manual 一次 `executeExternalTaskTool / ConflictError / HOST_PORT_REJECTED`，没有 toolName、中文断言、参数。原模型的自述不是拒因。旧 SSE 只在成功候选断言后 finish 保存，原失败没有落盘，不能补拍。已有证据与 SHA 见只读 OBSERVATION_INDEX；完整 read/owner source 对照在 T1314 `diagnostics/U14-read-owner-schema/`。以上不归因到 T1320 混流：两个图文回合已终态，未证明它们具有 ordinary 混流冲突。

## 可实施的最小装配

真实公共 route 位于 `frontend/src/app/api/chat/route.ts:120`，会依原 loopback guard、实际 session/RequestContext、本地身份、editor target 与保存消息进入 `getChatRuntime`、`prepare-chat-reply.ts`、durable submit。`getChatRuntime` 与 compositeTransport 共享 `buildPersistence` 的同一真实新库。可以在 module integration test 内直接调用真实 `POST(Request)` 并消费真实响应流，不启动/改当前 candidate，不必改生产 logger；这证明公共 route/service root，不冒新 UI 点击。

准备图文使用真实公开 create/get/version 路径。按钮原话术来自 `frontend/src/features/projects/script-first-content.ts:20` 的 `reorganizePrompt('rednote')`，直接复用函数，不凭诊断猜测改提示。只有一次新 root submit，是否实际调用 propose 服从真实 Codex；没有调用/没有复现都保事实。

观察最早可接在 `backend/src/modules/execution/model-worker-dispatcher.ts:185` 创建 supervisor 的 options.ports.invoke。`worker-supervisor.ts:150` await 它，随后 catch 在 156–172 把真实异常压成安全内部码。因此测试透明 catch 可以先取得后端实际原断言，再原样 throw；不动 validate、业务工具或返回结果。T1313 `legacy-work-review-preparation.persistence-client.test.ts:123–151` 已有该包装先例；T1310 supplemental:48–56 也是观察同 invoke，本任务不沿用其假协议/凭据。

通过生产 composition 的 `createChatWorkerDispatcher`/真实 resolveTools 装配回调可透明观察同 ref 工具对象。dispatcher 本来持有 `resolveTools(context,input,ref,signal)`；wrapper 原样 await 并返回原集合，只供 fixture 事后只读校验。不能把它替换成自己 build 的工具集冒 frozen 定义。核对真实 owned DB 中 frozen.tools、`chat-work-editor-protocol.ts` owner version 与当前对象后，在已知参数拒绝的 catch 中 safeParse 原 input，保 issue path/code 与键类型大小/digest，绝不保存值。若无法透明接回调，或模块绑定不对应同一实例，先 BLOCKED 报精确装配缺口，不改 production 暴露新端口。

## 参数错误为什么可能没有卡

`external-task-tool.service.ts:64–67` 对真实 tool.parameters.safeParse 失败直接抛固定 ConflictError，早于 external_tool row 与 externalToolInputs proof 的 insert。`worker-supervisor.ts` 只返回 HOST_PORT_REJECTED；`external-chat-worker-run.ts:156–160` 将 Host 调用失败继续抛给 `codex-native-turn.ts:60–65` 的 onTool；`ai-worker/src/execution/codex-app-server-protocol.ts:54–56` 最后将 onRequest 异常变成 -32601 / CREATOROS_INTERACTION_UNSUPPORTED。因此原 public parts/ledger 不一定有该尝试或详细 issue；native 是否收到可纠正信息、模型为何选择结束，必须用新诊断实际事实回答，不能从旧自述补答案。普通工具的 structured invalid_input/recovery 与该 Host reserve 前拒绝是不同路径，不混签。

owner schema 来源是 `chat-assembly.ts:80` 从实际 editorTarget.owner 选 workEditorOwner，`chat-tools.ts:4092/4096` 使用 `workEditorOwnerSchemas`，`contract/src/resources/work-editor.ts:82–88` 对 graphic_post 只选本 owner 的 patch/snapshot，`chat-tool-definitions.ts:97` 编入 owner 版本。图文 metadata 的 body 可以走 patchGraphicMetadata；replaceGraphicTextRange 的 cardId/字段要求不能凭旧模型未保存的参数推断已踩中。新诊断必须展示真实 issue 才能关联。

## 认证和隔离可行性

应用新库由实际 `createConfiguredDb` 消费空 DATABASE_URL + 新 PGLITE_DATA_DIR，不复制任何用户数据。新库公开 settings 配 Codex，实际 routing/preflight/credential resolver保持。`persistence-client.ts:6154/7215` 通过实际 frozen route/local status 解析 Codex identity；`local-codex-worker-env.ts` 仅透传既有 Codex/代理/证书环境，不取应用 token。`codex-app-server.ts:44–48/73–100` 走锁定包内 CLI，继承现有 HOME/CODEX_HOME 并以 account/read(refreshToken:false) 查看当前认证；fixture 无需读/复制 auth.json 或 Keychain。既有认证不可用就 BLOCKED；不得登陆/退出、改用户设置、伪造 local status 或用新 API key。

注意这与旧受控测试的 `CODEX_HOME=empty`、假 JSON-RPC credential 不同：本次是真实 Codex，认证读写仍由原官方 runtime承担，测试不手动操作其文件。不能保证官方 CLI没有自身运行缓存，不能宣称用户认证目录零自然派生；明确禁止的是 fixture 复制/篡改认证与配置。

后续运行前需要锁定的实际新增消费包括 route/loopback/context、prepare-chat-reply/chat runtime/production composition、dispatcher/supervisor、external-task-tool、owner schema与工具 resolver/definitions、Codex host/protocol/local status/worker env、真实 UI 话术和独立 immutable execution/codex-status workers及 SDK runtime。只锁实际消费，不复制整个仓库；C 需在 R 四修写窗结束后给一致的受测生产 source/input packet，不能在其在途字节上偷偷跑。

当前只提交两份分析草案；未写诊断脚手架、未运行任何新 HTTP/test/模型、未改生产/控制。后续具体 W、执行预算和清理要求见 SPEC，待正式独评和执行包。
