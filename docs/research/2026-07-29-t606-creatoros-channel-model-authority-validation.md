# T-606 CreatorOS 渠道模型配置权威验证报告

> 验证日期：2026-07-29
>
> 分支：`codex/t606-managed-model-authority`
>
> 发布结论：`NO-GO`。`T-610` 已完成独立审查 1 Blocker + 5 Major 的代码整改与本地复验；
> 仍须独立复审和三端同环境联调，只允许推送私有代码分支，不允许发布桌面安装包或下载站。

## 1. 契约与评审

- CreatorOS 消费契约：
  `docs/superpowers/specs/2026-07-29-creatoros-channel-model-authority.contract.md`
- 上游 Growth 契约摘要：
  - `T-086-creatoros-managed-model-service.md`：
    `be1d4546b080e8b30144e31dd20d2e094d82b66d3c57d0f6116782fb89650182`
  - `T-086-review-concern-resolution.md`：
    `68bd438f9893a7c4508cff396274e893cb630d7ad488109e6b91430f18cdbc0f`
- 早期评审 receipt：`bc38a5b47eac`；其后独立代码审查给出 `NO-GO`
  （1 Blocker + 5 Major），因此该早期 receipt 不再代表当前发布许可。
- `T-610` 代码整改：6 项已销账；尚未取得整改后的独立复审 receipt。

## 2. 实现范围

- 继续复用激活身份和 `config.pull` ticket，不允许客户端覆盖 `projectKey/channelRef`。
  Creator 不再向 Activity 自报 `clientId` 作为授权依据；兼容旧 ticket 响应时旧
  `clientId` 仅忽略不信任。Creator 只声明接受的 extension/protocol，Growth 从自身
  registry 决定最终 `clientId` 并签入 bundle；Creator 验签时继续强校验
  `creatoros.desktop`、extension 和 protocol。
- verified `200 + JSON object` 立即采用渠道模型配置，并在独立加密 namespace 原子保存。
- 明确未配置、网络不可达、安全校验失败分别回到本地模型；历史渠道密文保留但不激活。
- verified `304` 仅在 identity、revision、digest、keyId 与本机保存记录一致时重新激活。
- 删除旧三键 parser、24 小时远端 LKG 优先、Gateway、短 bearer、`managed_locked`
  等 T-604 路径。
- 文本、专用文本、agentic、图像、视频、视觉、ASR、embedding、联网搜索和设置页测试入口
  统一经过渠道权威选择；渠道配置错误时不重试本地模型。
- 设置页仅显示脱敏的渠道/本地状态，本地配置始终可编辑并作为备用。
- 本地 refresh API 仅输出 `authority/outcome/action/retryable`，不输出 payload 或密钥材料。

## 3. T-610 六项整改

1. 版本和 ETag 只在 `projectKey + channelRef + clientId` 完全相同的 locator 内比较；
   身份切换保留旧密文为 inactive，覆盖 A42→B1、跨 locator 同版本、不可达和切回 A。
2. Activity/Growth 的 DNS、TLS、timeout 和全部 5xx（含未知 code/body）统一归类
   `local/unreachable`；撤权和坏签名继续归类 `security_error`。
3. 渠道 `apiFormat` 缺失、未知或错类型在任何本地读取、SDK 创建或网络调用前失败；
   text、embedding、agentic 均无 OpenAI 猜测分支。
4. 渠道 provider/model 对 settings test、消息用量和任务/运行时投影统一为
   `channel-managed`。
5. settings/chat/Pi 的错误日志与输出只保留 category、status、correlationId；
   不记录 model、base URL、响应正文或 raw Error。
6. 加密存储只有 `ENOENT` 表示无记录；prefix、AES-GCM tag、wrong key、schema 和结构损坏
   均抛 typed `security_error`，并把损坏文件重命名到 `.corrupt.*`。

## 4. 自动化验证

| 验证项 | 命令/范围 | 结果 |
| --- | --- | --- |
| 后端类型检查 | `pnpm --dir backend typecheck` | PASS |
| 前端类型检查 | `pnpm --dir frontend typecheck` | PASS |
| 后端定向测试 | `llm/resolve.test.ts`、`multimodal/resolve.test.ts` | PASS，2 files / 31 tests |
| 前端定向测试 | client-config、route、search resolver、settings page | PASS，4 files / 50 tests |
| 设置连接入口反例 | `settings-model-test-wrap.test.ts` | PASS，1 file / 24 tests |
| AI provider factory 反例 | `provider-factory.test.ts` | PASS，1 file / 11 tests |
| Pi agentic 反例 | `pi-engine.test.ts` | PASS，1 file / 17 tests |
| 指定反例总计 | 上述 31 + 50 + 24 + 11 + 17 | PASS，133 tests |
| Chat API 脱敏快照 | `app/api/chat/route.test.ts` | PASS，1 file / 35 tests |
| 前端目标 lint | T-606 变更文件 | PASS，0 errors |
| 前端生产构建 | `pnpm --dir frontend build` | PASS；保留 24 条既有 Turbopack warning |
| 浏览器验收 | `CREATOROS_DEV_MODE=1 pnpm --dir frontend exec playwright test --project=e2e tests/e2e/settings.spec.ts --grep '\[T-606\]'` | PASS，1536×1024 与 390×844 |
| 后端全量测试 | `pnpm --dir backend test` | PASS，216 files / 2561 tests；另 2 files / 4 tests skipped |
| AI worker 全量测试 | `pnpm --dir ai-worker test` | PASS，38 files / 292 tests |
| 前端全量测试 | `pnpm --dir frontend test` | 270 files PASS、1 file 既有 FAIL；2671 tests PASS、1 FAIL、1 TODO |

前端全量唯一失败为既有
`src/features/automations/automations-edit.test.tsx`：
测试仍查找已经退役的 `data-template-id="daily-detail"`，节点为 `null`。该失败在 T-606
独立重跑时可稳定复现，与本次渠道模型配置改动无文件或调用链交集，因此不在本任务内改写。

## 5. 安全检查

- 渠道 payload 只进入 server-only 内存和加密文件。
- API、RSC、设置页状态、日志、错误和请求 URL 不输出 payload、ticket、激活身份、digest、
  签名材料或真实密钥。
- 测试仅使用程序生成的无效占位值，不包含生产或联调真实密钥。
- 错误 Key、URL、provider 或 model 在调用阶段诚实失败，不会读取或调用本地模型兜底。
- 变更文件秘密扫描未发现生产凭据；唯一命中为测试里的无效
  `Bearer header.payload.signature` fixture。

## 6. 剩余发布卡点

- 尚无正式 Growth 渠道配置和生产模型密钥。
- 尚无 Growth、Activity、CreatorOS 三仓同一环境的端到端联调证据。
- 尚无 `T-610` 整改后的独立复审 receipt。
- 尚无桌面签名、安装包验收、下载站发布及用户发布许可。
- `boundary-scan` 通过：剩余 5 条均为既有 baseline，本次新增 0。
- `reconcile` 的变更日期、前端验收和边界门通过；`T-610` 架构纠偏主动使 T-606 旧 review
  receipt 失效，必须重录独立复审。全局另有两个既有治理红项：
  - T-575 历史链中的 `API-575-002/TEST-575-06` 被 orphan parser 判为非 canonical；
  - T-595 的 SPEC 变更后尚未重录 review receipt。
- `backlog-health` 仍报告项目级历史 ledger 过长，为 warning，不是 T-606 新增错误。

因此本报告只证明 CreatorOS 消费端代码和本地浏览器旅程达到 T-606 契约，不证明三端生产上线。
