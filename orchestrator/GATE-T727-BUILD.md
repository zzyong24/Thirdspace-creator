# T-727 BUILD Gate：完整稿件语义分界与逐字保真导入

日期：2026-08-08
状态：实现、独立规格复审、聚焦回归与 MiniMax 本机真实界面旅程通过。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-727",
  "contract_path": "orchestrator/T727-FRONTEND-JOURNEY.md",
  "contract_sha": "98f3de51ac70",
  "commit_sha": "ce2c308b5619a140951dd87a0090348e5f08d601",
  "observed_at": "2026-08-09T04:39:02.000Z",
  "run": {
    "verify_key": "verbatim-script-import:test",
    "command": "pnpm --dir frontend exec vitest run src/features/copilot/chat-script-draft-card.test.tsx src/server/script-draft-task-input.test.ts",
    "exit_code": 0,
    "output_ref": "Vitest：保真候选卡与任务输入共 17/17 通过"
  },
  "environment": {
    "surface": "desktop-web",
    "runtime": "CreatorOS 本机 Next.js 运行态 / 隔离临时 PGlite / Codex 内置浏览器 / MiniMax 文本模型",
    "viewports": [
      { "width": 1100, "height": 908, "result": "pass" },
      { "width": 1024, "height": 720, "result": "pass" }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      { "id": "mixed-message", "role": "47 字对助手说明与 771 字完整逐字稿位于同一条用户消息" },
      { "id": "persisted-manuscript", "role": "采纳并刷新后仍为 771 字的当前口播稿" },
      { "id": "unadopted-repeat", "role": "第二个同原文候选保持待采纳且不改变当前稿面" }
    ]
  },
  "levels": {
    "logic": { "status": "pass", "evidence_ref": "Backend 369/369；Frontend 58/58；前端 typecheck 通过" },
    "surface": { "status": "pass", "evidence_ref": "两档视口均显示原文保真候选、771 字符、未调用写稿模型与采纳按钮" },
    "journey": { "status": "pass", "evidence_ref": "混合消息只接收不自动建候选；明确授权后由 MiniMax 分界；采纳、刷新与未采纳重复候选完成" },
    "experience": { "status": "pass", "evidence_ref": "47 字助手说明未混入稿面；完整正文首句未丢；浏览器控制台 0 error" }
  },
  "checks": [
    { "id": "AC-VERBATIM-SEMANTIC-BOUNDARY", "test_id": "E2E-T727-01", "result": "pass", "evidence_ref": "仅粘贴混合消息时不自动建候选；明确授权后 MiniMax 选择从‘我们的这个编导智能体’开始的正文，47 字说明被排除" },
    { "id": "AC-VERBATIM-EXACT-PERSISTENCE", "test_id": "E2E-T727-02", "result": "pass", "evidence_ref": "采纳并刷新后正文长度 771，SHA-256 为 38c473d329dd8335edb17d2d4d62ede9dc24630a6b17902db44c868a0171c23e，与受信正文逐字符一致" },
    { "id": "AC-VERBATIM-UNADOPTED-NO-MUTATION", "test_id": "E2E-T727-03", "result": "pass", "evidence_ref": "再次生成同一 771 字候选但不采纳；当前稿面仍为原 771 字及同一 SHA-256" },
    { "id": "AC-VERBATIM-RESPONSIVE-COPY", "test_id": "E2E-T727-04", "result": "pass", "evidence_ref": "1100×908 与 1024×720 均可见保真说明、真实预览与采纳按钮" }
  ],
  "coverage": [
    { "condition": "real-minimax-semantic-selection", "result": "pass", "evidence_ref": "项目配置 MiniMax 完成授权与混合消息语义边界选择", "reason": "" },
    { "condition": "mixed-assistant-preamble-and-complete-manuscript", "result": "pass", "evidence_ref": "同一条 818 字消息中排除前 47 字助手说明，保留后 771 字完整稿件", "reason": "" },
    { "condition": "explicit-user-authorization", "result": "pass", "evidence_ref": "首次发送只询问处理方式；第二轮明确要求一字不改后才创建候选", "reason": "" },
    { "condition": "exact-hash-after-adopt-and-refresh", "result": "pass", "evidence_ref": "刷新后长度与 SHA-256 均和正文来源一致", "reason": "" },
    { "condition": "repeated-unadopted-candidate", "result": "pass", "evidence_ref": "第二候选待采纳，当前稿面正文和 hash 不变", "reason": "" },
    { "condition": "normal-and-minimum-viewports", "result": "pass", "evidence_ref": "常规与最小支持视口真实浏览器检查通过", "reason": "" }
  ],
  "visible_copy": {
    "artifact_path": "orchestrator/evidence/T-727-visible-copy.json",
    "artifact_sha256": "c0976f1cf91f24d7feaca6adfb8d189b72d9c12ec486511777482429703bec01"
  },
  "tdd_red_ref": "新增用例先暴露旧链路会把完整原稿压进 extraBrief 并调用写稿模型；实现受信来源、MiniMax 语义门、精确锚点恢复与确定性候选后转绿。",
  "open_defects": [],
  "status": "pass"
}
```

## 验收结论

- MiniMax 只负责判断本轮是否已有写入授权、以及混合消息中的稿件正文边界。
- 服务端只对受信来源做精确切片、字符数与 SHA-256 校验；保真模式不调用写稿模型。
- 所有结果仍先成为候选，只有用户点击采纳才追加稿面版本；未采纳候选不改数据。
- 本次只使用隔离临时数据库，未修改或删除真实用户项目、稿件和素材，也未打包。
