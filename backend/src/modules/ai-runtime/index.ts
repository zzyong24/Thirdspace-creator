// AI runtime module (T-163) —— 前端 AI SDK 解耦:26 个 runner + AI 编排基底(creative-context /
// llm 适配 / multimodal 解析 / skill 覆盖)从 frontend 包下沉至此,使 AI 生成逻辑 + prompt 调用
// 住在受保护的 backend 侧(桌面化 T-147 护城河前置)。前端只经 `@creatoros/backend/modules/
// ai-runtime` 这一 barrel 取 runner + 端口类型,不再 import `@/server/ai/*`。
//
// 边界(design-spec §3.1/§3.4):本模块 import `@creatoros/ai-worker`(模板 REGISTRY +
// runStructuredNode),故**独立于** `modules/ai`(那个持久化模块的不变量禁 import ai-worker)。
// chat 流式(chat-runner/chat-tools/chat-context)与 web search(search/)不在此 —— 前者走
// §3.2 流式端点(Batch 3),后者属前端 browser 设施经端口注入。

export * from "./agent-run";
export * from "./asset-classify-runner";
export * from "./asset-generate-runner";
export * from "./calibration-diagnose-runner";
export * from "./calibration-score-runner";
// [T-163 Batch 3] chat 流式(runChatStream + tools + context 装配)—— streamText/tool/jsonSchema
// (Vercel AI SDK)在此;前端只留 /api/chat 薄代理 + useChat UI。
export * from "./chat-context";
export * from "./chat-runner";
export * from "./chat-tools";
export * from "./comment-qa-sift-runner";
export * from "./copilot-runner";
export * from "./creative-context";
export * from "./knowledge-classify-runner";
export * from "./knowledge-distill-runner";
export * from "./knowledge-relate-runner";
export * from "./llm/anthropic-adapter";
export * from "./llm/parse";
export * from "./llm/provider";
export * from "./llm/resolve";
export * from "./material-extract-runner";
export * from "./material-match-runner";
export * from "./multimodal/resolve";
export * from "./planning-contract-runner";
export * from "./planning-outline-runner";
export * from "./planning-runner";
export * from "./platform-adapt-runner";
export * from "./positioning-runner";
export * from "./reconstruct-runner";
export * from "./research-runner";
export * from "./review-runner";
export * from "./scheduled-collection-runner";
export * from "./scheduled-collection-scheduler";
export * from "./script-review-runner";
export * from "./script-runner";
export * from "./skill-config-overrides";
export * from "./topic-enrich-runner";
export * from "./topic-runner";
export * from "./topic-task-adapter";
export * from "./transcribe-runner";
