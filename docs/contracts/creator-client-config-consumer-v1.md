# T-575 CreatorOS 客户端配置消费契约 v1

> **历史契约，T-606 已取代模型 extension 规则。** `creatoros.model-config` 的当前权威、secret
> 边界、三态裁决和运行时采用规则只见
> `docs/superpowers/specs/2026-07-29-creatoros-channel-model-authority.contract.md`。
> 本文的三键 parser、长期 Key 禁止、24 小时远端 LKG 与 `ready/offline` 规则不得用于新实现。

> 状态：用户 2026-07-29 明确授权进入 BUILD；上游 Growth
> `client-config-distribution-v1` 已独立评审 PASS[REV:d2895a3b6dac]
> 上游权威：Growth `docs/contracts/client-config-distribution-v1.md`
> 本仓范围：只定义 CreatorOS 消费、验签、产品协议解析、LKG 与本地安全投影

## 1. 权威与固定边界

- Growth 是渠道配置和产品专用 opaque JSON 的唯一写入方。
- Activity（Activation Manager，下称 AM）只证明当前有效授权，签发短期
  `config.pull` ticket；不保存或解释产品配置正文。
- CreatorOS 只从当前加密授权取得 `projectKey/channelRef/code/machineId`，不接受 Web、
  用户输入、渠道 URL 或 query/body/header 覆盖 identity。
- `channelConfig` 的业务入口继续以 T-534 的 AM signed `channel-runtime-v2` 为运行真相；
  Growth bundle 内的同源六键只参与 bundle 完整性和版本依赖，不作为第二套 UI runtime。
- `extensions[].payload` 是 Growth core 不解释的 JSON。CreatorOS 只解析
  `creatoros.model-config@creatoros-model-config-v1`，未知协议 fail-closed。
- payload、bundle、缓存和客户端投影均不得含长期模型 API key、支付密钥、激活码、原始设备
  标识或长期 bearer。ticket、code、machineId、identity、digest、keyId、signature 不跨本地
  server-only 边界。

## 2. API-575-002：server-only refresh（Growth 跨仓编号 API-CREATOR-002）

```http
POST /api/v1/local/client-config
Content-Length: 0
X-CreatorOS-Handshake: <启动级本地握手>
```

权限与重复行为：

- 只接受受现有 loopback guard 保护的本机请求；非 loopback、握手错误或带请求 body 均在任何
  外网调用前拒绝。
- 重复调用每次都重新向 AM 取得短票，并让 Growth 在线内省当前授权；不从历史成功推导当前有效。
- feature flag、origin、公钥或 keyId 缺失时返回 `pending` 且 AM/Growth 调用数为 0。
- 应用启动后异步触发一次；成功激活或 claim consume 落盘后再触发。进程持续运行时按
  6 小时加最多 15 分钟的本机稳定抖动继续刷新。失败不阻塞主界面，也不
  破坏现有 `.license` 或 T-534 runtime。

200 closed body：

```json
{
  "state": "ready",
  "modelPolicy": {
    "serviceMode": "managed_default_user_override_allowed",
    "profileKey": "balanced",
    "capabilityRoutes": {
      "script.draft": "text-quality"
    }
  },
  "action": "配置已更新"
}
```

离线 24 小时内返回同形状 `state="offline"`。失败 body closed：

```json
{
  "state": "unavailable",
  "modelPolicy": null,
  "action": "配置服务暂时不可用，请稍后重试",
  "retryable": true
}
```

`pending` 使用 503；授权到期使用 410；其余不可用使用 503。所有响应
`Cache-Control: private, no-store, max-age=0`。

## 3. AM ticket exact consume

CreatorOS 向固定 AM origin 调：

```http
POST /api/license/client-config-tickets
Content-Type: application/json
Accept: application/json
```

closed body：

```json
{
  "contractVersion": "config-access-ticket-v1",
  "projectKey": "creatoros",
  "code": "<只发送给 AM>",
  "machineId": "<当前绑定标识>",
  "nonce": "nonce-client-config-0001"
}
```

Activity 只证明 `projectKey/channelRef` 和当前授权事实，不拥有应用/客户端目录，也不授权
`clientId`。过渡期若旧 ticket 响应仍带 `clientId`，Creator 只兼容忽略，不参与任何授权、
版本或路由判断。

Creator 必须按顺序验证原始 body 大小、`X-License-Digest`、Ed25519、`X-License-Date`
五分钟窗口、closed body、request nonce 与 300 秒 ticket expiry。任一步失败不得调用
Growth。`LICENSE_REVOKED/EXPIRED/BINDING_MISMATCH/CHANNEL_UNAVAILABLE` 均禁止使用 LKG；
AM 网络或 authority 暂时不可达才可进入 §6 的离线判断。

## 4. Growth bundle exact consume

```http
GET /api/v2/client-config/bundles/current?clientVersion=<app-version>&accept=creatoros.model-config%40creatoros-model-config-v1
Authorization: Bearer <configAccessTicket>
If-None-Match: "<last bundleDigest>"
```

- origin 固定为构建期 `https://growth.aitongban.cloud`；HTTPS、无 userinfo/port/path/query/
  fragment，不跟随 redirect。
- 请求不得携带 `projectKey/channelRef/clientId` override；Creator 只用 `accept` 声明
  extension/protocol，由 Growth registry 解析并签入最终 `clientId`。
