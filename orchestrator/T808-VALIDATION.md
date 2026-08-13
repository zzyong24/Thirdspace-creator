# T-808 验证报告

## 验收范围

- `script.draft` 单次模型调用上限为 150 秒。
- 其它结构化节点默认上限仍为 90 秒，既有 `video.scenes` / `video.cards` 仍为 120 秒。
- 自定义 OpenAI Chat 兼容端点默认不发送原生 `json_schema`；第一次请求直接走文本 JSON，并继续由同一 output schema 校验。
- 只有配置 `settings.structuredOutputs=true` 的自定义端点才启用原生结构化输出。
- 运行日志区分 `text_compat`（主动兼容）与 `text_fallback`（运行后降级）。

## TDD 证据

红测命令：

```bash
pnpm --dir ai-worker exec vitest run src/nodes/structured-node.test.ts src/nodes/script-node.test.ts src/runtime/provider-factory.test.ts
```

实现前观察到预期失败：

- `script.draft` 实际向 `AbortSignal.timeout` 传入 `90000`，不是 `150000`。
- 声明兼容模式后首次请求仍携带 JSON schema response format。
- 模型工厂尚未提供端点结构化能力标记。

实现后同一命令：3 个测试文件、55 项测试全部通过。

## 回归证据

```bash
pnpm --dir ai-worker test
pnpm --dir ai-worker typecheck
pnpm --dir backend exec vitest run src/modules/ai-runtime/script-runner.test.ts src/modules/ai-runtime/video-decisions-runner.test.ts
pnpm --dir backend typecheck
pnpm --dir frontend typecheck
node orchestrator/process/boundary-scan.mjs
node orchestrator/process/semantic-boundary-scan.mjs
```

结果：

- ai-worker：48 个测试文件、361 项测试通过；类型检查通过。
- backend 受影响回归：2 个测试文件、82 项测试通过；类型检查通过。
- frontend 类型检查通过。
- 物理边界无新增违规（仍为既有基线 5 条）。
- 语义职责边界检查通过。

## 验证边界

本任务不调用真实付费模型、不改提示词、不重打发布包。真实用户安装包仍需后续发布任务携带本提交后才能获得该行为。
