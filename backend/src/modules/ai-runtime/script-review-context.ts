import type {RequestContext} from "@creatoros/contract";
import {lintScript,DEFAULT_OFFICIAL_RULES} from "@creatoros/ai-worker";

export interface ScriptSource {
  /** 返回项目「脚本」stage 当前版本的 { artifactId, version, text };无脚本 → null。 */
  getLatestScript(
    ctx: RequestContext,
    projectId: string,
  ): Promise<{ artifactId: string | null; version: number; text: string } | null>;
}

// L1 词表端口(review-gate service 满足:拉 active 规则)。
export interface LintRulesSource {
  listActiveLintRules(ctx: RequestContext): Promise<
    {
      id: string;
      tier: "official_hard" | "empirical" | "doudplus";
      category: string;
      matchType: "word" | "regex";
      pattern: string;
      replacement: string | null;
      note: string;
    }[]
  >;
}

export interface ScriptReviewPositioningReader {
  getPositioningCenter(ctx: RequestContext): Promise<unknown>;
}

// 将配置规则及说明交给语义审核；字面命中只说明出现了该字符串，不证明违规。
export function buildLexiconBlock(
  rules: {
    tier: string;
    category: string;
    pattern: string;
    replacement: string | null;
    note?: string;
  }[],
): string {
  if (rules.length === 0) {
    return "（创作者未配置违禁词表——按官方硬规则与语义判断)";
  }
  return rules
    .map(
      (r) =>
        `· [${r.tier}/${r.category}] ${r.pattern}${
          r.replacement ? ` → 建议:${r.replacement}` : ""
        }${r.note ? `；规则说明:${r.note}` : ""}`,
    )
    .join("\n");
}


/** 后端准备真实版本的审核输入；快照与提示词一起由执行权转交事务冻结。 */
export async function prepareScriptReviewContext(
  ctx:RequestContext,
  task:{projectId:string|null;inputData:Record<string,unknown>},
  deps:{scriptSource:ScriptSource;lintRules:LintRulesSource;positioning?:ScriptReviewPositioningReader},
):Promise<Record<string,string>>{
  const projectId=typeof task.inputData.projectId==="string" ? task.inputData.projectId : task.projectId;
  if(!projectId)throw new Error("script-review-runner: 缺 projectId");
  if(task.projectId && task.projectId!==projectId)throw new Error("审核项目与任务归属不一致");
  const script=await deps.scriptSource.getLatestScript(ctx,projectId);
  if(!script?.text.trim())throw new Error("script-review-runner: 项目暂无可审脚本");
  if(typeof task.inputData.artifactVersion==="number" && Number.isInteger(task.inputData.artifactVersion)){
    const expectedId=Object.prototype.hasOwnProperty.call(task.inputData,"artifactId")
      ? typeof task.inputData.artifactId==="string" ? task.inputData.artifactId : null : undefined;
    if(script.version!==task.inputData.artifactVersion || (expectedId!==undefined && script.artifactId!==expectedId)){
      throw new Error("稿件已更新，本次旧版本审核已停止，请重新发起审核。");
    }
  }
  const rules=await deps.lintRules.listActiveLintRules(ctx);
  // SEMANTIC_BOUNDARY_ALLOW: 已配置合规词表的确定性命中，不决定创作或替代模型语义审核。
  const lintFindings=lintScript(script.text,rules);
  let positioning="（未设置定位——按通用合规标准审核）";
  if(deps.positioning){
    try{
      const center=(await deps.positioning.getPositioningCenter(ctx) ?? {}) as Record<string,unknown>;
      const profile=(center.profile ?? center) as Record<string,unknown>;
      positioning=[profile.persona,profile.field,profile.audience].filter((value):value is string=>typeof value==="string" && Boolean(value.trim())).join(" · ") || positioning;
    }catch{/* 定位缺失不影响按通用标准审核当前真实脚本。 */}
  }
  return {
    script:script.text,lexicon:buildLexiconBlock(rules),officialRules:DEFAULT_OFFICIAL_RULES,positioning,
    lintFindings:lintFindings.length ? lintFindings.map(f=>`· [${f.tier}/${f.category}] 「${f.quote}」${f.replacement ? ` → 建议:${f.replacement}` : ""}`).join("\n") : "（L1 无命中）",
    __reviewSnapshot:JSON.stringify({projectId,artifactId:script.artifactId,artifactVersion:script.version,script:script.text,lintFindings}),
  };
}