- 200 body 必须是 `growth-client-config-bundle-v1` closed envelope；只允许一条已请求的
  `creatoros.model-config@creatoros-model-config-v1` extension。
- Creator 用 RFC 8785 JCS 复算 semantic digest，再用构建期 Growth Ed25519 公钥和 exact
  `keyId` 验证 signed object；随后匹配当前授权 `(projectKey,channelRef)`。
- Creator 继续强校验 Growth-signed `clientId=creatoros.desktop`；该值不得来自 Creator
  自报或 Activity claim。
- `bundleVersion` 只在完全相同的 `projectKey/channelRef/clientId` locator 内单调上升，
  same/same 幂等；lower 或 same/different 均保留该 locator 的密文并拒绝。切换 locator
  必须开启独立序列，旧密文只作 inactive 保留。
- 304 仍要求 Growth 已完成在线 AM introspection；Creator 必须核对 ETag、bundleVersion 和
  keyId 与本地 LKG 完全一致后才能刷新 `checkedAt`。
- response 超过 300000 bytes、payload canonical UTF-8 超过 262144 bytes、深度超过 32、
  非有限数、未知协议、坏签名、坏时间或 closed schema 漂移均 fail-closed。

## 5. CreatorOS 产品协议

`creatoros-model-config-v1` 只接受：

```ts
type CreatorModelPolicy = {
  serviceMode: "managed_default_user_override_allowed" | "byok_required";
  profileKey: "balanced" | "quality";
  capabilityRoutes: Record<string, string>;
};
```

- payload 恰好三个键，禁止额外字段。
- `capabilityRoutes` 最多 64 项；key/value 均匹配
  `^[a-z][a-z0-9.-]{0,63}$`。
- 产品 parser 只输出上述安全投影；不输出 opaque 原文、渠道 identity、revision、digest 或
  签名。
- 该 policy 只能收窄/选择 CreatorOS 已支持的模型能力，不能扩大 entitlement 或绕过本地
  BYOK/secret 边界。长期模型 secret 永不从 Growth 下发。

## 6. LKG、撤权与离线

- 成功验签并完成产品 parser 后，整份 signed bundle 以 AES-256-GCM 写入独立
  `.client-config-lkg`，只允许使用现有原生 master key 派生的专用上下文；master key
  处于开发降级态时必须在出网前 fail-closed，禁止用随机降级 key 写普通文件。临时文件
  0600、flush、`sync_all`、原子 replace、目录 sync、读后验真。
- LKG identity 必须等于当前加密授权；改绑后旧 identity LKG 不跨绑。
- 只有网络或 authority 暂时不可用，且 `checkedAt` 未满 24 小时、bundle 未过
  `hardExpiresAt`，才能输出 `offline`。
- 已撤权、到期、binding/channel 变化、terminated、ticket replay/invalid、坏签名、低版本、
  同版 collision、未知协议均 fail-closed，禁止 silent mock fallback。
- 明确撤权/到期/改绑/terminated 时写入不含旧 bundle 的 blocked 状态；重新取得有效授权并
  验签新 bundle 后才恢复。

## 7. 配置与互操作 Gate

默认关闭：

- `CREATOROS_CLIENT_CONFIG_PULL_ENABLED=0`
- `CREATOROS_GROWTH_CLIENT_CONFIG_ORIGIN=""`
- `CREATOROS_GROWTH_CONFIG_PUBLIC_KEY_B64=""`
- `CREATOROS_GROWTH_CONFIG_KEY_ID=""`

Mac beta 联调时必须显式提供：

- `CREATOROS_CLIENT_CONFIG_PULL_ENABLED=1`
- `CREATOROS_GROWTH_CLIENT_CONFIG_ORIGIN=https://growth.aitongban.cloud`
- Activity 既有 `CREATOROS_LICENSE_BASE_URL=https://license.aitongban.cloud`
- Activity 既有 `CREATOROS_LICENSE_PUBLIC_KEY_B64`
- Growth 当前 `CREATOROS_GROWTH_CONFIG_PUBLIC_KEY_B64`
- Growth 当前 `CREATOROS_GROWTH_CONFIG_KEY_ID`

共享 fixture：

- `docs/contracts/fixtures/config-access-ticket-v1.vector.json`
- `docs/contracts/fixtures/growth-client-config-bundle-v1.vector.json`

两文件必须与 Growth canonical byte-for-byte 相同，并固定 SHA-256：

- ticket：`a71d21773cb2f0b0033a0231c657ec09df24f2a1b07ae99f1c395e35a6fc8620`
- bundle：`5a2db6c963a16c06b47956579c7974dba02f73df7fef389d90a515b1ee8f3251`

## 8. 数据链路可行性

| requirement | source | validation | storage/read | failure | verdict |
| --- | --- | --- | --- | --- | --- |
| FR-575-08 产品配置 | Growth reviewed API-216 + shared fixture | AM raw-body Ed25519；Growth JCS/Ed25519/identity/version | AES-GCM LKG → Creator product parser → safe projection | 24h 仅网络容错；撤权/过期/replay/坏签名 fail-closed | feasible |
| API-575-002 启动刷新 | 系统内生 Rust startup/activation hook | loopback handshake + empty body | server-only refresh，不阻塞 UI | disabled 零出网；错误仅人话动作 | feasible |
