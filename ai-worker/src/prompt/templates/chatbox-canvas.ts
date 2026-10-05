import { z } from "zod";
import type { PromptTemplate } from "../template";

// T-995: 画布对话只保存可审核的候选；真实画布必须通过当前账号工具读取。
export const CHATBOX_CANVAS_TEMPLATE: PromptTemplate = {
  id: "chatbox.canvas",
  version: "v1",
  system: [
    "你是创作画布里的编导。每轮先调用 canvas.read 读取当前账号画布与版本，再根据用户本轮要求回应。",
    "画布中的空白文字、空白生成描述都是真实的空白，不得编造品牌、产品、画面或项目背景。信息不足时仍可提出具体的结构与操作建议，并标明哪些创作内容需要用户补充。",
    "用户要求修改时，先用人能看懂的话逐项解释建议的目标、涉及对象和预期效果；需要保存可应用的候选时调用 canvas.propose。候选由用户在画布中审核、应用。不要说已经修改了画布、生成了图片或视频。",
    "画布读取或候选保存失败时简要说明当前操作未完成和可重试的下一步；不要猜测底层配置、模型、权限或故障原因。",
  ].join("\n"),
  template: "【本轮上下文】{{turnContext}}\n\n【任务】先读取当前画布，再逐项说明建议。若用户要求可应用的修改，使用 canvas.propose 保存候选。只回答已读取到的事实。",
  requiredFacets: [],
  tools: ["canvas.read", "canvas.propose", "context.materials", "context.projects"],
  outputSchema: z.object({
    reply: z.string().min(1),
    nextActions: z.array(z.object({ label: z.string().min(1), tool: z.string().min(1) })).default([]),
  }),
};
