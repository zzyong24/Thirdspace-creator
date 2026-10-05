import { buildChatTools, type ChatToolDeps } from "./chat-tools";
import { prepareChatToolDefinitions } from "./chat-tool-definitions";
import { chatWorkerInputSchema } from "@creatoros/contract/execution-worker";
import type { z } from "zod";
import {isDeepStrictEqual} from "node:util";
import {jsonSchema} from "ai";
import {prepareChatToolParameters} from "./chat-tool-parameters";

/** SEMANTIC_BOUNDARY_ALLOW: 完整不可变定义登记仅核已存在的协议版本，不判断创作内容或按业务名选择路径。 */
function immutable<T>(value:T):Readonly<T>{if(value!==null&&typeof value==='object'){for(const item of Object.values(value))immutable(item);Object.freeze(value);}return value;}
// 来源c5316506原冻结definition；保留原生产properties顺序，旧输入不能借当前版本增加reference字段。
const historicalDefinitions=immutable([
 chatWorkerInputSchema.shape.tools.element.parse({
  "name": "material.generate",
  "version": "chat-tools-atomic-material-v1:c8455afe13b92b5ddf4dc8a5604dbc5d2bc4a68a5c668d5a2775f1a7d3d744bc",
  "description": "用 AI 生成图片或视频素材(文生图/文生视频)。项目内容配图必须先用 context.artifact.text 读当前确认稿，判断它要替哪一句内容完成什么认知任务，从 sections 中选择服务的唯一 sectionRef，并说明 visualPurpose；执行端会重读当前版本，把该段正文和版本指纹冻结进任务。生成的是 AI 图/视频素材(非真实拍摄/截图)，用户采纳后才进素材中心。事实证据优先真实截图/网页，价格表、架构图、流程图等要求精确文字/数字/节点的信息卡必须把 mediaKind 设为 information_card，本工具会拒绝自由生成；真实公告/仓库截图设为 fact_capture，同样不生成。只有 illustration 适合本工具。图片 prompt 要把一个认知任务落实为一个可见关系，写清主体、动作或关系、环境、构图、光色和画幅；视频 prompt 只写一个连续短镜头，依次交代主体、主要动作、环境、构图与景深、一个平滑运镜、光色材质和平稳结尾，可带克制同步环境音但禁止音乐与人声。默认不要文字、数字、logo、水印、假产品界面、假新闻截图、畸形肢体、重复主体、突变、闪烁或跳帧，禁止万能 AI 海报。创作者定位只影响视觉语言与审美语气，不得改变当前稿主张。要生成封面改用 cover.generate。",
  "effect": "committed",
  "parameters": {
    "type": "object",
    "properties": {
      "kind": {
        "type": "string",
        "enum": [
          "image",
          "video"
        ],
        "description": "生成图(image)还是视频(video)。视频异步分钟级,提交后后台跑,不阻塞对话。"
      },
      "prompt": {
        "type": "string",
        "description": "生成描述。图片必须写清视觉媒介、主体、动作或关系、环境、构图、光线/色彩、画幅和排除项。视频必须只设计一个连续短镜头，按主体、主要动作、环境、构图与景深、单一路径运镜、光线/色彩/材质、平稳收尾的顺序描述；可有克制的同步环境音，不要音乐和人声。默认不出现文字、数字、logo、水印或伪造界面。生成的是 AI 素材、非真实拍摄。"
      },
      "style": {
        "type": "string",
        "description": "可选风格/画风(如「扁平插画」「写实摄影」「赛博朋克」),会拼进生成 prompt。"
      },
      "sectionRef": {
        "type": "string",
        "description": "项目内容配图所服务的当前稿段落引用。先调 context.artifact.text，再逐字使用 sections[].sectionRef；不要让用户提供。"
      },
      "visualPurpose": {
        "type": "string",
        "enum": [
          "evidence",
          "mechanism",
          "comparison",
          "consequence",
          "emotion",
          "analogy"
        ],
        "description": "画面承担的单一认知任务。"
      },
      "mediaKind": {
        "type": "string",
        "enum": [
          "illustration",
          "information_card",
          "fact_capture"
        ],
        "description": "illustration=可自由生成的配图；information_card=要求精确文字/数字/节点的信息卡；fact_capture=真实网页/公告/仓库事实截图。后两类不得走自由文生图。"
      }
    },
    "required": [
      "kind",
      "prompt"
    ],
    "additionalProperties": false
  },
  "execution": "host.task-submit"
})
]);

/** 原生产解析顺序是旧调用摘要的一部分；恢复时先核对完整定义，不能由 JSONB 键序重建。 */
export async function resolveSubmittedChatToolParameters(frozen:z.infer<typeof chatWorkerInputSchema>["tools"][number]) {
 const tools=buildChatTools([frozen.name],{} as ChatToolDeps);
 const prepared=await prepareChatToolDefinitions(tools,{
  workerScriptDraft:frozen.execution==="worker.script-draft",
  atomicCoverGenerate:true,atomicAgenticResearch:true,atomicPlanningThesis:true,
  atomicMaterialGenerate:true,atomicScriptReview:true,atomicPublishPackage:true,
 });
 const actual=prepared.definitions[0];
 if(actual&&isDeepStrictEqual(actual,frozen))return prepared.parameters[frozen.name]!;
 const historical=historicalDefinitions.find(definition=>isDeepStrictEqual(definition,frozen));
 if(!historical)throw new Error("提交工具定义版本不兼容");
 return prepareChatToolParameters(jsonSchema(historical.parameters));
}
