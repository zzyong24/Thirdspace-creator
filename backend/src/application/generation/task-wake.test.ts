import {describe, expect, it, vi} from "vitest";
import type {RequestContext} from "@creatoros/contract";
import {createGenerationTaskWake} from "./task-wake";

const context: RequestContext = {userId: "user", accountId: "account", requestId: "request", source: "user"};
const types = ["planning.thesis", "script.review", "script.draft", "publish.platform_adapt", "cover.generate", "graphic.card.generate"] as const;
function fixture(taskType: Parameters<ReturnType<typeof createGenerationTaskWake>>[2] = "script.draft") {
  const task = {id: "task-one", taskType, status: "queued", attemptId: "business-request-one", executionTaskId: undefined as string | undefined};
  const runtime: Record<string, unknown> = {};
  const order: string[] = [];
  const prepareBusiness = vi.fn(async () => {order.push("business"); task.executionTaskId = "exec-one";});
  const prepareAssets = vi.fn(async () => {order.push("assets"); task.executionTaskId = "exec-one";});
  const prepareSubmitted = vi.fn(async () => {
    order.push("submitted");
    if (!runtime.hostTaskSubmission) throw Object.assign(new Error("真实父回执缺失"), {code: "SUBMISSION_ORIGIN_INVALID"});
    task.executionTaskId = "exec-one";
  });
  const start = vi.fn(() => {order.push("start");});
  const ports = {readTask: vi.fn(async () => ({...task})), readRuntime: vi.fn(async () => runtime),
    business: {prepare: prepareBusiness}, assets: {prepare: prepareAssets}, submitted: {prepare: prepareSubmitted},
    getWorker: vi.fn(() => ({start})), isStopping: vi.fn(() => false)};
  return {task, runtime, order, ports, start, prepareBusiness, prepareAssets, prepareSubmitted, wake: createGenerationTaskWake(ports)};
}

describe("作品与聊天提交的准备路由", () => {
  it.each(types)("普通 %s 任务走业务准备，完成后才唤醒", async type => {
    const f = fixture(type);
    await f.wake(context, f.task.id, type);
    expect(f.prepareBusiness).toHaveBeenCalledWith(context, f.task.id);
    expect(f.prepareSubmitted).not.toHaveBeenCalled();
    expect(f.order).toEqual(["business", "start"]);
  });
  it("普通素材任务走 assetBusiness", async () => {
    const f = fixture("asset.generate");
    await f.wake(context, f.task.id, "asset.generate");
    expect(f.order).toEqual(["assets", "start"]);
    expect(f.prepareBusiness).not.toHaveBeenCalled();
  });
  it.each(["asset.generate", ...types.slice(0, 5)] as const)("聊天 %s 任务必须有真实父回执，不降级", async type => {
    const f = fixture(type);
    await expect(f.wake(context, f.task.id, type, "submitted")).rejects.toMatchObject({code: "SUBMISSION_ORIGIN_INVALID"});
    expect(f.prepareSubmitted).toHaveBeenCalled();
    expect(f.prepareBusiness).not.toHaveBeenCalled();
    expect(f.prepareAssets).not.toHaveBeenCalled();
    expect(f.start).not.toHaveBeenCalled();
  });
  it("合法聊天任务沿受管准备执行", async () => {
    const f = fixture();
    f.runtime.hostTaskSubmission = {executionTaskId: "parent", callId: "call", inputDigest: "digest"};
    await f.wake(context, f.task.id, "script.draft", "submitted");
    expect(f.order).toEqual(["submitted", "start"]);
    expect(f.prepareBusiness).not.toHaveBeenCalled();
  });
  it.each(["malformed", "reserved-attempt"] as const)("业务入口遇到 %s 聊天来源仍不能绕过受管校验", async marker => {
    const f = fixture();
    if (marker === "malformed") f.runtime.hostTaskSubmission = null;
    else f.task.attemptId = "chat-submit:call-one";
    await expect(f.wake(context, f.task.id, "script.draft")).rejects.toMatchObject({code: "SUBMISSION_ORIGIN_INVALID"});
    expect(f.prepareBusiness).not.toHaveBeenCalled();
    expect(f.start).not.toHaveBeenCalled();
  });
  it("准备失败时提交返回错误，不依赖后台补偿冒充成功", async () => {
    const f = fixture();
    f.prepareBusiness.mockRejectedValueOnce(new Error("准备未完成"));
    await expect(f.wake(context, f.task.id, "script.draft")).rejects.toThrow("准备未完成");
    expect(f.start).not.toHaveBeenCalled();
  });
  it("受管准备尚未绑定执行时不唤醒模型", async () => {
    const f = fixture();
    f.prepareSubmitted.mockResolvedValueOnce(undefined);
    await f.wake(context, f.task.id, "script.draft", "submitted");
    expect(f.start).not.toHaveBeenCalled();
  });
  it("停止、非queued与类型不符时不启动模型", async () => {
    const f = fixture();
    f.ports.isStopping.mockReturnValue(true);
    await f.wake(context, f.task.id, "script.draft");
    expect(f.start).not.toHaveBeenCalled();
    f.task.status = "succeeded";
    await f.wake(context, f.task.id, "script.draft");
    expect(f.ports.readRuntime).toHaveBeenCalledTimes(1);
    await expect(f.wake(context, f.task.id, "cover.generate")).rejects.toThrow("类型不符");
  });
  it("业务准备未真正绑定时返回准备错误而不启动模型", async () => {
    const f = fixture();
    f.prepareBusiness.mockResolvedValueOnce(undefined);
    await expect(f.wake(context, f.task.id, "script.draft")).rejects.toMatchObject({code: "GENERATION_NOT_PREPARED"});
    expect(f.start).not.toHaveBeenCalled();
  });
  it("准备仍在途时不能唤醒，完成后按原任务身份启动", async () => {
    const f = fixture();
    let finish!: () => void;
    f.prepareBusiness.mockImplementationOnce(() => new Promise<void>(resolve => {finish = () => {f.task.executionTaskId = "exec-one"; resolve();};}));
    const pending = f.wake(context, f.task.id, "script.draft");
    await vi.waitFor(() => expect(f.prepareBusiness).toHaveBeenCalled());
    expect(f.start).not.toHaveBeenCalled();
    finish();
    await pending;
    expect(f.start).toHaveBeenCalledOnce();
    expect(f.ports.readTask).toHaveBeenLastCalledWith(context, f.task.id);
  });
  it("账号归属读取失败或模型worker缺失时不进入任何准备", async () => {
    const f = fixture();
    f.ports.readTask.mockRejectedValueOnce(new Error("归属不符"));
    await expect(f.wake(context, f.task.id, "script.draft")).rejects.toThrow("归属不符");
    f.ports.getWorker.mockReturnValueOnce(null as never);
    await expect(f.wake(context, f.task.id, "script.draft")).rejects.toThrow("生成服务未就绪");
    expect(f.prepareBusiness).not.toHaveBeenCalled();
    expect(f.prepareSubmitted).not.toHaveBeenCalled();
    expect(f.start).not.toHaveBeenCalled();
  });
});
