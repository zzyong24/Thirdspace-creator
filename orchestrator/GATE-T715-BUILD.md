# GATE-T715-BUILD — AI 额度用户端入口真实联调

> 日期：2026-08-07
> 结论：**CreatorOS 消费端代码与真实生产跳转通过；Growth 生产兑换根因已修复并部署，等待使用全新的
> 一次性会话完成 `/app/ai-credits` 真机回执，T-715 暂保持待验。**

## CreatorOS 已验证

- 设置页只显示中性入口“查看 AI 额度与消耗”，不显示 OmniHi、中转站、serviceId、provider、
  Base URL、服务官网或受管 Key。
- 点击入口后，CreatorOS 使用当前激活权益申请全新 config access ticket，并由 server-only route
  创建一次性额度会话；敏感票据和激活码不进入 query、页面 DTO 或用户文案。
- 受管 AI 额度耗尽必须被识别为“AI 额度不足”，Copilot 提供同一个安全用户端充值入口；不得显示
  模型故障、供应商或中转实现信息。用户自配模型的余额错误不误导到 Growth。
- 真实桌面包已打开 Growth 生产用户端 `/credits/launch#<one-time-code>`；Growth 页面启动后立即移除
  fragment，没有进入管理员端、渠道端或端选择页面。
- 聚焦回归：新增受管额度分类、异步任务安全文案、Copilot 充值入口及安全跳转测试；本轮
  ai-worker 26 个、backend 3 个、frontend 144 个测试 PASS，三端 typecheck PASS。此前设置页、
  脱敏投影、额度 session server、local connect route 的 5 个文件、100 个测试仍保持 PASS。

## Growth 生产修复与剩余验收

- Growth 用户端此前在兑换一次性门户会话时显示“当前操作无法继续”。
- 脱敏错误参考号：`cor_7a4fdb7104884cc8bb6d46da662244d4`。
- 2026-08-07 使用当前渠道激活权益重新创建独立 portal session 后仍在 Growth 兑换阶段失败；
  新脱敏参考号：`cor_c7c8f2a29f0e452a82f01f9eb4daf741`。两次独立参考号证明不是复用旧页面或
  CreatorOS 未打开链接，而是当时生产 Growth 对一次性会话的兑换未闭环。
- 根因已定位：Growth 的全局写请求中间件错误要求匿名一次性兑换请求携带 `Idempotency-Key`，导致
  `/api/ai-credit-portal-sessions/exchange` 在进入业务逻辑前返回 422；该匿名兑换协议本身不应由客户端
  携带该请求头。
- Growth 修复提交 `056564d45674ec1bb09e6fb814d446faa0f58308` 已部署生产，schema 已到 0053；
  公网 `/health/live`、`/health/process-ready`、`/credits/launch` 与 `/app/ai-credits` 均返回 200。
- 上述旧页面的一次性码有效期只有 60 秒且不可重放，不能用于部署后复验。剩余唯一验收是从 CreatorOS
  设置重新点击“查看 AI 额度与消耗”，生成全新一次性会话并真实落到 `/app/ai-credits`。

## 不得冒充的证据

- fixture、单测、聊天确认和“已打开 `/credits/launch`”都不是额度到账回执。
- T-715 只有在真实链路完成
  `Activity ticket → Growth portal session → exchange → /app/ai-credits → 手动刷新总消耗`
  后才能完成。
- Activity 未修改。Growth 修复由已授权的 Growth 委派任务发布；CreatorOS 仓库不持有 Growth 密钥。

## Qwen ASR 当前边界

T-679 / T-715 已按
`/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-135-qwen-asr-direct-client.md` 实现兼容读取、
稳定幂等、单次内存 lease、精确直连和安全测试。Growth API-282 已稳定；但真实 Activity ticket →
双 service bundle → lease → 直连转写 → 总额度减少 25,000 的跨仓回执仍待验证，不把聚焦测试写成
真实 E2E PASS。
