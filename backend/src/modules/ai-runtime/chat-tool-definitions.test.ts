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
