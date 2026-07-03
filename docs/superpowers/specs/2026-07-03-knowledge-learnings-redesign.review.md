# spec-review: 2026-07-03-knowledge-learnings-redesign

- **review_mode**: cross-family(MiniMax via mmx CLI;第一轮 system 含执行契约段被模型误读,裁剪为角色段后重跑成功)
- **verdict**: PASS
- **summary**: SPEC 完整覆盖宪法断点(飞轮后半圈/真喂出题/倾倒场/假数据清理),继承 T-060/T-059 裁决,契约改动最小化且可执行,端到端验收标准具体可测。发现的 3 处 minor 均为实现细节缺省,不妨碍落地。

## findings 与处置

### F1 [minor/completeness] §2.2 契约增量 - learnings.patch 端点定义

- **issue**: 规范仅引用「repo/service/transport 按模块化惯例」,未给出 request/response 的 Zod schema 示例或字段级定义。虽符合最小化原则,但另一 agent 若无仓内 prior knowledge 可能需反向追溯惯例。
- **suggestion**: 在 §2.2 补充一行 schema 概要:body `{ title?: string; insight?: string; learningType?: LearningType }` → response `{ id, title, insight, learningType, validationStatus, updatedAt }`,并注明与 `learnings.create` 的 schema 差异仅在字段可选性。
- **处置**: 接受 —— 已内联进 SPEC(标记 [gate-F1])。

### F2 [minor/completeness] §4 KnowledgeDumpZone - knowledge.classify 失败行为

- **issue**: 规范写「失败诚实报错,不静默兜底」,但未说明报错 UI 形态(Toast/内联错误/重试按钮)及失败后内容是否保留供用户手动纠正。
- **suggestion**: 在 §4 补充一句:「分类失败时展示内联错误提示,原始输入保留在输入框供用户修改重试或手动填写 type/title。」
- **处置**: 接受 —— 已内联进 SPEC(标记 [gate-F2])。

### F3 [minor/approach] §3 KNOW-X修真 - creative-context 注入改动范围

- **issue**: 规范描述「runTopicTask 与 runScriptNode prompt 模板加 facets」,但未明确说明改动范围是新增一个 template section 还是在现有 section 尾部追加。若模板有版本管理,是否需要新建 template variant 或直接覆盖。
- **suggestion**: 在 §3 补充:「在现有 prompt template 的『context/constraints』段尾追加两行,格式:「--- 知识库参考 --- + knowledgeBrief 内容」及「--- 已验证经验约束 --- + learningsBrief 内容」。模板走现有 ai-worker 覆盖机制,无需新建 variant。」
- **处置**: 接受 —— 已内联进 SPEC(标记 [gate-F3])。

## 裁决

verdict=PASS(0 blocker / 0 major / 3 minor),3 条 minor 全部接受并内联。**可开工 T-062a~d。**

原始 reviewer 输出 JSON:

(reviewer 原始 JSON 输出存档于会话 scratchpad t062_review.json;verdict/findings 已全文誊录如上。)
