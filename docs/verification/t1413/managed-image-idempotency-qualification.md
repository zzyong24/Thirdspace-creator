# T-1413 / FR-141306：当前官方同步图片幂等资格核查

核查日期：2026-10-25。核查者：`/root/t1427_pi_diagnosis`。

**结论：当前未证，不具备据此启用官方同步图片未知提交恢复的资格。** 客户端生成稳定 key、发送 Idempotency-Key、冻结官方来源或旧 DEC 的许可，均不足以证明当前服务端同 key 不重复生成、不重复计费。本次没有找到适用于当前受管图片端点的明确官方保证或可核验网关实现。结论是“证据不足”，不是断言所有相关服务均不支持幂等。

本次仅核查当前开发源码、已获准的 Growth 受管凭据实现及官方公开页面；没有读取私有凭据、用户数据库、运行态连接文件或部署秘密，没有测试执行、真实模型请求或生产改动。唯一写入为本文件。不继续扩大考古，不以合成 HTTP 服务补足供应商资格。

## 1. 当前客户端实际发送什么

源码锚：CreatorOS `4db7b52b5e24ad5b5e2c3744546b17416e913e9a`。以下是可由源码证明的执行分支；没有查询用户正在使用的实际图片路由，不能把某一分支认作该账号当前唯一官方图片模型。

| 环节 | 已证实行为 | 不能证明什么 |
| --- | --- | --- |
| `ai-worker/src/execution/asset-worker-run.ts:77` | 从原受控预留的 callId 构造 `execution-asset:${callId}`，传给图片适配器的 idempotencyKey。不是客户端随机新建任务 key。 | 供应商是否接受 key、去重范围、过期时间、是否退费或复用首个结果。 |
| `ai-worker/src/runtime/multimodal-openai-images.ts:208`–213、227–233 | OpenAI-compatible 的 JSON generations 和 multipart edits 两支都发送 `Idempotency-Key: opts.idempotencyKey`；同时使用 Bearer 鉴权。 | OpenAI 兼容协议并不等于任何中转站都实现该 header 的计费/生成去重。 |
| 同文件 `:106`–124 | baseUrl 可为根地址、`/v1` 或完整 endpoint；最终使用 `/v1/images/generations` 或 `/v1/images/edits`。baseUrl 为 null 才使用适配器内置 OpenAI 默认地址。 | `provider:openai` 不足以认定请求打到 OpenAI 官方，更不等于应用内“官方受管”资格。 |
| 同文件 `:217`、243 附近 | fetch 抛错被标为 network/submit、retryable:false，表示提交结果未知。 | 抛错不能证明对端尚未接收、未生成、未计费。 |
| `ai-worker/src/runtime/multimodal-minimax.ts:62`、126–156 | 同步 `POST /v1/image_generation` 只使用 authHeaders 的 Bearer 与 Content-Type；本图片分支没有把 opts.idempotencyKey 放入 header 或 body。 | 即使上游 worker 产生了稳定 key，也不能声称 MiniMax 这条实际图片请求已经携带相同 key。 |
| `ai-worker/src/execution/asset-worker-run.ts:19`–23、56–61 | 正式 Worker 绑定父 signal；OpenAI adapter 的 maxTransientAttempts 显式设为 1；已有 started/unknown 图片先回读原结果，没有 job 时不新提交。 | 不能通过恢复旧 helper 的隐藏重试绕过当前未知状态和账本。 |

MiniMax 的 `reference`/safeReference 出现在 H3 **视频**任务路径（同文件 277、293 行附近），不是同步图片幂等保证，不能借用。

## 2. 冻结 spec 能证明身份，不能证明幂等资格

`backend/src/modules/ai-runtime/channel-model-config.ts:481`–501 的 `channelMultimodalSpecFromRoute()` 投影 provider、baseUrl、model、kind、settings、serviceId、apiFormat、credentialLifecycle，并设置 `displayModelKey:'channel-managed'`。`multimodal/resolve.ts:234`–249 从可信渠道路由解析，显式 official 缺该能力时拒绝切到自配来源。

`contract/src/internal/asset-generation.ts:44` 的 runtime options 包含 settings、apiFormat、displayModelKey、credentialLifecycle；`asset-business-execution.service.ts:140` 附近将这些字段的规范 JSON 摘要保存为 runtimeOptionsDigest；`backend/src/modules/execution/execution-asset-ports.service.ts:37`–56 在原 lease 下核对 provider/model/baseUrl/serviceId/kind 和 digest，凭据解析前后均有受控归属/执行验证。

这些代码可证明“恢复不能悄悄换渠道或配置”。目前被读取的契约没有明确的幂等能力版本、适用 endpoint、key scope/TTL、同 key 同输入及计费保证字段；settings 虽能存 JSON，当前没有将其某字段解释为经过验证的图片幂等合同。因此：

- `source=official` 或 `displayModelKey=channel-managed` 只说明来源，不能单独批准未知结果重提。
- `credentialLifecycle=per_request` 只说明凭据生命周期，不能证明不同短期凭据下 key 的去重范围相同。
- runtimeOptionsDigest 冻结的是原配置；摘要不会创造原配置没有的服务端保证。
- 不能把当前账号的隐藏路由猜成某个官方站，也不能从历史示例中的端点推断当前部署。

## 3. 受管网关仓库证据边界

按已有授权，读取 `/Users/zyongzhu/Workbase/Thirdspace-growth/AGENTS.md` 与 `server/integrations/managed_model/omnihi.py`，限于公开接口实现逻辑；未读环境文件、连接配置、密钥、数据库或部署文件。Growth HEAD 为 `0fb61a9dd3cf80bbb6675415f4110738f3b17ba1`，此处绑定的是读取时工作树，不是线上部署证明。

