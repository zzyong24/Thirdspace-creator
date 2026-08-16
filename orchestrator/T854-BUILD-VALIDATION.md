# T-854 按确认稿需要生成多张图片 / 默认一条视频验证

## 范围

- 修订“生成图片素材”预填：先读整篇当前确认稿，由 AI 根据稿件篇幅、段落结构和实际画面需要选择多个不重复段落，每段各生成一张候选。
- 修订“生成视频素材”预填：先读当前确认稿，默认只生成一个连续短镜头候选；只有用户明确要求时才增加。
- 图片数量没有写死；语义选择继续由 AI 完成，代码只提供真实当前稿、段落引用、类型和成本边界。
- 保持点击只预填、不自动发送；本次未调用付费生图或生视频接口。

## 红绿证据

- 红测：先把组件测试改为要求图片话术包含“根据稿件篇幅 / 选择多个 / 每个段落各生成一张”且不再包含“唯一服务段落”，并要求视频包含“默认只生成一个 / 控制生成成本 / 除非我明确要求”。首次执行 10 项中 1 项失败，收到的仍是旧话术“选择唯一服务段落，再生成一张”，证明测试真实锁住本次回归。
- 绿测：`pnpm --dir frontend exec vitest run src/features/copilot/ai-copilot-content.test.tsx`，10/10 通过。
- 真实页面旅程：`CREATOROS_TEST_PORT=3436 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/semantic-material-generation.spec.ts --project=e2e`，1/1 通过。隔离数据中创建三段当前确认稿，在 1536×1024 与 1024×768 两档窗口点击图片/视频入口，确认图片多段话术、视频单条默认和消息数不变。

## 静态与边界检查

- `pnpm --dir frontend exec tsc --noEmit`：通过。
- 变更文件 ESLint：0 error；保留 `ai-copilot-content.tsx` 两条既有 Hook dependency warning，本任务未扩大。
- `node orchestrator/process/boundary-scan.mjs`：无新增物理边界违规；剩余 5 条均在既有基线内。
- `node orchestrator/process/semantic-boundary-scan.mjs`：通过；没有用固定词表、字符串相似度或业务分支冒充语义选段。
- `git diff --check`：通过。

## 运行边界

- 本轮验证的是快捷指令与真实页面交互，没有发送请求，因此不会产生模型费用。
- 页面旅程日志仍出现既有稿件版本本地时区 hydration warning，以及开发态 `@ai-sdk/anthropic` external warning；两者均未阻断本旅程，也不由本任务修改或伪装为已修复。
