import type {RequestContext} from "@creatoros/contract";
import {requireWorkspace} from "../../workspace-scope";

/** 仅把真实workspace身份映射到稳定默认实体ID；不授予账号或组权限。 */
export function defaultRubricIdentity(ctx:Pick<RequestContext,"groupId"|"accountId">){
 requireWorkspace(ctx);
 const sourceAccountId=ctx.groupId?.startsWith("grp_legacy_")?ctx.groupId.slice("grp_legacy_".length):ctx.groupId?null:ctx.accountId!;
 if(sourceAccountId)return {rubricId:`rubric-canonical:${sourceAccountId}`,versionId:`rubricver-canonical-1:${sourceAccountId}`,sourceAccountId};
 return {rubricId:`rubric-group-default:${ctx.groupId}`,versionId:`rubricver-group-default-1:${ctx.groupId}`,sourceAccountId:null};
}

export const DEFAULT_RUBRIC_DIMENSIONS = [
      {
        key: "hook",
        label: "钩子强度",
        weight: 0.2,
        description:
          "前3秒能否逼观众看下去 30 秒。0=通用开场「大家好今天聊聊」；3=反直觉断言/具体承诺；5=无法停止处理的具体场景或断言",
      },
      {
        key: "emotion",
        label: "情感共鸣",
        weight: 0.2,
        description:
          "前30秒能否触发具体、可命名的情感。0=纯信息无钩子；3=一般共鸣「我也有过」；5=锐利到观众不愿承认的自我识别「这就是我」",
      },
      {
        key: "product_path",
        label: "为产品铺路",
        weight: 0.2,
        description:
          "内容能否支撑信任/转化、为产品铺路（不只追播放）。0=纯流量噱头；3=隐约关联产品价值；5=自然把观众引向信任与下一步转化",
      },
      {
        key: "social",
        label: "社会共振",
        weight: 0.15,
        description:
          "是否触及当下有争议/结构性的社会模式。0=纯个人；3=公认社会现象无新视角；5=命名一个观众认识但没有语言形容的结构性模式",
      },
      {
        key: "cta",
        label: "CTA 清晰度",
        weight: 0.15,
        description:
          "行动召唤是否清晰且不突兀。0=无 CTA；3=结尾生硬喊一句；5=CTA 与内容价值自然衔接、观众想点",
      },
      {
        key: "quotable",
        label: "金句密度",
        weight: 0.1,
        description:
          "有几句能被截图、离开视频独立传播。0=全叙述无金句；3=结尾一句；5=多句分布开场/中间/结尾、能在评论与转发里独立存活",
      },
  ];
export const DEFAULT_RUBRIC_NAME="变现加权评分标准";
export const DEFAULT_RUBRIC_CHANGE_SUMMARY="v2 借鉴 cheat-on-content 的已校准 rubric：合并传播驱动（钩子/情感/社会/金句）与变现维度（为产品铺路/CTA），每维带 0/3/5 锚点";
