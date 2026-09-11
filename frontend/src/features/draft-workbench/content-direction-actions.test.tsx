import * as React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentDirectionActions } from "./content-direction-actions";
import { DraftChatRequestProvider, useDraftChatRequest, type DraftChatRequest } from "./draft-chat-request";

const mocks = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), flush: vi.fn() }));
vi.mock("@/lib/contract-client", () => ({ client: { listArtifacts: mocks.list, getArtifact: mocks.get } }));
let request: DraftChatRequest | null;
function Probe() {
  const context = useDraftChatRequest();
  request = context.request;
  React.useEffect(() => { context.registerFlush(mocks.flush); return () => context.registerFlush(null); }, [context.registerFlush]);
  return null;
}
function mount() { render(<DraftChatRequestProvider><Probe /><ContentDirectionActions projectId="p1" projectTitle="当前稿" /></DraftChatRequestProvider>); }
beforeEach(() => {
  vi.resetAllMocks(); request = null;
  mocks.flush.mockResolvedValue(undefined);
  mocks.list.mockResolvedValue([{ id: "a1", stage: "script", artifactType: "output_script" }]);
  mocks.get.mockResolvedValue({ id: "a1", projectId: "p1", currentVersionId: "v-new" });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("当前稿内容判断", () => {
  it.each(["判断这条值不值得做", "检查哪里留不住人", "把证据讲清楚"])("%s 保存完成后读取真实新版本并发送一次", async label => {
    let resolve!: () => void;
    mocks.flush.mockReturnValueOnce(new Promise<void>(r => { resolve = r; }));
    mount(); fireEvent.click(screen.getByRole("button", { name: label }));
    expect(mocks.list).not.toHaveBeenCalled(); expect(request).toBeNull();
    await act(async () => resolve());
    await waitFor(() => expect(request?.autoSend).toBe(true));
    expect(request?.selection).toMatchObject({ id: "p1", artifactId: "a1", versionId: "v-new" });
    expect(request).not.toHaveProperty("functionKey");
    expect(request?.prefill).toContain("本次先做内容诊断，不要自动调用改稿或采纳工具");
    expect(request?.prefill).toContain("版本 v-new");
    expect(request?.nonce).toBe(1);
  });
  it("保存失败不读取旧稿、不发诊断，原入口可重试", async () => {
    mocks.flush.mockRejectedValueOnce(new Error("保存失败"));
    mount(); fireEvent.click(screen.getByRole("button", { name: "把证据讲清楚" }));
    await screen.findByRole("alert");
    expect(mocks.list).not.toHaveBeenCalled(); expect(request).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "把证据讲清楚" }));
    await waitFor(() => expect(request?.nonce).toBe(1));
  });
  it("保存超时不放行，迟到保存也不会自动发旧诊断", async () => {
    vi.useFakeTimers(); let resolve!: () => void;
    mocks.flush.mockReturnValue(new Promise<void>(r => { resolve = r; }));
    mount(); fireEvent.click(screen.getByRole("button", { name: "检查哪里留不住人" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10001); });
    expect(screen.getByRole("alert").textContent).toContain("本次未发送诊断");
    await act(async () => resolve());
    expect(request).toBeNull(); expect(mocks.list).not.toHaveBeenCalled();
  });
  it("当前版本读取超时不发送，迟到读数不触发动作", async () => {
    vi.useFakeTimers(); let resolve!: (value: unknown) => void;
    mocks.get.mockReturnValue(new Promise(r => { resolve = r; }));
    mount(); fireEvent.click(screen.getByRole("button", { name: "检查哪里留不住人" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10001); });
    expect(screen.getByRole("alert").textContent).toContain("读取当前稿件超时");
    await act(async () => resolve({ id: "a1", projectId: "p1", currentVersionId: "v-late" }));
    expect(request).toBeNull();
  });
  it.each([{ projectId: "other", currentVersionId: "v1" }, { projectId: "p1", currentVersionId: null }])("归属或版本不明确时不发送", async value => {
    mocks.get.mockResolvedValue({ id: "a1", ...value });
    mount(); fireEvent.click(screen.getByRole("button", { name: "判断这条值不值得做" }));
    await screen.findByRole("alert"); expect(request).toBeNull();
  });
});
