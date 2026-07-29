# T-606 CreatorOS 渠道模型配置权威验证报告

> 验证日期：2026-07-29
>
> 分支：`codex/t606-managed-model-authority`
>
> 发布结论：代码验证通过；仅允许推送私有代码分支，不允许发布桌面安装包或下载站。

## 1. 契约与评审

- CreatorOS 消费契约：
  `docs/superpowers/specs/2026-07-29-creatoros-channel-model-authority.contract.md`
- 上游 Growth 契约摘要：
  - `T-086-creatoros-managed-model-service.md`：
    `be1d4546b080e8b30144e31dd20d2e094d82b66d3c57d0f6116782fb89650182`
  - `T-086-review-concern-resolution.md`：
    `68bd438f9893a7c4508cff396274e893cb630d7ad488109e6b91430f18cdbc0f`
- 独立评审：`PASS`
- 评审 receipt：`bc38a5b47eac`
- 未销账问题：0

## 2. 实现范围

- 继续复用激活身份和 `config.pull` ticket，不允许客户端覆盖
  `projectKey/channelRef/clientId`。
- verified `200 + JSON object` 立即采用渠道模型配置，并在独立加密 namespace 原子保存。
- 明确未配置、网络不可达、安全校验失败分别回到本地模型；历史渠道密文保留但不激活。
- verified `304` 仅在 identity、revision、digest、keyId 与本机保存记录一致时重新激活。
- 删除旧三键 parser、24 小时远端 LKG 优先、Gateway、短 bearer、`managed_locked`
  等 T-604 路径。
- 文本、专用文本、agentic、图像、视频、视觉、ASR、embedding、联网搜索和设置页测试入口
  统一经过渠道权威选择；渠道配置错误时不重试本地模型。
- 设置页仅显示脱敏的渠道/本地状态，本地配置始终可编辑并作为备用。
- 本地 refresh API 仅输出 `authority/outcome/action/retryable`，不输出 payload 或密钥材料。

## 3. 自动化验证

| 验证项 | 命令/范围 | 结果 |
| --- | --- | --- |
| 后端类型检查 | `pnpm --dir backend typecheck` | PASS |
| 前端类型检查 | `pnpm --dir frontend typecheck` | PASS |
| 后端定向测试 | `llm/resolve.test.ts`、`multimodal/resolve.test.ts` | PASS，2 files / 31 tests |
| 前端定向测试 | client-config、route、search resolver、settings page | PASS，4 files / 50 tests |
| 前端目标 lint | T-606 变更文件 | PASS，0 errors |
| 前端生产构建 | `pnpm --dir frontend build` | PASS；保留 28 条既有 Turbopack warning |
| 浏览器验收 | `CREATOROS_DEV_MODE=1 pnpm --dir frontend exec playwright test --project=e2e tests/e2e/settings.spec.ts --grep '\[T-606\]'` | PASS，1536×1024 与 390×844 |
| 后端全量测试 | 全量后再隔离重跑两个超时文件 | 214 files PASS；首次机器争用导致 2 个 5s timeout，隔离重跑 2 files / 19 tests PASS |
| 前端全量测试 | 全量 Vitest | 270 files PASS、1 file FAIL；2670 tests PASS、1 FAIL、1 TODO |

前端全量唯一失败为既有
`src/features/automations/automations-edit.test.tsx`：
测试仍查找已经退役的 `data-template-id="daily-detail"`，节点为 `null`。该失败在 T-606
独立重跑时可稳定复现，与本次渠道模型配置改动无文件或调用链交集，因此不在本任务内改写。

## 4. 安全检查

- 渠道 payload 只进入 server-only 内存和加密文件。
- API、RSC、设置页状态、日志、错误和请求 URL 不输出 payload、ticket、激活身份、digest、
  签名材料或真实密钥。
- 测试仅使用程序生成的无效占位值，不包含生产或联调真实密钥。
- 错误 Key、URL、provider 或 model 在调用阶段诚实失败，不会读取或调用本地模型兜底。

## 5. 剩余发布卡点

- 尚无正式 Growth 渠道配置和生产模型密钥。
- 尚无 Growth、Activity、CreatorOS 三仓同一环境的端到端联调证据。
- 尚无桌面签名、安装包验收、下载站发布及用户发布许可。
- `boundary-scan` 通过：剩余 5 条均为既有 baseline，本次新增 0。
- `reconcile` 的 T-606 评审、变更日期、前端验收和边界门均通过；全局仍有两个既有治理红项：
  - T-575 历史链中的 `API-575-002/TEST-575-06` 被 orphan parser 判为非 canonical；
  - T-595 的 SPEC 变更后尚未重录 review receipt。
- `backlog-health` 仍报告项目级历史 ledger 过长，为 warning，不是 T-606 新增错误。

因此本报告只证明 CreatorOS 消费端代码和本地浏览器旅程达到 T-606 契约，不证明三端生产上线。
