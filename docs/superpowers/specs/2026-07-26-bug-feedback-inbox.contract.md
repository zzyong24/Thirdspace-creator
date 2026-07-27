# T-518 问题反馈直达入口 · Replacement Contract

### Artifact metadata

- Stage: `2-contract`
- Status: `passed`
- Upstream IDs: `T-518`、`DEC-FDB-002`
- Decision IDs: `DEC-FDB-002`、`DEC-ODR-001`
- Manifest status: 以 `docs/superpowers/specs/2026-07-26-bug-feedback-inbox.md` 的范围重置为准；旧 Growth 上传/工单契约全部 invalidated；用户已授权实现同一 Replacement 范围，独立契约审查 PASS 后才进入 BUILD。

## 1. Contract name

CreatorOS 侧边栏“问题反馈”本地整理与外部渠道直达契约。

本契约只覆盖：

1. 用户在侧边栏打开反馈弹窗；
2. 应用在本机整理、预览并复制安全诊断文本；
3. 用户主动打开签名配置的 `supportUrl`；
4. 用户主动打开加密日志目录。

不包含应用内提交、附件上传、工单状态、后台重试、管理员收件箱或“已发送”语义。

## 2. Consumers and providers

| ID | Consumer | Provider | 边界 |
|---|---|---|---|
| `API-FDBR-001` | `IssueFeedbackDialog` | Next 本地平台适配 route + `getChannelLink("support")` | 只读一个已净化 HTTPS URL，不读用户反馈内容；响应由 `@creatoros/contract` runtime schema 校验 |
| `API-FDBR-002` | `IssueFeedbackDialog` | 已有 `/api/v1/local/open-url` | 用户点击后打开系统浏览器，不代表已提交 |
| `API-FDBR-003` | `IssueFeedbackDialog` | 已有 `/api/v1/local/reveal-logs` | 只打开目录，不读取或上传日志 |
| `UI-FDBR-001` | 侧边栏底部入口 | `IssueFeedbackDialog` | 展开/折叠侧栏均可访问 |
| `PURE-FDBR-001` | `IssueFeedbackDialog` | 本地纯函数 | route 脱敏、敏感串遮蔽、反馈文本组装 |

## 3. Endpoint or operation

### `API-FDBR-001 GET /api/v1/local/support-channel`

- Request body: 无。
- Authentication: 无新增登录态要求。该值来自本机已经验签并缓存的渠道配置。
- Side effect: 无。
- Success response: HTTP `200`。

```json
{ "supportUrl": "https://example.invalid/feedback" }
```

未配置、缓存不存在、缓存损坏或 schema 不匹配也返回 HTTP `200`：

```json
{ "supportUrl": null }
```

route 不允许硬编码默认邮箱、官网或第三方地址，不允许返回非 HTTPS URL。由于既有
`getChannelLink` 故意把“未配置”和“缓存当前不可读”统一收敛为 `null`，UI 只能显示中性事实
“当前没有可用的反馈渠道”，不能把它断言成配置错误。

响应使用 `@creatoros/contract` 的 `localSupportChannelResponse` 作为运行时唯一 schema；
它是可信本地 platform adapter 的只读契约，不加入 `/api/v1/dispatch` 业务 operation registry。
route 与 client 都必须 parse，畸形响应按 unavailable 处理。

### `API-FDBR-002 POST /api/v1/local/open-url`

复用现有 operation；请求：

```json
{ "url": "<API-FDBR-001 返回的 supportUrl>" }
```

响应沿用现有 shape：

- `{ "ok": true }`：系统浏览器启动命令执行成功，只能展示“反馈渠道已打开”；
- `{ "ok": false, "desktop": false }`：当前不是桌面运行时；
- HTTP `400/500` + `{ "error": "..." }`：参数或打开失败。

任何响应都不允许映射成“反馈已发送/已提交”。

### `API-FDBR-003 POST /api/v1/local/reveal-logs`

复用现有 operation；无 request body。响应沿用现有 shape：

