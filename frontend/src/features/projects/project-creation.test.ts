import { describe, expect, it, vi } from "vitest";
import { createProjectCreationSession, ProjectCreationError } from "./project-creation";

function setup() {
  let account = "account-a";
  const ports = {
    readAccountId: () => account,
    verifyAccount: vi.fn(async () => {}),
    createProject: vi.fn(async () => ({id: "project-a", title: "主题"})),
    createOutput: vi.fn(async (_id: string, body: {contentType: string; title: string}) => ({id: `${body.contentType}-a`, projectId: "project-a", ...body})),
  };
  return {ports, session: createProjectCreationSession(ports), switchAccount: (id: string) => {account = id;}};
}
const input = {name: "主题", brief: "描述", contentTypes: ["video", "article", "image"] as const, enterAfterCreate: true};

describe("T-1050 多形式创建会话", () => {
  it("一个项目、三类真实稿件、固定卡片顺序；不提交画幅或模式", async () => {
    const {session, ports} = setup();
    const result = await session.create(input);
    expect(ports.createProject).toHaveBeenCalledOnce();
    expect(ports.createProject).toHaveBeenCalledWith({title: "主题", brief: "描述"});
    expect(result.outputs.map(item => item.contentType)).toEqual(["article", "image", "video"]);
    expect(ports.createOutput).toHaveBeenCalledTimes(3);
  });
  it("部分失败仍创建其余类型，重试只补失败，复用同一键", async () => {
    const {session, ports} = setup();
    let failed = false;
    ports.createOutput.mockImplementation(async (_id, body) => {
      if (body.contentType === "image" && !failed) {failed = true; throw new Error("断网");}
      return {id: `${body.contentType}-a`, projectId: "project-a", ...body};
    });
    await expect(session.create(input)).rejects.toThrow(/图文/);
    expect(session.snapshot().outputs.map(item => item.contentType)).toEqual(["article", "video"]);
    const first = ports.createOutput.mock.calls[1]![1];
    const result = await session.create(input);
    expect(result.outputs).toHaveLength(3);
    expect(ports.createProject).toHaveBeenCalledOnce();
    expect(ports.createOutput.mock.calls[3]![1]).toEqual(first);
  });
  it("未决请求改标题时不创建新项目或偷换参数", async () => {
    const {session, ports} = setup();
    ports.createOutput.mockRejectedValueOnce(new Error("响应丢失"));
    await expect(session.create(input)).rejects.toThrow();
    await expect(session.create({...input, name: "新主题"})).rejects.toThrow(/原.*输入|原.*主题/);
    expect(ports.createProject).toHaveBeenCalledOnce();
    expect(ports.createOutput).toHaveBeenCalledTimes(3);
  });
  it("完成前后都不把已建项目续写到另一个账号", async () => {
    const {session, ports, switchAccount} = setup();
    ports.createOutput.mockRejectedValueOnce(new Error("断网"));
    await expect(session.create(input)).rejects.toThrow();
    switchAccount("account-b");
    await expect(session.create(input)).rejects.toThrow(/账号.*切换/);
    expect(ports.createOutput).toHaveBeenCalledTimes(3);
  });
  it("每次写前检查切号，切换中止剩余创建", async () => {
    const {session, ports, switchAccount} = setup();
    ports.createOutput.mockImplementationOnce(async (_id, body) => {
      switchAccount("account-b");
      return {id: "article-a", projectId: "project-a", ...body};
    });
    await expect(session.create(input)).rejects.toThrow(/账号.*切换/);
    expect(ports.createOutput).toHaveBeenCalledOnce();
  });
  it("只把小红书平台传给兼容的图文和视频", async () => {
    const {session, ports} = setup();
    await session.create({...input, targetPlatform: "xiaohongshu"});
    expect(ports.createOutput.mock.calls.map(([,body]) => body)).toEqual([
      expect.not.objectContaining({targetPlatform: expect.anything()}),
      expect.objectContaining({targetPlatform: "xiaohongshu"}),
      expect.objectContaining({targetPlatform: "xiaohongshu"}),
    ]);
  });
  it("没有选择账号时有可恢复错误且不写项目", async () => {
    const {session, ports, switchAccount} = setup();
    switchAccount("");
    await expect(session.create(input)).rejects.toMatchObject({needsAccount: true});
    expect(ports.createProject).not.toHaveBeenCalled();
  });
  it("项目响应未知时禁止盲目重发，提示先核对项目列表", async () => {
    const {session, ports} = setup();
    ports.createProject.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(session.create(input)).rejects.toThrow(/项目列表/);
    await expect(session.create(input)).rejects.toThrow(/项目列表/);
    expect(ports.createProject).toHaveBeenCalledOnce();
  });
  it("真实 428 转成账号恢复提示", async () => {
    const {session, ports} = setup();
    ports.verifyAccount.mockRejectedValue({code: "AccountRequiredError", status: 428});
    await expect(session.create(input)).rejects.toBeInstanceOf(ProjectCreationError);
    await expect(session.create(input)).rejects.toMatchObject({needsAccount: true});
  });
});


describe("T-1062 纯组创建（TMP候选，未运行）",()=>{
 it("空组无需平台账号，同组切平台不中止；跨组不续写",async()=>{
  let group="group-a",account:string|null=null;
  const ports={readGroupId:()=>group,readAccountId:()=>account,verifyGroup:vi.fn(async()=>{}),verifyAccount:vi.fn(async()=>{}),createProject:vi.fn(async()=>({id:"p",title:"主题"})),createOutput:vi.fn(async(_id:string,body:{contentType:string;title:string})=>{account="platform-b";return {id:body.contentType,projectId:"p",...body};})};
  const session=createProjectCreationSession(ports);const result=await session.create(input);expect(result.groupId).toBe("group-a");expect(result.accountId).toBeNull();expect(ports.verifyAccount).not.toHaveBeenCalled();expect(ports.createOutput).toHaveBeenCalledTimes(3);
  group="group-b";await expect(session.create(input)).rejects.toThrow("账号组已切换");expect(ports.createProject).toHaveBeenCalledOnce();
 });
 it("组验证期间切组，零项目写入",async()=>{
  let group="a";const ports={readGroupId:()=>group,readAccountId:()=>null,verifyGroup:vi.fn(async()=>{group="b";}),verifyAccount:vi.fn(async()=>{}),createProject:vi.fn(async()=>({id:"p",title:"主题"})),createOutput:vi.fn()};
  await expect(createProjectCreationSession(ports).create(input)).rejects.toThrow();expect(ports.createProject).not.toHaveBeenCalled();
 });
});
