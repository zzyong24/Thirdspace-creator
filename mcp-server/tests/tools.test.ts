// 工具面生成单测:工具名转换、zod→JSON Schema(抽带 params/query/body 的代表 op)、
// annotations 正确性、确认门/高危描述、overview 辅助工具。
import { describe, expect, it } from "vitest";
import { ENDPOINTS } from "@creatoros/contract";
import {
  buildTools,
  endpointDescription,
  endpointInputSchema,
  toToolName,
  OVERVIEW_TOOL,
} from "../src/tools";

describe("toToolName", () => {
  it("op id 点换下划线", () => {
    expect(toToolName("projects.list")).toBe("projects_list");
    expect(toToolName("pages.dashboard.get")).toBe("pages_dashboard_get");
    // [T-248 批C] 原样例 op ai.tasks.pending_topic_review 已删;用合成 id 继续覆盖
    // 「段内下划线保留、点全部换下划线」这一纯函数性质(不依赖真实契约 op)。
    expect(toToolName("foo.bar_baz.qux")).toBe("foo_bar_baz_qux");
  });
});

describe("endpointInputSchema(zod v4 → JSON Schema)", () => {
  it("带 body 的写 op(knowledge.create):body 属性齐全", () => {
    const schema = endpointInputSchema(ENDPOINTS.createKnowledge);
    expect(schema.type).toBe("object");
    const body = (schema.properties as Record<string, any>).body;
    expect(body.type).toBe("object");
    expect(body.properties.title).toBeDefined();
    expect(body.properties.knowledgeType).toBeDefined();
    expect(body.properties.content).toBeDefined();
    // title 必填;knowledgeType/content 有 default,input 视角可省略。
    expect(body.required).toContain("title");
    expect(body.required ?? []).not.toContain("knowledgeType");
  });

  it("带 params 的读 op(knowledge.get):params 必填", () => {
    const schema = endpointInputSchema(ENDPOINTS.getKnowledge);
    expect(schema.required).toContain("params");
    const params = (schema.properties as Record<string, any>).params;
    expect(params.properties.knowledgeId).toBeDefined();
  });

  it("带 query 的读 op(pages.search.get):query 可选、字段在", () => {
    const schema = endpointInputSchema(ENDPOINTS.getGlobalSearch);
    expect(schema.required ?? []).not.toContain("query");
    const query = (schema.properties as Record<string, any>).query;
    expect(query.properties.q).toBeDefined();
    expect(query.required).toContain("q");
  });

  it("无业务入参 op(pages.dashboard.get):只保留通用 CLI/MCP 上下文", () => {
    const schema = endpointInputSchema(ENDPOINTS.getDashboard);
    expect(schema).toEqual({
      type: "object",
      properties: {
        _creatoros: expect.objectContaining({
          type: "object",
          properties: expect.objectContaining({ accountId: expect.any(Object) }),
        }),
      },
      additionalProperties: false,
    });
  });

  it("全部 ENDPOINTS 都能转出合法 JSON Schema(不抛)", () => {
    for (const endpoint of Object.values(ENDPOINTS)) {
      const schema = endpointInputSchema(endpoint);
      expect(schema.type).toBe("object");
    }
  });

  it("artifacts.create 的 MCP schema 与服务端枚举、output 关联一致", () => {
    const schema = endpointInputSchema(ENDPOINTS.createArtifact);
    const body = (schema.properties as Record<string, any>).body;
    expect(body.properties.artifactType.enum).toContain("output_script");
    expect(body.properties.artifactType.enum).toContain("cover_copy");
    expect(body.properties.artifactType.enum).not.toContain("script-ish");
    expect(body.properties.stage.enum).toContain("script");
    expect(body.properties.contentOutputId).toBeDefined();
  });
});

describe("buildTools", () => {
  const tools = buildTools();
  const byName = new Map(tools.map((t) => [t.name, t]));

  it("工具数 = ENDPOINTS 数 + 1(overview),名字唯一", () => {
    expect(tools.length).toBe(Object.keys(ENDPOINTS).length + 1);
    expect(byName.size).toBe(tools.length);
  });

  it("GET op → readOnlyHint,写 op → 非只读", () => {
    const read = byName.get("projects_list")!;
    expect(read.annotations.readOnlyHint).toBe(true);
    expect(read.annotations.destructiveHint).toBe(false);
    const write = byName.get("knowledge_create")!;
    expect(write.annotations.readOnlyHint).toBe(false);
    expect(write.annotations.destructiveHint).toBe(false);
  });

  it("DELETE op → destructiveHint + 高危警告描述", () => {
    const del = tools.find((t) => t.annotations.destructiveHint);
    expect(del).toBeDefined();
    expect(del!.description).toContain("高危");
    expect(del!.description).toContain("物理删除");
  });

  it("AI 任务类 op 描述写明确认门语义(只产候选需 confirm)", () => {
    const create = byName.get("ai_tasks_create")!;
    expect(create.description).toContain("确认门");
    expect(create.description).toContain("候选");
    const confirm = byName.get("ai_tasks_confirm")!;
    expect(confirm.description).toContain("确认门");
  });

  it("工具名不超 64 字符(MCP client 兼容)", () => {
    for (const tool of tools) {
      expect(tool.name.length).toBeLessThanOrEqual(64);
      expect(tool.name).toMatch(/^[a-zA-Z0-9_-]+$/);
    }
  });

  it("含 creatoros_overview 辅助工具,映射到 pages.dashboard.get", () => {
    const overview = byName.get("creatoros_overview")!;
    expect(overview).toEqual(OVERVIEW_TOOL);
    expect(overview.opId).toBe("pages.dashboard.get");
    expect(overview.annotations.readOnlyHint).toBe(true);
    expect((overview.inputSchema.properties as Record<string, unknown>)._creatoros).toBeDefined();
  });
});

describe("endpointDescription", () => {
  it("读 op:标明只读", () => {
    expect(endpointDescription(ENDPOINTS.listProjects ?? ENDPOINTS.getDashboard)).toContain(
      "只读",
    );
  });
});