- `{ "ok": true, "dir": "..." }`：目录已打开；UI 不展示 `dir`，避免路径进入反馈文本；
- `{ "ok": false, "desktop": false }`：当前不是桌面运行时；
- HTTP `500` + `{ "error": "..." }`：日志目录不可用或打开失败。

### `PURE-FDBR-001 buildIssueFeedbackText`

输入：

```ts
interface IssueFeedbackInput {
  description: string;       // trim 后按 Unicode code point 计数，10..4000
  appVersion: string | null; // 复用 getAppVersion()；不可用时显示“未知”
  buildId?: string | null;   // 仅在运行时真实提供时展示，不伪造
  os: string;                // 浏览器只读 platform/userAgent 信息的短文本
  route: string;             // 当前 pathname，经 sanitizeFeedbackRoute
  occurredAt: Date;          // 用户打开弹窗/刷新摘要时的本机时钟
  correlationId?: string;    // 当前界面真实已有的 requestId/taskId；没有就省略
}
```

输出固定顺序：

```text
问题描述：<已遮蔽常见密钥、Cookie、Bearer token 的用户输入>
应用版本：<appVersion>[ · build <buildId>]
系统：<OS>
页面：<脱敏 route>
时间：<ISO 8601>
关联编号：<真实存在时才有本行>
```

`sanitizeFeedbackRoute` 必须：

- 移除 query 与 hash；
- 把 UUID、长纯数字 ID，以及 `/projects|assets|knowledge|topics|intelligence/<id>` 的下一段替换为 `:id`；
- 解析失败返回 `/unknown`；
- 不输出文件系统路径。

`redactSensitiveText` 是防误贴的纵深保护，至少遮蔽：

- `Authorization: Bearer ...` / `Bearer ...`；
- `Cookie: ...`；
- `api_key`、`apiKey`、`activationCode`、`licenseKey` 后的值；
- `sk-...` 形式的常见密钥。

遮蔽后的文本直接展示在预览区，复制内容与预览必须逐字一致。CreatorOS 不自动采集聊天内容、
模型正文或文件路径；用户主动写入描述的普通业务内容由用户在可编辑输入和预览中确认，应用不对
所有自然语言作“必然不含聊天内容”的不可兑现判断。

## 4. Component state and interaction

`IssueFeedbackDialog` 使用三个独立状态轴，避免复制、渠道打开和日志打开互相覆盖：

| 状态轴/状态 | 进入条件 | UI |
|---|---|---|
| copy: `editing` | 弹窗打开或描述变化 | 可编辑、可选择预览文本 |
| copy: `copied` | Clipboard API 成功 | “反馈内容已复制，请在反馈渠道中粘贴提交” |
| copy: `copy_failed` | Clipboard API 缺失或拒绝 | “复制失败，请手动选择下方内容复制” |
| channel: `loading` | 弹窗打开后读取渠道 | 按钮禁用，显示“正在读取反馈渠道” |
| channel: `ready` | `API-FDBR-001` 返回 HTTPS URL | 可点击打开 |
| channel: `channel_opening` | 正在调用 `API-FDBR-002` | 按钮禁用，防重复打开 |
| channel: `channel_opened` | `API-FDBR-002` 返回 `{ok:true}` | “已请求打开反馈渠道，请在外部页面中粘贴并提交”；按钮恢复可点 |
| channel: `channel_missing` | `API-FDBR-001` 返回 null/读取或解析失败 | “当前没有可用的反馈渠道”，复制与日志按钮仍可用 |
| channel: `channel_open_failed` | `API-FDBR-002` 非 `{ok:true}` | 人话失败提示，可重试 |
| logs: `idle` | 未请求 | 可点击 |
| logs: `logs_opening` | 正在调用 `API-FDBR-003` | 日志按钮禁用，防重复点击 |
| logs: `logs_opened` | `API-FDBR-003` 返回 `{ok:true}` | “日志文件夹已打开”；按钮恢复可点 |
| logs: `logs_open_failed` | `API-FDBR-003` 非 `{ok:true}` | 人话失败提示，不影响其他动作 |

交互规则：

