# T-789 BUILD Gate — 自配模型长结构任务与浏览器搜索稳定性

- 日期：2026-08-12
- 任务：T-789
- Gate：TDD + 类型检查 + 外部错误分类回归
- 结论：PASS（代码与自动回归）；真实用户端点和双搜索引擎仍需下一个桌面包环境复验

## 修复范围

1. shared structured runner 新增有上下界的节点超时；默认仍是 90 秒，仅分场/信息卡放宽到 120 秒。
2. 只对明确的结构化响应协议不兼容进入“文本 JSON + 同 schema 验收”；鉴权、网络、限流和超时仍失败。
3. SERP 导航以 `domcontentloaded` 为就绪条件；百度明确登录墙在当前桌面运行期有界冷却，优先用真实 Bing 结果。
4. 不改用户模型配置、渠道配置或 schema；不生成伪 URL，不用模型记忆冒充联网证据。

## RED 证据

- `structured-node.test.ts`：协议不兼容错误直接抛出；兼容错误分类与节点超时 resolver 不存在，3 项失败。
- 后续用例锁定分场/信息卡必须显式传入 120 秒；搜索导航必须不再使用 `networkidle`；同一运行期的已确认登录墙必须跳过且冷却后恢复真实重试。

## GREEN 证据

```text
ai-worker structured-node: 1 file / 19 tests PASS
backend video-decisions-runner: 1 file / 68 tests PASS
frontend browser search: 2 files / 19 tests PASS
ai-worker / backend / frontend typecheck: PASS
git diff --check: PASS
```

- `boundary-scan`：0 新增违规（既有基线 5）；`semantic-boundary-scan`：PASS。
- `orphan-scan`：0 error / 100 条历史 warning；`test-integrity`：0 error / 1 条 coverage 配置 warning。
- 前端相关文件 ESLint：0 error；`persistence-client.ts` 有 1 条与本次无关的存量未使用参数 warning。
- `pmem sync`：PASS。`reconcile`中 LED-023 guard holds；项目总结果仍是 7 errors / 8 warnings，
  来自本任务开始前已存在的 BACKLOG runaway、T-770/T-765/T-746 旧评审凭证过期、
  T-727/T-722 旧前端凭证失效以及 LED-018 桌面浏览器交付规则复发；不属于 T-789 验收范围，
  本任务不修改旧凭证或历史看板来伪造全局全绿。

## 诚实边界

自动测试证明了超时传递、错误分类、schema 不绕过、导航条件和登录墙冷却状态；当前环境
没有用用户的真实自配模型连续跑完一次分场+信息卡，也不把公网搜索引擎的短期可用性写成永久保证。
下一个 Windows 桌面包应复验一次用户端点长任务与连续两次搜索，再补 SHIP 真机回执。
