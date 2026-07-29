# T-538 Creator BUILD Gate Evidence

## 结论

- 状态：`implemented / local verified / production E2E blocked`。
- CreatorOS 已提供受信本地提交入口 `POST /api/v1/local/product-feedback`，并把问题摘要、
  显式提交、失败保留与重试接入现有问题反馈弹窗。
- 浏览器侧只提交去敏后的问题内容和非敏感客户端元数据；激活码、机器标识、渠道、优先级、
  AM token 与签名材料均只在本地 trusted sidecar 内处理。
- 本结论不代表 AM `API-AM-013`、Growth `API-170` 已部署，也不代表三系统生产闭环已验收。

## 实现边界

### Web UI

- `frontend/src/components/shell/issue-feedback-dialog.tsx`
  - 增加摘要与显式“提交问题”动作。
  - 编辑时生成新的幂等键；失败重试沿用同一个幂等键。
  - 仅 `202` 且响应满足 closed schema 时展示 `publicRef`。
  - 失败保留输入并允许重试；原 T-518 复制、打开反馈渠道、打开日志能力继续保留。
- `contract/src/local-platform.ts`
  - 定义 closed local request/success/failure schema。
  - 文本统一 `CRLF/CR -> LF`，拒绝未允许控制字符、双向控制字符和敏感额外字段。

### Trusted sidecar

- `frontend/src/server/feedback/product-feedback.server.ts`
  - 从现有加密 `.license` 解密结果中读取 `activationCode/projectKey/channelRef/machineId`，
    不把这些值返回浏览器。
  - 固定调用 AM `/api/license/feedback-context`，验证响应大小、digest、Ed25519 签名、
    nonce、签发时间与过期时间。
  - 从已签名 `bugFeedbackUrl` 只取 origin，并要求与
    `CREATOROS_FEEDBACK_OFFICIAL_ORIGINS` 精确匹配。
  - 固定调用 Growth `/api/v2/product-feedback`；AM/Growth 请求均使用
    `redirect: "manual"`、HTTPS、超时和响应大小上限。
  - `feedbackContextToken` 仅驻留服务端内存。
  - 签名 `bugFeedbackUrl` 缺失、非 HTTPS、带 userinfo/port 或 origin 不在发布 allowlist
    时，在调用 AM/Growth 前 fail-closed；确定性回归断言 `fetch=0`。
- `frontend/src/app/api/v1/local/product-feedback/route.ts`
  - 复用现有 loopback/handshake/CSRF 信任边界。
  - 对浏览器只返回 `publicRef/status/binding` 或稳定错误码、消息与 `retryable`。

### Release configuration

- `.github/workflows/desktop-release.yml`
  - 发布前强制校验 `CREATOROS_FEEDBACK_OFFICIAL_ORIGINS`。
  - 每项必须是纯 HTTPS origin，不允许 userinfo、port、path、query 或 fragment。
- `frontend/src-tauri/src/lib.rs`
  - 把编译期/运行期 allowlist 与现有 AM 公钥注入 sidecar。
  - 缺少配置时 fail closed。
- `.env.example`、`docs/RELEASING.md`
  - 记录正式环境变量和发布前置条件。

## Shared contract evidence

- Growth canonical fixture 与 Creator 固定副本逐字一致：
  `docs/contracts/fixtures/channel-bound-feedback-v1.vector.json`。
- 文件 SHA-256：
  `1102c0e1c172938ed63f877a033bb169ab7b396575fa2e84547f30bcf0c24fab`。
- `cmp -s` 对 Growth 源文件返回 `0`。
- Creator 消费契约：
  `docs/contracts/creator-channel-bound-product-feedback-v1.md`。

## TDD 与验证

### RED

- 首次运行
  `pnpm --dir contract test -- product-feedback-local.test.ts`
  时新增 2 个用例失败，原因是 local product feedback schemas 尚未实现；原有 137 个用例通过。

### GREEN

| 验证 | 结果 |
| --- | --- |
| `pnpm --dir contract test -- product-feedback-local.test.ts` | 26 files，139 passed |
| `pnpm --dir frontend test -- ...`（完整套件） | 259 files passed；2515 passed，1 todo |
| Creator T-538 focused Vitest（6 files） | 28 passed |
| `pnpm --dir contract typecheck` | pass |
| `pnpm --dir frontend typecheck` | pass |
| `cargo check --lib` | pass；仅既有 `decoy_gate.rs` dead-code warning |
| `cargo test --lib` | 131 passed |
| `pnpm --dir frontend build` | pass；产物包含 `/api/v1/local/product-feedback` |
| `git diff --check` | pass |

focused Vitest 覆盖：

- trusted sidecar 上下文交换、签名验证、allowlist 与无重定向；
- local route 信任边界和 closed response；
- UI `202/publicRef`、失败保留输入、幂等重试；
- `.license` 服务端解密绑定且不向外泄露；
- Growth/Creator 共享 fixture digest。
- 签名 `bugFeedbackUrl` 的 null、HTTP、userinfo、port 和非 allowlist 负向矩阵，全部零出网。

## 上线阻断项

以下项目完成前不得把 Creator T-538 标记为 production-ready：

1. AM 正式部署 `API-AM-013`，提供可验证的正式响应签名并与 Creator 内置公钥一致。
2. Growth 正式部署 `API-170`，确认正式 HTTPS origin。
3. 发布环境配置 `CREATOROS_FEEDBACK_OFFICIAL_ORIGINS`，并通过 release workflow 校验。
4. 用真实激活码完成 Creator → AM → Growth 三系统 E2E，验证渠道绑定、渠道优先级、
   幂等、`publicRef`、停用渠道售后保留与新购续费关闭规则。
5. 完成独立安全/发布复核以及用户授权的 push、desktop package 和 production deploy。

## 变更控制

- 未修改 Growth canonical。
- 未执行 commit、push、PR 或 deploy。
- 工作树含 T-534/T-535 等既有并行变更；本证据只覆盖上述 T-538 文件与行为。
