// 经实际调用链审计的19个宿主短读取工具，不包含联网搜索或浏览器执行。
export const CHAT_READ_TOOL_NAMES = Object.freeze([
  "creatoros.guide", "context.projects", "context.projects.search", "context.comments",
  "context.knowledge", "context.materials", "context.project.detail", "context.project.lifecycle",
  "context.review.report", "context.positioning.detail", "context.knowledge.detail", "context.artifacts",
  "context.artifact.text", "context.knowledge.text", "context.publications", "context.metrics",
  "context.learnings", "context.candidates", "context.predictions",
] as const);
export const isChatReadToolName=(name:string):name is typeof CHAT_READ_TOOL_NAMES[number]=>CHAT_READ_TOOL_NAMES.some(item=>item===name);
