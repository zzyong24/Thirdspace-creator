# T-538 CreatorOS 渠道绑定产品反馈消费契约

> 状态：BUILD
> 上游唯一契约：
> `/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/channel-bound-product-feedback-v1.md`
>
> 共同 fixture：`fixtures/channel-bound-feedback-v1.vector.json`，SHA-256
> `1102c0e1c172938ed63f877a033bb169ab7b396575fa2e84547f30bcf0c24fab`

## 1. 信任边界

浏览器 UI 只持有用户已经看到的 `summary/description/reproductionSteps` 和非敏感应用摘要。
本机 Next standalone 是随桌面包完整性校验后启动的可信 sidecar；只有它能通过 master-key fd
解密 `.license`，读取 `code/projectKey/machineId`，并执行两段 HTTPS 出网。下列值不得返回
Web、剪贴板、日志或遥测：

- 激活码、机器标识；
- `feedbackContextToken`；
- `projectKey/channelRef`、渠道优先级；
- AM/Growth 原始错误正文。

普通页面代码不得直接导入 `.license` reader；唯一出网入口是 server-only
`frontend/src/server/feedback/product-feedback.server.ts`。

## 2. API-CREATOR-001

```http
POST /api/v1/local/product-feedback
Content-Type: application/json
Idempotency-Key: <lowercase UUID>
x-creatoros-handshake: <启动随机值>
```

closed body：

```json
{
  "summary": "导出按钮没有反应",
  "description": "点击导出后没有文件，也没有错误提示。",
  "reproductionSteps": "",
  "appVersion": "1.8.0",
  "osName": "macOS 15",
  "locale": "zh-CN"
}
```

sidecar 固定执行：

1. 读取并解密当前 `.license`，要求 `allowed=true` 且 code/project/machine/runtime 都存在；
2. 从已验签 `bugFeedbackUrl` 只取 HTTPS origin，并命中部署/编译
   `CREATOROS_FEEDBACK_OFFICIAL_ORIGINS`；
3. 固定请求 AM `/api/license/feedback-context`，校验确切响应 bytes 的 digest、Ed25519、
   RFC1123 date 和 nonce；
4. token 只留内存，固定请求该 origin 的 `/api/v2/product-feedback`，禁止 redirect；
5. 只有 Growth `202` closed receipt 才向 UI 返回 `publicRef`。

成功 `202`：

```json
{
  "ok": true,
  "publicRef": "FDB-01J7K0T2AB",
  "status": "new",
  "channelBinding": "verified"
}
```

失败返回 `{ok:false,code,message,retryable}`；UI 保留 summary/description 与同一
`Idempotency-Key`，明确允许重试。编辑文字才生成新 key。复制、脱敏预览、打开加密日志目录和
外部反馈页继续保留，均不冒充提交。

## 3. 规范化与限制

- `summary` 5..160、`description` 1..4000、`reproductionSteps` 0..4000 Unicode scalar；
- `CRLF` 与孤立 `CR` 在本地 contract 层统一为 `LF`；
- 允许 `LF/TAB`，拒绝其余 C0/C1 与双向控制字符；
- 本地 raw body 与上游 response 都有限长；
- Growth endpoint 不从用户输入、渠道 URL path、query 或 fragment 派生；
- AM/Growth 请求都使用 `redirect:"manual"` 和 10 秒超时。

## 4. 发布配置

| 配置 | 来源 | 失败语义 |
| --- | --- | --- |
| `CREATOROS_LICENSE_PUBLIC_KEY_B64` | Rust 从现有内嵌 AM raw Ed25519 公钥运行时注入 sidecar | 缺失/非法：503，反馈 fail-closed |
| `CREATOROS_FEEDBACK_OFFICIAL_ORIGINS` | GitHub Actions variable，Rust 编译期烘焙并注入 sidecar | 缺失/不匹配：503，反馈 fail-closed |
| `CREATOROS_LICENSE_BASE_URL` | 现有 AM 配置，默认 `https://license.aitongban.cloud` | 非纯 HTTPS origin：503 |

workflow 在正式打包前验证 official origins，不允许空值、userinfo、port、path、query 或 hash。

## 5. 验收证据

- contract closed schema、CRLF→LF 与敏感额外字段拒绝；
- sidecar AM 响应 digest/Ed25519/nonce 篡改负测；
- `.license` 加密封包外不可见 code，解密后只在 server service 使用；
- route loopback/handshake default-deny、坏 UUID/额外渠道字段拒绝；
- UI 明确发送、202 回执、失败保留、同 key 重试、复制与日志入口回归；
- shared fixture 与 Growth `cmp=0` 且 SHA-256 exact；
- contract/frontend typecheck、focused Vitest、Rust cargo check/build。
