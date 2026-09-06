import { describe, it, expect, vi } from "vitest";
import type { Db } from "@creatoros/backend";
const fixture = vi.hoisted(() => ({ db: undefined as Db | undefined }));
vi.mock("@creatoros/backend", async original => {
  const actual = await original<typeof import("@creatoros/backend")>();
  return { ...actual, createConfiguredDb: async (...args: Parameters<typeof actual.createConfiguredDb>) => {
    const result = await actual.createConfiguredDb(...args); fixture.db = result.db; return result;
  } };
});
import { productions, eq } from "@creatoros/backend";
import { createPositioningService } from "@creatoros/backend/modules/positioning";
import type { Endpoint } from "@creatoros/contract";
import { getChatRuntime, compositeTransport, __resetPersistenceForTests } from "./persistence-client";
const ep = (id: string) => ({ id }) as Endpoint;
const ctx = { userId: "read-effects", accountId: "read-effects", requestId: "r", source: "user" as const };

describe("T-915 聊天实际装配无隐藏写入", () => {
  it("定位读取屏蔽错误计数但不改库；剪辑候选缺记录不创建，有记录只返回候选", async () => {
    vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PGLITE_DATA_DIR", ""); __resetPersistenceForTests();
    try {
      const runtime = await getChatRuntime(); const db = fixture.db!;
      const positioning = createPositioningService({ db, now: () => new Date().toISOString(), nextId: p => `${p}-read-effects`, projects: { getProjectSubject: async () => ({ title: "测试", brief: "" }) } });
      await positioning.upsertProfile(ctx, { persona: "测试", field: "测试", audience: "测试", differentiation: "测试", capabilities: [], facets: { statusNote: "49 条稿子压在 review，一直未发布" } });
      const before = await positioning.getProfile(ctx);
      const detail = await runtime.contextReaders.getPositioningDetail!(ctx);
      expect(JSON.stringify(detail)).not.toContain("49 条稿子");
      await runtime.context.positioning.getPositioningCenter(ctx);
      expect(await positioning.getProfile(ctx)).toEqual(before);
      const project = await compositeTransport.request(ep("projects.create"), { body: { title: "只读剪辑", brief: "" } } as never, ctx) as { data: { id: string } };
      const output = await compositeTransport.request(ep("projects.outputs.create"), { params: { projectId: project.data.id }, body: { title: "只读输出" } } as never, ctx) as { data: { id: string } };
      const readRows = () => db.select().from(productions).where(eq(productions.contentOutputId, output.data.id));
      const input = { projectId: project.data.id, instruction: "移除信息卡", removeCardIndexes: [0] };
      await expect(runtime.prepareVideoEdit(ctx, input)).rejects.toThrow("当前项目还没有可调整的制作记录");
      expect(await readRows()).toEqual([]);
      await compositeTransport.request(ep("outputs.production.get"), { params: { outputId: output.data.id } } as never, ctx);
      await db.update(productions).set({ recordingConfig: { videoEditingPlan: { revision: 3, renderProps: {
        meta: { title: "测试片" }, talkingHead: { file: "fixture.mp4", durationSec: 10 }, captions: [], broll: [],
        scenes: [{ id: "s1", label: "开场", title: "测试", startSec: 0, endSec: 10, cards: [{ kind: "stat", at: 2, value: "3", unit: "小时", label: "测试" }] }],
      } } } }).where(eq(productions.contentOutputId, output.data.id));
      const rows = await readRows();
      const candidate = await runtime.prepareVideoEdit(ctx, input);
      expect(candidate.expectedRevision).toBe(3);
      expect(candidate.kind).toBe("video.edit");
      expect(candidate.renderProps).not.toBeNull();
      expect((candidate.renderProps!.scenes as Array<{ cards: unknown[] }>)[0]!.cards).toEqual([]);
      expect(await readRows()).toEqual(rows);
      await expect(runtime.prepareVideoEdit({ ...ctx, accountId: "other" }, input)).rejects.toThrow();
      expect(await readRows()).toEqual(rows);
    } finally {
      await (globalThis as { __creatorosDisposePersistence?: () => Promise<void> }).__creatorosDisposePersistence?.();
      __resetPersistenceForTests(); vi.unstubAllEnvs();
    }
  }, 30000);
});
