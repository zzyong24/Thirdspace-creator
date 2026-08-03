# T-673 本地文件读取续跑与防重试风暴验收

## 结论

本地文件读取成功后的工具结果现在会携带原始消息上下文，能够准确挂回原 `toolCallId`。同时，
同一个授权 ID 在单个 Copilot 会话实例中最多自动续跑一次：若上游流再次损坏，会停在可见错误态，
不会继续形成请求和日志风暴。

```text
用户允许读取文件
      ↓
原工具调用 + 授权结果一起交给服务端续跑
      ↓
文件内容挂回原 toolCallId → Copilot 继续回答
      ↓
极端情况下流仍损坏 → 同一授权只自动尝试一次并停止
```

## 故障证据

- 运行日志重复出现 `AI_UIMessageStreamError: No tool invocation found for tool call ID`。
- `local.read` 本身已经成功，失败点位于 HITL 授权后的 UI message stream 组装。
- 实现前红测：route 传给 `toUIMessageStreamResponse` 的 `originalMessages` 为 `undefined`；熔断
  模块尚不存在。

## 修复证据

- 代码提交：`71fe0cb5`。
- `cd frontend && pnpm exec vitest run src/app/api/chat/route.test.ts src/features/copilot/tool-approval-resume-guard.test.ts src/features/copilot/ai-copilot-interactions.test.tsx`
  通过：3 个测试文件、71 个测试。
- `cd frontend && pnpm typecheck` 通过。
- `cd frontend && pnpm lint` 通过。
- `node orchestrator/process/boundary-scan.mjs` 通过：剩余 5 条等于既有基线，无新增违规。
- `node orchestrator/process/orphan-scan.mjs` 通过：0 error。

## 边界

本任务不改变 `local.read` 的安全授权、敏感文件拒读、1MB 上限或大文件分窗协议；只修复授权后
工具结果组装丢失和同一授权无限自动重发。真实桌面体验仍以用户使用原文件复验为最终确认。

全局 `reconcile` 未全绿，原因均为本任务范围外既有欠债：T-656/T-645/T-642/T-635 评审回执
过期、T-653 审核值不合法、T-668/T-663 并行改动使前端回执失效，以及 manifest 日期漂移。
