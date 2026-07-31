# T-642 BUILD Gate

日期：2026-07-31  
结论：PASS（本任务范围）；未构建安装包。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-642",
  "contract_path": "docs/superpowers/specs/2026-07-31-copilot-project-reference-direct-read.md",
  "contract_sha": "f55ecd5277a9",
  "commit_sha": "bfb9eac9e9db546a1486ccd0e38032307258ebce",
  "observed_at": "2026-07-31T15:56:42.000Z",
  "run": {
    "verify_key": "copilot-project-reference:e2e",
    "command": "CREATOROS_TEST_PORT=3430 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/copilot-project-reference.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "Playwright e2e：1 passed；隔离 PGlite 真建账号和长标题项目，1536×1024 与 1024×768 均验证"
  },
  "environment": {
    "surface": "desktop-web",
    "runtime": "Google Chrome stable / Playwright 1.60",
    "viewports": [
      {"width": 1536, "height": 1024, "result": "pass"},
      {"width": 1024, "height": 768, "result": "pass"}
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      {"id": "t642-project-reference", "role": "isolated-pglite-project-reference"}
    ]
  },
  "levels": {
    "logic": {"status": "pass", "evidence_ref": "backend 286 tests：绑定 ID 覆盖省略 ID、伪造 ID、账号级无绑定与工具集合收窄"},
    "surface": {"status": "pass", "evidence_ref": "E2E 两档窗口均显示项目标签、完整 tooltip 且无横向溢出"},
    "journey": {"status": "pass", "evidence_ref": "真建项目 → 输入 @关键词 → 选择 → 标签出现 → 输入正文不重复长标题"},
    "experience": {"status": "not-requested", "evidence_ref": "等待用户在最终统一本地包进行主观体验确认"}
  },
  "checks": [
    {"id": "AC-COPILOT-REF-LABEL", "test_id": "E2E-COPILOT-REF-01", "result": "pass", "evidence_ref": "长标题项目显示为项目上下文标签，完整标题保留在 title"},
    {"id": "AC-COPILOT-REF-NO-DUP", "test_id": "E2E-COPILOT-REF-01", "result": "pass", "evidence_ref": "选中后 textarea 只剩帮我看看，不包含 @query 或完整标题"},
    {"id": "AC-COPILOT-REF-NARROW", "test_id": "E2E-COPILOT-REF-01", "result": "pass", "evidence_ref": "1024×768 标签可见且 document 无横向溢出"},
    {"id": "AC-COPILOT-REF-DIRECT", "test_id": "UNIT-COPILOT-REF-02", "result": "pass", "evidence_ref": "chat-runner/chat-tools 单测证明绑定项目不暴露 context.projects，详情/产物/正文/指标使用绑定 ID"}
  ],
  "coverage": [
    {"condition": "long-title", "result": "pass", "evidence_ref": "真实长标题项目在常规窗口完成 @ 选择并保持单行裁剪", "reason": ""},
    {"condition": "narrow", "result": "pass", "evidence_ref": "1024×768 真浏览器无横向溢出", "reason": ""},
    {"condition": "bound-id", "result": "pass", "evidence_ref": "绑定 ID 省略/伪造入参均只读 host 绑定项目", "reason": ""},
    {"condition": "unbound-account", "result": "pass", "evidence_ref": "无绑定项目时 context.projects 与显式 projectId 原契约保留", "reason": ""}
  ],
  "visible_copy": {
    "artifact_path": "orchestrator/evidence/T-642-visible-copy.json",
    "artifact_sha256": "9f241a6132b814805cd82a80c3913bdae7f42335946cf6a632ddb12fd0b5af00"
  },
  "tdd_red_ref": "改动前测试会看到 textarea 写入完整 @标题、绑定项目工具集仍含 context.projects、单项目工具省略 ID 返回 found:false；新测试分别锁住三处回归",
  "open_defects": [],
  "status": "pass"
}
```

## 已实现

- `@query` 选中后不再把完整项目标题写进消息正文；上下文标签显示“项目 · 标题”，完整标题保留。
- `chatContext.projectId` 作为 host 可信绑定，单项目档案、产物索引、产物正文与指标工具可省略 ID。
- 绑定项目时模型工具集合不再包含 `context.projects`，因此无法退回全量项目库翻页找当前作品。
- 模型显式传入其他项目 ID 时，单项目工具仍只读取 host 绑定 ID。
- 账号级无引用时，项目库列表与显式 ID 查询保持原行为。

## 验证证据

- backend：`chat-tools.test.ts` + `chat-runner.test.ts`，286 tests PASS。
- frontend：`project-mention.test.ts` + `ai-copilot-interactions.test.tsx`，46 tests PASS。
- frontend Playwright：`copilot-project-reference.spec.ts`，真实 Chrome 双视口 1 test PASS。
- backend/frontend `tsc --noEmit` PASS。
- `boundary-scan` PASS：无新增物理边界违规，剩余 5 条等于既有基线。
- `git diff --check` PASS。
- `project-mention.ts` 与对应测试目标 ESLint PASS。

## 已知全局状态

`reconcile` 已执行。本任务相关 artifact、orphan、boundary、backlog 与知识检查均通过；全局仍因
T-635 review receipt 及 T-639/T-638/T-637/T-634 frontend receipt 在当前整合分支上过期而失败。
这些是本任务开始前已存在的跨任务回执债务，不属于 T-642 验收范围，本 Gate 不把它们写成全绿。

`ai-copilot-content.tsx` 全文件 ESLint 仍命中既有 React Compiler/hooks 债务（ref render 访问、
effect setState、manual memoization 等）；本任务未改这些生命周期逻辑，聚焦行为测试和 typecheck 已通过。
