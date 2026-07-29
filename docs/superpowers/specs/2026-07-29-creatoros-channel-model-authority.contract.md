# T-606 CreatorOS 渠道模型配置权威绑定

> 状态：待独立评审。本文只绑定 CreatorOS 消费实现，不复制或改写 Growth 产品真相。
>
> 最终上游契约：
> `/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-086-creatoros-managed-model-service.md`
>（SHA-256 `be1d4546b080e8b30144e31dd20d2e094d82b66d3c57d0f6116782fb89650182`）
> 与
> `/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-086-review-concern-resolution.md`
>（SHA-256 `68bd438f9893a7c4508cff396274e893cb630d7ad488109e6b91430f18cdbc0f`）。
> 如上述文件内容与固定摘要不符，T-606 必须停止并重新评审。

## 1. 取代关系与不可变边界

- 本文取代 `docs/contracts/creator-client-config-consumer-v1.md` 中关于
  `creatoros.model-config@creatoros-model-config-v1` 的三键 parser、长期 Key 禁止、24 小时
  远端 LKG 优先和 `ready/offline` 权威规则；旧文档只保留 T-575 历史。
- 废止 T-604 的 Gateway、短 bearer、introspection、alias routing、`managed_locked` 和
  “渠道配置存在时禁止编辑本地配置”。T-606 不实现或保留这些兼容分支。
- 继续复用既有 `config.pull` ticket、Growth bundle 验签、ETag、版本单调性与
  `projectKey/channelRef/clientId` 固定 locator。身份只来自当前加密激活事实；请求和页面不得
  覆盖 locator，激活码归属不变。
- Growth 下发的 payload 只要求根节点是 JSON object。CreatorOS 在 pull 成功阶段不检查
  provider、URL、Key、模型名、参数或未知字段，也不做连通探测。

## 2. 唯一裁决表

| 本次 pull 结果 | 本机历史渠道密文 | 当前 authority | 用户本地配置 |
| --- | --- | --- | --- |
| verified 200 + extension object | 原子写入独立 secret namespace | `channel` | 保留、inactive |
| verified 304 + identity/revision/digest 完全匹配 | 读取当前 revision | `channel` | 保留、inactive |
| verified 200 且明确无 extension | 保留、标记 inactive | `local` / `not_configured` | 生效 |
| DNS/TLS/timeout/5xx，本次没有取得渠道 JSON | 保留、标记 inactive | `local` / `unreachable` | 生效 |
| 坏签名、locator mismatch、downgrade、collision、payload 非 object | 隔离、标记 inactive | `local` / `security_error` | 生效，同时显示安全错误 |

模型调用阶段的无效 Key、错误 URL、未知 provider、错误模型或请求失败不改变 `channel`
authority，不触发本地配置重试。旧 24 小时远端 LKG 不适用于该 extension。

## 3. 本机 secret store

- 使用原生 master key 经独立 context 派生的 AES-256-GCM namespace；开发降级 key 不得保存。
- 记录固定激活 identity、bundle version/digest/keyId、extension revision、opaque payload、
  authority 与最近 pull outcome。payload 只存在于 server-only 内存和加密文件。
- 写入采用 0600 临时文件、flush、原子 rename、目录 sync 与读后验真；同版同 digest 幂等。
- `not_configured/unreachable` 只改变 active 标志，不删除历史密文；安全失败进入 quarantine，
  运行时不可读 payload。
- API、RSC、日志、错误、analytics、URL、query、审计摘要和测试固定文本不得输出 payload、
  Key、ticket、code、machineId、locator、digest 或签名材料。

## 4. 统一运行时采用边界

组合根提供唯一 `readChannelModelAuthority()`。所有模型解析器在每次形成调用配置前只做一次
authority 选择：

1. `channel`：从 opaque JSON 投影 CreatorOS 当前 provider adapter 所需字段并直接返回；
   不读取用户 DB/env 默认，也不在后续异常时重试本地。
2. `local`：完全沿用现有用户 DB → env → 内置默认链。

该边界必须覆盖文本 `resolveLlmConfig/resolveDedicatedLlmConfig`、Vercel `ModelSpec`、
agentic raw config、图像/视频/视觉/ASR、embedding、联网搜索和“测试当前实际配置”读面。
投影只是调用 adapter 的字段读取，不是 pull 阶段的 schema validator；缺字段、错类型或未知值
必须在对应模型调用中诚实失败，不能被解释成“渠道未配置”。

官方 template 的兼容字段为 `provider`、`baseURL`（同时接受 CreatorOS 既有拼写
`baseUrl`）、`apiKey`、`model`、`apiFormat`、`settings`。未知字段完整保存在加密 payload，
并随 `settings` 透传给支持它的文本 adapter；不从未知字段猜造另一个配置体系。

## 5. 设置页与本地 API

- 设置页模型区顶部只显示脱敏状态：
  - `渠道模型正在使用`；
  - `本地模型正在使用 · 渠道未配置`；
  - `本地模型正在使用 · 暂时无法取得渠道配置`；
  - `本地模型正在使用 · 渠道配置安全校验未通过`。
- 用户本地模型表单继续可编辑和安全保存；渠道生效时说明它是备用配置，不锁定、不隐藏。
- 本地 refresh API 仅返回 `authority/outcome/action/retryable` 安全投影，不再返回
  `modelPolicy` 或 opaque JSON。所有响应 `private, no-store`。

## 6. 验收

- `TC-T606-01`：任意 object（含未知字段与测试占位 Key）verified 200 后原子保存且
  authority=`channel`，API/UI 不回显 payload。
- `TC-T606-02`：渠道 Key/URL/model 错误时运行时调用失败，未读取或调用本地模型。
- `TC-T606-03`：明确无 extension 时历史密文保留 inactive，本地模型生效。
- `TC-T606-04`：网络/5xx 时历史密文保留 inactive，本地模型生效；不存在 24 小时远端回退。
- `TC-T606-05`：verified 304 仅在 identity/revision/digest 匹配时重新激活渠道配置。
- `TC-T606-06`：坏签名、locator mismatch、downgrade、collision、非 object 均 quarantine，
  本地生效并返回脱敏安全错误。
- `TC-T606-07`：文本、专用文本、agentic、图/视频/视觉/ASR、embedding、搜索均经过同一个
  authority 选择；channel 模型调用失败不触发 local resolver。
- `TC-T606-08`：设置页桌面与 390px 视口可辨认四种状态，本地表单始终可编辑，页面、日志、
  错误和请求 URL 不含测试 Key 原文。
- `TC-T606-09`：现有激活 locator、AM ticket 请求与 Growth ticket consume 不变，客户端无法
  覆盖 `projectKey/channelRef/clientId`。

## 7. 发布边界

本任务只提交并推送 CreatorOS 私有分支，供总控与 Growth/Activity 联调。没有生产 key、
正式渠道配置、跨仓联调证据和用户发布许可时，不发布下载站，不宣称三端上线。
