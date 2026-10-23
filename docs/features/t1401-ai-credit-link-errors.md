# T-1401 AI 额度连接错误透传

用户授权：2026-10-23，修复充值连接错误；仅本地提交，不推送、不合并，不读取正式数据、不输出密钥、不修改激活或授权校验。

## 范围与验收

- `createAiCreditPortalLink` 使用现有 `asAiCreditLinkError` 保留 `ClientConfigPullError` 的 code/message/retryable，保留取消语义。
- 未分类异常与真实网络故障仍映射 unavailable；Growth HTTP 5xx 仍可重试，拒绝访问不可重试。
- connect 使用现有日志错误码、响应文案和 retryable 契约；不扩展响应字段。
- 补服务与路由回归，先红后绿；运行相关 vitest 与超时策略守卫。
- 实测现有开发服务 POST 返回配置未启用与 retryable=false；删除临时 diag 路由。
- 不默认打开开发环境远程权益开关；充值成功需真实有效授权及 Growth 会话，错误提示修复不等同充值闭环通过。

## 边界

仅修改本 SPEC、BACKLOG、任务事件/验证记录、ai-credit-link.server.ts 与对应测试、connect/route.test.ts；删除 diag/route.ts。不修改许可、密钥、模型调用、打包或生产数据。

## 当场验证记录

- 2026-10-23 分支 `fix-ai-credit-link-2026-10-23`，基线 `0143614f`。
- RED：新增 requestAccess 分类测试在修复前 3 项失败，均被改为 `AI_CREDIT_LINK_UNAVAILABLE`；HTTP 回归最初缺响应头导致另 2 项失败，已修正 fixture，未改变生产响应校验。
- GREEN：相关服务与 connect 路由 2 文件 27 项通过，model-benefit 额外 22 项通过；路由测试使用真实错误映射，保留固定错误码审计与 no-store。
- 开发服务保持原进程与原环境：POST connect 实测 HTTP 403，`{"error":"权益配置同步尚未启用","retryable":false}`。
- `node tools/timeout-policy/verify.mjs` 全部通过；`git diff --check` 通过。
- 临时未跟踪 `diag/route.ts` 已删除，不进入提交。
- AUD-04：当前旧票据路径在 `requestFreshClientConfigAccess` 的开关检查即抛错，早于授权读取与模型凭据解密，不能归因为主密钥不匹配。源码 model-benefit 连接路径申请新证明与 link-session，不经模型缓存解密；未检查生产秘密或断言 AUD-04 在其他链路不存在。
- 不开启默认远程 Growth 开关：保持开发环境显式配置。当前明确阻塞是配置同步未启用，未实测真实授权下的 Growth 门户/充值闭环，不声称充值成功。
- `context-compile` 因 task binding 缺失拒绝生成，按 AGENTS 回退读取 T-715 及其任务契约；本任务范围在上文固定。
- `pmem sync` 成功；`reconcile --profile quick --read-only` 退出 1，22 errors / 17 warnings，均为范围外历史审核凭证、看板体积/状态欠债，数量与看板 T-1395 记录一致；本任务聚焦 Gate 已过，不冒充全局全绿。

## 提交阻塞

`git add` 与 `git commit` 当场均退出 128：无法创建 `.git/index.lock`（Operation not permitted）。当前环境明确将 `.git` 标为只读，未绕过权限、未提交、未推送；T-1401 经 taskctl 标为阻塞，剩余工作为在具备正常仓库写权限的终端运行本地提交。