`omnihi.py:67` 的类是 `OmniHiManagedModelKeyProvider`，职责为受管 API Key 的创建/回读/预算管理。70 行“Provider 暂无幂等键”描述的是**创建 API Key**的约束，其确定性名称先查后建及 unknown 后 recover_api_key 也针对 Key 创建。不能把这段注释改解为“图片生成支持”或“图片生成不支持”幂等。

对该受管 adapter 目录中的 Idempotency-Key、idempotency、images/generations、images/edits、image_generation 做定向检索，没有找到图片生成请求的服务端接收、原子占位、同 key 结果复用或计费去重实现。此前已查的 Growth 模型管理范围同样不等于实际图片流量网关。未获得当前部署对应的图片网关源码，因此不能用 Growth 的管理端幂等或预算同步逻辑替代生成资格。

## 4. 官方公开来源核查

仅将与图片端点直接相关的官方页面作为候选证据。网页于 2026-10-25 读取；搜索无命中只代表本次限界检索未获得保证，不作全网不存在的断言。

| 来源 | 核查结果 | 资格结论 |
| --- | --- | --- |
| [OpenAI Create image](https://developers.openai.com/api/reference/resources/images/methods/generate) | 当前图片生成 API 文档可读；页面内查找 `idempoten` 无匹配。没有取得该图片接口在断连后同 header 不重复生成/计费的条款。 | 未证；OpenAI 兼容中转站还需自己实现或明确继承保证。 |
| [OpenAI Create image edit](https://developers.openai.com/api/reference/resources/images/methods/edit) | 当前图片编辑接口页面可访问；本轮检索没有获得其未知提交同 key 计费去重保证。 | 未证，不能由 generations 猜 edits。 |
| [MiniMax 文生图](https://platform.minimax.cn/docs/api-reference/image-generation-t2i) | 原 platform.minimaxi.com 官方地址重定向到该页面；请求示例使用 Authorization/Content-Type；查找“幂等”和“Idempotency”均无匹配。 | 未证，且本仓库该图片 adapter 目前不传 key。 |
| [OmniHi 官方站](https://omnihi.ai/) | 页面可访问，但文本工具未返回可读文档正文；站内域名限定“幂等”/“Idempotency”搜索无结果。 | 未获得正式图片端点保证；没有绕过登录或读取私有资料。 |

域名限定 OpenAI 搜索还返回 Agents sessions、Workspace Agents、Commerce、Ads 的 Idempotency-Key 条款。这些 API 的副作用对象和 endpoint 与图片生成不同，明确不作为本项证据。非官方中转站自行宣称的去重、旧 DEC、旧 runner 以及本地 mock 同样不能取得当前受管路由资格。

## 5. 对 FR-141306 的明确交接

1. 本项**当前未证**，不得仅据现有 channel-managed 标记启用生产重提；保持未知提交的 unknown、不切源、不换 key、不新建任务。保留 FR-141306 未通过事实，不能用“有同键 header”标完成。
2. 可以补强当前安全边界的本地测试：OpenAI-compatible 实际请求带原 key；MiniMax 当前图片未带 key 的事实；未知/重启/自配/视频不重复提交。它们是现有安全行为的回归证据，不能把官方恢复正例标绿。
3. 要取得资格，需要与当前已冻结 route 相匹配的明确供应商图片 API 合同或当前网关实现及版本证据，至少涵盖 endpoint、凭据/租户作用域、key TTL、相同输入校验、并发/断连后的原请求状态和结果复用，以及一次生成/一次计费。仅客户端发送 header 或数据库只有一个本地候选不够。
4. 即使后续取得供应商资格，还须按 T-1413/T-915 独立审核恢复预算、取消/失租、原调用状态、崩溃不重置及真实 HTTP+IPC 测试，不能把资格结论直接当实现验收。

本轮已经达到限界：当前源码的请求形态、身份冻结证据及相关官方文档未提供所需保证。停止追加历史搜索，不进行真实付费试探。

## 6. 读取内容绑定

| 文件 | SHA-256 |
| --- | --- |
| `ai-worker/src/execution/asset-worker-run.ts` | `8a070521270ec5117078ed1f4b783830aa557d4e7fa52d2d9672ce9e91efb055` |
| `ai-worker/src/runtime/multimodal-openai-images.ts` | `03e042a28ec529571ce49643793cd473c9b3d7d4a5f4cf14fe1e52e849d8e35a` |
| `ai-worker/src/runtime/multimodal-minimax.ts` | `d2d45b1dc0155b1569c6bfab507df7c81300ce349a6041d05a28bdd18245a0fd` |
| `backend/src/modules/ai-runtime/channel-model-config.ts` | `c0ea0175cc66b7f1e396500efe8d8a5528a411b122d446d88fb3e6a90a704eb1` |
| `contract/src/internal/asset-generation.ts` | `2a629eab6e238ef6e59321cb372b185c3cadedbc1a55636556f60f80a3a72360` |
| `backend/src/modules/ai-runtime/asset-business-execution.service.ts` | `e18e41898da1ecad3e7506655d824d2f9f0af35c7da5aa3116d92fecc926d373` |
| `backend/src/modules/execution/execution-asset-ports.service.ts` | `5cd730b178bc030cbb2ca45803026288f97b54cac9ce27c868600e1ccf069fa3` |
| Growth `server/integrations/managed_model/omnihi.py` | `afbe713f159734a31125c3113b38885736b347dd7ca27bdc95c65305a02bd5c4` |
