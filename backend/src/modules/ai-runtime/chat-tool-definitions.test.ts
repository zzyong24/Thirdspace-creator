import { describe, expect, it } from "vitest";
import { jsonSchema, tool } from "ai";
import { CHAT_TOOL_EFFECTS, prepareChatToolDefinitions } from "./chat-tool-definitions";
import { ALL_CHAT_TOOL_NAMES } from "./chat-tools";
import { defineChatTool } from "./chat-tool-gate";
const schema = { type: "object", properties: { q: { type: "string" } }, additionalProperties: false } as const;
const make = (name: string, input = schema, description = "测试") => defineChatTool(name, { description, inputSchema: jsonSchema(input), execute: () => ({ kind: name }) });

describe("真实聊天工具定义", () => {
  it("副作用覆盖所有正式工具，未知名称没有默认值", () => {
    expect(Object.keys(CHAT_TOOL_EFFECTS).sort()).toEqual([...ALL_CHAT_TOOL_NAMES].sort());
    expect(CHAT_TOOL_EFFECTS["local.read"]).toBe("committed");
    expect(CHAT_TOOL_EFFECTS["web.read"]).toBe("committed");
    expect(CHAT_TOOL_EFFECTS["context.positioning.detail"]).toBe("none");
    expect(CHAT_TOOL_EFFECTS["video.edit.render"]).toBe("proposal");
  });
  it("声明严格来自实际白名单，并共用真实schema及参数校验", async () => {
    const prepared = await prepareChatToolDefinitions({ "context.projects": make("context.projects"), "script.draft": make("script.draft") });
    expect(prepared.definitions.map(d => [d.name, d.effect])).toEqual([["context.projects", "none"], ["script.draft", "committed"]]);
    expect(prepared.definitions[0]!.parameters).toEqual(schema);
    expect(prepared.parameters["context.projects"]!.parameters.safeParse({ q: 42 }).success).toBe(false);
    expect(prepared.parameters["context.projects"]!.parameters.safeParse({ q: "真实输入" }).success).toBe(true);
  });
  it("定义版本稳定且随参数或描述变动，防止上下文参数变体共用错误版本", async () => {
    const version = async (built = make("script.patch")) => (await prepareChatToolDefinitions({ "script.patch": built })).definitions[0]!.version;
    expect(await version()).toBe(await version());
    const changed = defineChatTool("script.patch", { description: "测试", inputSchema: jsonSchema({ ...schema, required: ["q"] }), execute: () => ({ kind: "script.patch" }) });
    expect(await version(changed)).not.toBe(await version());
    expect(await version(make("script.patch", schema, "变更描述"))).not.toBe(await version());
  });
  it("未登记名称或无原始执行入口时准备失败，不能伪装可执行", async () => {
    const external = tool({ description: "外部", inputSchema: jsonSchema(schema) });
    await expect(prepareChatToolDefinitions({ "unknown.tool": external })).rejects.toThrow();
    await expect(prepareChatToolDefinitions({ "context.projects": external })).rejects.toThrow();
    await expect(prepareChatToolDefinitions({ constructor: external })).rejects.toThrow();
    await expect(prepareChatToolDefinitions({ "context.projects": make("script.draft") })).rejects.toThrow();
  });
  it("公开schema可变副本不改变宿主参数校验", async () => {
    const prepared = await prepareChatToolDefinitions({ "context.projects": make("context.projects") });
    prepared.definitions[0]!.parameters.additionalProperties = true;
    expect(prepared.parameters["context.projects"]!.parameters.safeParse({ extra: true }).success).toBe(false);
  });
});

it("Worker 开场版本独立，未启用时原定义不变，其它工具不改执行位置",async()=>{
 const tools={"script.hooks":make("script.hooks"),"context.projects":make("context.projects")};
 const legacy=await prepareChatToolDefinitions(tools),worker=await prepareChatToolDefinitions(tools,{workerScriptHooks:true});
 expect(legacy.definitions[0]).not.toHaveProperty("execution");
 expect((await prepareChatToolDefinitions(tools,{workerScriptHooks:false})).definitions).toEqual(legacy.definitions);
 expect(worker.definitions[0]).toMatchObject({execution:"worker.script-hooks",parameters:legacy.definitions[0]!.parameters,description:legacy.definitions[0]!.description,effect:"proposal"});
 expect(worker.definitions[0]!.version).not.toBe(legacy.definitions[0]!.version);
 expect(worker.definitions[1]).toEqual(legacy.definitions[1]);
});

it('T1070四个精确工具native参数效应与实现revision严格冻结',async()=>{
 const {buildChatTools}=await import('./chat-tools');const names=['work.editor.read','work.editor.propose','work.creation.read','work.creation.propose'];const prepared=await prepareChatToolDefinitions(buildChatTools(names,{humanizeError:()=>null} as any));
 expect(prepared.definitions.map(d=>[d.name,d.effect])).toEqual([['work.editor.read','none'],['work.editor.propose','proposal'],['work.creation.read','none'],['work.creation.propose','proposal']]);for(const d of prepared.definitions){expect(d.version).toMatch(/^chat-tools-work-director-v1:/);expect(d.execution).toBeUndefined();expect(d.parameters.type).toBe('object');}
 expect(prepared.parameters['work.editor.read']!.parameters.safeParse({view:'field_window'}).success).toBe(false);expect(prepared.parameters['work.editor.propose']!.parameters.safeParse({candidate:{outputId:'invented'}}).success).toBe(false);
});

it('真实creation参数校验接收sectionId/cardId协议，拒绝真模型出现的id/page/type/text与伪metadataSource',async()=>{
 const {buildChatTools}=await import('./chat-tools');
 const prepared=await prepareChatToolDefinitions(buildChatTools(['work.creation.propose'],{humanizeError:()=>null} as never));
 const validator=prepared.parameters['work.creation.propose']!.parameters;
 const ref={kind:'project_script',id:'script',versionId:'saved-script-version'};
 const article={schemaVersion:1,title:'中性标题',summary:'中性摘要',sections:[{sectionId:'section-1',order:0,heading:'开头',headingLevel:2,body:'中性正文',sourceRefs:[ref]}],factItems:[],visualBriefs:[],imageUses:[],metadataSource:{kind:'project',projectId:'project',updatedAt:'2026-10-07T00:00:00.000Z'}};
 const graphic={schemaVersion:1,title:'中性图文',body:'中性正文',summary:'中性摘要',tags:[],imageUses:[],sourceRefs:[ref],ruleSnapshotRef:null,cardBriefs:[{cardId:'card-1',title:'中性页',body:'页正文',sourceRefs:[ref]}],metadataSource:article.metadataSource};
 const valid={targetDigest:'a'.repeat(64),article,graphic};expect(validator.safeParse(valid).success).toBe(true);
 expect(validator.safeParse({...valid,article:{...article,sections:[{id:'section-1',type:'text',text:'中性正文',sourceRefs:[ref]}]}}).success).toBe(false);
 expect(validator.safeParse({...valid,graphic:{...graphic,cardBriefs:[{id:'card-1',page:1,type:'text',title:'中性页',body:'页正文',sourceRefs:[ref]}]}}).success).toBe(false);
 expect(validator.safeParse({...valid,article:{...article,metadataSource:{titleSourceRefs:[ref],summarySourceRefs:[ref]}}}).success).toBe(false);
});
