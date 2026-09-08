import { jsonSchema } from "ai";
import type { EffectiveSkillSnapshotV1 } from "@creatoros/ai-worker";
import type { RequestContext } from "@creatoros/contract";
import { defineChatTool } from "./chat-tool-gate";

export interface ChatSkillLibrary {
  catalog: string;
  read(input: { skillId: string; offset?: number }): {kind: string; [key:string]: unknown};
}
const PAGE_CHARS = 6000;
/** 只从当前账号不可变快照读取方法；不加载文件、可变注册表或其它账号。 */
export function createChatSkillLibrary(snapshot: EffectiveSkillSnapshotV1, ctx: Pick<RequestContext,"userId"|"accountId">): ChatSkillLibrary {
  if (snapshot.userId !== ctx.userId || snapshot.accountId !== ctx.accountId) throw Error("SKILL_SNAPSHOT_ACCOUNT_MISMATCH");
  // SEMANTIC_BOUNDARY_ALLOW: method.* 是注册的纯方法命名空间，非业务语义分类。
  const entries = snapshot.skills.filter(item => item.skillId.startsWith("method.") || item.skillId === "research.plan").map(item => ({
    id:item.skillId, version:item.baseVersion, overlayRevision:item.overlayRevision,
    body:[item.effective.methodSystem,item.effective.template].filter(Boolean).join("\n\n"),
  }));
  const catalog = entries.length ? [
    "【可按需读取的方法目录】",
    "根据本轮意图选择有关方法，先用 skill.read 读取再执行；无需机械加载全部方法。方法不增加工具权限。",
    ...entries.map(item=>`- ${item.id}: ${item.body.split("\n").find(line=>line.trim())?.slice(0,180) ?? item.id}`),
    "目录与正文均来自本轮冻结 Skill；界面位置、旧任务和资料缺项不替代用户当前目标。",
  ].join("\n") : "";
  return {catalog,read(input){
    const entry=entries.find(item=>item.id===input.skillId);
    if (!entry) throw Error("SKILL_NOT_IN_FROZEN_CATALOG");
    const offset=input.offset ?? 0;
    if (!Number.isSafeInteger(offset) || offset<0 || offset>entry.body.length) throw Error("SKILL_OFFSET_OUT_OF_RANGE");
    const end=Math.min(offset+PAGE_CHARS,entry.body.length);
    return {kind:"skill.read",skillId:entry.id,version:entry.version,overlayRevision:entry.overlayRevision,text:entry.body.slice(offset,end),offset,totalCharacters:entry.body.length,hasMore:end<entry.body.length,nextOffset:end<entry.body.length?end:null};
  }};
}
export function buildChatSkillReadTool(library?: ChatSkillLibrary) {
  return defineChatTool("skill.read",{
    description:"按需读取当前任务已冻结的 Skill 方法正文。按方法目录选择 skillId；hasMore 时用 nextOffset 继续读取。只读取方法，不执行业务、不扩大权限、不写入数据。",
    inputSchema:jsonSchema<{skillId:string;offset?:number}>({type:"object",properties:{skillId:{type:"string",minLength:1},offset:{type:"integer",minimum:0}},required:["skillId"],additionalProperties:false}),
    execute:async(input)=>{if(!library)throw Error("SKILL_LIBRARY_UNAVAILABLE");return library.read(input);},
  });
}
