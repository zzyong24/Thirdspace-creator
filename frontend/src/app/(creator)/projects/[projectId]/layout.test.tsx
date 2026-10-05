import type {ReactElement} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";
import Layout from "./layout";

const mocks = vi.hoisted(() => ({get: vi.fn(), list: vi.fn(), outputs: vi.fn()}));
vi.mock("@/lib/session.server", () => ({resolveSession: async () => ({ctx: {userId: "user-a", accountId: "account-a"}})}));
vi.mock("@/lib/contract-client.server", () => ({createServerClient: () => ({getProject: mocks.get, listProjects: mocks.list, listOutputs: mocks.outputs})}));
vi.mock("./stage-chat-wrapper", () => ({StageChatWrapper: () => null}));
vi.mock("@/features/draft-workbench/draft-chat-request", () => ({DraftChatRequestProvider: () => null}));
const project = {id: "project-101", title: "第101个项目", currentStage: "script", progressPct: 0};
async function identity(id: string) {
  const element = await Layout({children: null, params: Promise.resolve({projectId: id})});
  return (element as ReactElement<{value: {projectId: string; workOutputs: unknown} | null}>).props.value;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockResolvedValue(project);
  mocks.list.mockResolvedValue([]);
  mocks.outputs.mockResolvedValue([{id: "a", contentType: "article"}, {id: "i", contentType: "image"}]);
});
describe("T-1050 真实项目导航数据", () => {
  it("canonical ID 直接读项目，首100条外的项目也读真实作品", async () => {
    expect(await identity("project-101")).toMatchObject({projectId: "project-101", workOutputs: [{id: "a", contentType: "article"}, {id: "i", contentType: "image"}]});
    expect(mocks.get).toHaveBeenCalledWith({params: {projectId: "project-101"}, query: undefined, body: undefined});
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.outputs).toHaveBeenCalledWith({params: {projectId: "project-101"}, query: undefined, body: undefined});
  });
  it("旧标题slug在第二页仍可解析，作品读取使用真实ID", async () => {
    mocks.get.mockRejectedValue(new Error("OwnershipError"));
    mocks.list.mockResolvedValueOnce(Array.from({length: 100}, (_, i) => ({...project, id: `other-${i}`, title: `Other ${i}`})))
      .mockResolvedValueOnce([{...project, title: "A Real Title"}]);
    expect(await identity("a-real-title")).toMatchObject({projectId: "project-101"});
    expect(mocks.list.mock.calls.map(([input]) => input.query.page)).toEqual([1, 2]);
    expect(mocks.outputs.mock.calls[0]![0].params.projectId).toBe("project-101");
  });
  it("作品读失败保留真项目标题和null，不编造类型", async () => {
    mocks.outputs.mockRejectedValue(new Error("读失败"));
    expect(await identity("project-101")).toMatchObject({projectId: "project-101", workOutputs: null});
  });
  it("无权或不存在的项目不发布任何作品", async () => {
    mocks.get.mockRejectedValue(new Error("OwnershipError"));
    expect(await identity("missing")).toBeNull();
    expect(mocks.outputs).not.toHaveBeenCalled();
  });
});
