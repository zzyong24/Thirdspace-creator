import { generateText } from "ai";
import { modelFor } from "./provider-factory";

import type { MultimodalSpec } from "./multimodal-factory";

// [T-055h asset.classify] 视觉理解(看图说话)—— OpenAI 兼容 chat vision 通道。
// 与生图/生视频(provider 专有 REST)不同,VLM 打标签走标准 chat completions +
// image part,SiliconFlow(Qwen-VL 系)/OpenAI/MiniMax 均兼容;provider 不锁死。

export async function describeImageOpenAICompatible(
  spec: MultimodalSpec,
  input: { bytes: Uint8Array; mimeType: string; prompt: string },
): Promise<string> {
  const res = await generateText({
    model: modelFor({apiFormat:"openai_chat",baseUrl:spec.baseUrl??"https://api.siliconflow.cn/v1",token:spec.token,model:spec.model}),
    messages: [
      {
        role: "user",
        content: [
          { type: "image", image: input.bytes, mediaType: input.mimeType },
          { type: "text", text: input.prompt },
        ],
      },
    ],
  });
  return res.text;
}