- 弹窗通过有名称的 `DialogTitle`、`DialogDescription` 提供可访问名称；
- 描述使用关联 `<label>`，错误信息使用 `role="alert"`；
- 描述 trim 后按 `Array.from(text).length` 少于 10 或多于 4000 字符时不得复制，显示明确长度错误；
- “打开反馈渠道”只有在 supportUrl 已读到时可触发；未配置时给出可见说明；
- “打开日志文件夹”只调用已有 route，不读取日志内容；
- Dialog 初始焦点落在问题描述；`Escape` 关闭后焦点回到触发按钮；状态提示使用
  `aria-live="polite"`，校验错误使用 `role="alert"`。
- 弹窗关闭会忽略尚未完成的渠道读取结果，且不产生反馈提交请求或后台任务。

## 5. Error schema

UI 只保留以下用户可行动语义，不透传底层英文堆栈：

| Operation | Condition | User message |
|---|---|---|
| `API-FDBR-001` | null/fetch/parse failed | 当前没有可用的反馈渠道；仍可复制内容 |
| Clipboard | API missing/rejected | 复制失败，请手动选择下方内容复制 |
| `API-FDBR-002` | web or non-2xx/`ok:false` | 未能打开反馈渠道，请重试或手动复制内容 |
| `API-FDBR-003` | web or non-2xx/`ok:false` | 未能打开日志文件夹；不影响复制反馈 |

## 6. Permissions and privacy

- 所有动作均由用户点击触发。
- `API-FDBR-001` 只读本机已验签缓存，不能写渠道配置。
- CreatorOS 不接收、存储或上传反馈文本。
- CreatorOS 不读取、解密或上传 `.enc` 日志。
- 应用只自动加入版本、系统、脱敏 route、时间和已存在关联编号；不自动采集 Cookie、API Key、
  激活码、模型请求正文、聊天内容、文件路径或日志正文。用户描述会经过常见 secret 遮蔽并由用户预览。
- 外部渠道的最终提交由用户在浏览器中确认，CreatorOS 不推断提交结果。
- 桌面打包态所有本地 API 继续受 `proxy.ts` 的 loopback Host/Origin 与启动级 handshake
  default-deny 保护；本任务不新增公开 API allowlist。

## 7. Compatibility rules

- Web 运行时仍可整理和复制反馈；打开系统浏览器/日志目录失败时如实提示。
- `supportUrl = null` 是合法的 unavailable 状态，不得回退到官方地址。
- 旧 `.channel-links` schema 与现有 `getChannelLink` 行为不变。
- 不修改 `/api/v1/local/open-url` 与 `/api/v1/local/reveal-logs` 的现有响应。
- 新入口不得改变主要导航顺序或页面 active 状态。

## 8. Examples

已配置渠道、复制成功：

```text
问题描述：点击同步收藏夹后提示读取失败。
应用版本：0.1.0
系统：macOS
页面：/intelligence
时间：2026-07-26T16:30:00.000Z
```

包含敏感串的输入：

```text
输入：Authorization: Bearer abc.def；api_key=sk-secret
预览：Authorization: Bearer [已隐藏]；api_key=[已隐藏]
```

## 9. 逐 FR 数据链路可行性

| FR | 来源类型 | 证据 | 存储 | 读回显路径 | 冷启动/历史窗口 | 判定 |
|---|---|---|---|---|---|---|
| `FR-FDBR-01` 侧边栏入口与弹窗 | 系统内生 | `Sidebar` 已有固定底部用户区，可插入真实 dialog trigger | 无 | Sidebar → Dialog | 首次打开即有 | feasible |
| `FR-FDBR-02` 整理、预览、复制安全文本 | 用户录入 + 系统内生 | textarea 录入；`getAppVersion()`、pathname、navigator、clock 本机生成 | 无 | Dialog 预览区 + Clipboard API | 无历史依赖 | feasible |
| `FR-FDBR-03` 打开签名配置的支持渠道 | 授权第三方 | `DEC-FDB-002` 已确认“真正提交发生在开发者已经配置的外部反馈渠道”；Activity 签名响应缓存 `supportUrl`，`getChannelLink("support")` 只返 HTTPS。白标渠道可指向其实际支持方，因此 UI 只称“反馈渠道”，不冒充 CreatorOS 开发者本人 | `.channel-links` 既有缓存 | GET support-channel → POST open-url | unavailable 合法显示 null | feasible |
| `FR-FDBR-04` 打开加密日志目录 | 系统内生 | 已有 `POST /api/v1/local/reveal-logs` | 既有 `.enc` 日志 | Dialog → reveal-logs → 文件管理器 | 日志不存在则诚实失败 | feasible |
| `FR-FDBR-05` 无假发送语义 | 系统内生 | UI 状态表只定义 copied/opened/failed | 无 | Dialog 状态消息 | 无历史依赖 | feasible |
| `FR-FDBR-06` 应用不自动采集敏感诊断内容 | 系统内生 | 自动字段白名单 + route 脱敏 + 常见 secret 遮蔽；用户描述由用户预览确认 | 无 | 预览文本即最终复制文本 | 无历史依赖 | feasible |

## 10. 现网事实 / 仓内已有实现

| 断言 | 证据 | 结论 |
|---|---|---|
| 已存在签名渠道缓存只读器 | `frontend/src/server/activation/channel-links.server.ts:91`；codegraph `getChannelLink` 唯一现有调用方为激活页 | 复用，不新建渠道配置 |
| 已存在安全外链打开 route | `frontend/src/app/api/v1/local/open-url/route.ts:25`，仅允许 HTTP(S) 且使用 `execFile` | 复用，不改协议 |
| 已存在日志目录打开 route | `frontend/src/app/api/v1/local/reveal-logs/route.ts:19` | 复用，不读日志 |
| 已存在桌面版本读取 | `frontend/src/lib/desktop-updater.ts:152` 的 `getAppVersion()` | client 直接复用 |
| 侧边栏底部已有稳定插槽 | `frontend/src/components/shell/sidebar.tsx:200` 的 `mt-auto` 用户区 | 新增入口但不改主导航 |
| 不存在 `support-channel` API | `rg "support-channel" frontend/src/app/api` 无命中 | 新增只读 route |

## 11. Verification contract

| ID | Gate evidence |
|---|---|
| `TEST-FDBR-001` | contract + support-channel route：有 URL/null/读取异常；client 拒绝畸形响应；请求/响应不含描述或其他渠道 |
| `TEST-FDBR-002` | pure helper：query/hash/动态 ID 脱敏、Unicode 长度、输出顺序、敏感哨兵不出现、关联编号按存在性输出 |
| `TEST-FDBR-003` | component：少于 10/超过 4000 字阻止复制；Clipboard 缺失/拒绝；成功时预览与剪贴板逐字一致，只显示“已复制” |
| `TEST-FDBR-004` | component：null/畸形/非桌面响应；渠道/日志成功后分别进入 `channel_opened`/`logs_opened` 并恢复按钮；失败均可见且不阻断复制；opening 期间重复点击锁 |
| `TEST-FDBR-005` | shell/a11y：展开/折叠入口名称、主导航顺序、初始焦点、Escape、焦点返回、状态播报 |
| `TEST-FDBR-006` | 零提交：关闭弹窗、复制、打开渠道和打开日志时，所有 CreatorOS 请求体均不含反馈正文，且不存在反馈提交 API 请求 |
| `TEST-FDBR-007` | 负向文案：整个弹窗不出现“开发者本人”“已发送”“已提交”；渠道成功也只显示“已请求打开反馈渠道” |

## 12. Decisions

- `DEC-FDB-002`：反馈描述只在浏览器内存和剪贴板中存在，CreatorOS 不建提交 API 或存储；
  UI 只称“反馈渠道”，真实支持方由签名渠道配置决定。
- 用户确认②：2026-07-26 用户在已确认范围重置后明确说“开始执行吧”。这句话是要求现在实现
  Replacement 范围，不只是允许继续写 PLAN；本 CONTRACT 只是把该范围转成可测试边界，没有新增
  页面、服务或数据决策，因此记录为对同一范围的 BUILD 授权。独立契约审查真正 PASS 前仍保持 draft。
