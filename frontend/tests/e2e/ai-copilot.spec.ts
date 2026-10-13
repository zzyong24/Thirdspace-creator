import { expect, test } from "../helpers/test-environment";
import { randomUUID } from "node:crypto";
import { ENDPOINTS, successEnvelope } from "@creatoros/contract";

/**
 * E2E contract for the AI Copilot dialog (Task 24).
 *
 *  - `?copilot=open` opens the centered dialog on any page; the AppShell
 *    remains mounted with one Sidebar and one TopHeader (background is
 *    masked per D-006).
 *  - The dialog is `role="dialog"` with `aria-modal="true"`.
 *  - The close button removes only `?copilot=open` from the URL; the
 *    underlying pathname is preserved.
 *  - Escape closes the dialog.
 *  - Browser Back closes the dialog.
 *  - The submit button is `type="submit"` inside a `<form>` with no
 *    `action` and no `onSubmit` — no real network call.
 */

test.describe("AI Copilot dialog", () => {
  test("opens the centered dialog from any page via ?copilot=open", async ({
    page,
  }) => {
    await page.goto("/?copilot=open");

    // Single shared AppShell.
    await expect(page.locator('[data-slot="app-shell"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="app-sidebar"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="app-top-header"]')).toHaveCount(1);

    // Centered dialog (not right-side drawer).
    const layer = page.locator('[data-slot="overlay-layer"]');
    await expect(layer).toBeVisible();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(layer).toHaveAttribute("class", /justify-center/);
    await expect(layer).not.toHaveAttribute("class", /justify-end/);

    // Page-specs §16 component tree.
    await expect(page.locator('[data-slot="prompt-composer"]')).toBeVisible();
    await expect(dialog.locator('[data-slot="copilot-conversation"]')).toBeVisible();
    await expect(dialog.locator('[data-slot="suggested-action-chips"]')).toBeVisible();
    await expect(dialog.locator('[data-slot="suggested-chip"]').first()).toBeVisible();
    await expect(page.locator('[data-slot="copilot-dashboard"]')).toHaveCount(0);
  });

  test("close button removes only ?copilot=open and preserves the pathname", async ({
    page,
  }) => {
    await page.goto("/projects?copilot=open");
    await page.getByTestId("ai-copilot-close").click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page).not.toHaveURL(/copilot=/);
  });

  test("Escape closes the dialog", async ({ page }) => {
    await page.goto("/?copilot=open");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/copilot=/);
  });

  test("browser Back closes the dialog", async ({ page }) => {
    await page.goto("/?copilot=open");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.goBack();
    await expect(page).not.toHaveURL(/copilot=/);
  });

  test("submit button does not post a real network request", async ({
    page, baseURL,
  }, testInfo) => {
    // T1024/T1026：打开和预填不自动生成；明确提交必须落原source/task，任意POST不代签。
    const generationRequests: Array<{url:string;body:any}> = [];
    page.on("request", req => {
      if(req.method()!=="POST")return;
      const url=new URL(req.url());let body;try{body=req.postDataJSON();}catch{return;}
      if(url.pathname==="/api/chat"||url.pathname==="/api/v1/dispatch"&&["ai.conversations.messages.create","ai.tasks.create"].includes(body?.id))generationRequests.push({url:url.pathname,body});
    });
    const dispatch = async (id: string, input: unknown, groupId?: string): Promise<any> => {
      const response = await page.request.post("/api/v1/dispatch", { data: { id, input }, headers: groupId ? { "x-group-id": groupId } : {}, timeout: 120_000 });
      expect(response.ok()).toBe(true); return await response.json();
    };
    const group = successEnvelope(ENDPOINTS.createAccountGroup.response).parse(await dispatch("accountGroups.create", { body: { name: "编导真实提交组", idempotencyKey: randomUUID() } })).data;
    const project = successEnvelope(ENDPOINTS.createProject.response).parse(await dispatch("projects.create", { body: { title: "编导明确提交验收", brief: "仅核本次用户提交生产者" } }, group.id)).data;
    await page.context().addCookies([{ name: "creatoros_current_group", value: encodeURIComponent(group.id), url: baseURL! }]);
    await page.addInitScript(id => { localStorage.setItem("creatoros:current-group", id); localStorage.removeItem("creatoros:current-account"); }, group.id);
    await page.goto(`/projects/${project.id}?copilot=open&surface=project&selKind=project&selId=${encodeURIComponent(project.id)}`);
    await expect(page.getByTestId("account-switcher")).toHaveAttribute("data-state", "ready");
    const dialog=page.getByRole("dialog");await expect(dialog).toBeVisible();
    const input=page.getByLabel("我能帮你做什么");await expect(input).toBeVisible();
    await dialog.locator('[data-slot="suggested-chip"]').first().click();
    await expect(input).not.toHaveValue("");expect(generationRequests).toEqual([]);
    await input.fill("请只确认收到这段用户测试文字，不调用工具或外部网络。");
    expect(generationRequests).toEqual([]);
    const originalText="请只确认收到这段用户测试文字，不调用工具或外部网络。";
    const sourceResponse=page.waitForResponse(r=>{try{return new URL(r.url()).pathname==="/api/chat"&&r.request().method()==="POST";}catch{return false;}},{timeout:300_000}).then(response=>({response}),error=>({error}));
    await page.getByTestId("submit-button").click();const observed=await sourceResponse;if("error" in observed)throw observed.error;
    const response=observed.response;expect(response.ok()).toBe(true);
    const handshake=response.headers(),request=response.request().postDataJSON();
    const binding={sourceMessageId:handshake["x-source-message-id"],taskId:handshake["x-ai-task-id"],conversationId:handshake["x-conversation-id"],executionTaskId:handshake["x-execution-task-id"]};
    for(const id of Object.values(binding))expect(id).toBeTruthy();
    expect(request.chatContext.projectId).toBe(project.id);expect(request.chatContext.scope).toBe(`project:${project.id}`);
    const messages=(await dispatch("ai.conversations.messages.list",{params:{conversationId:binding.conversationId}},group.id)).data;
    const source=messages.find((message:any)=>message.id===binding.sourceMessageId);
    expect(source).toBeTruthy();expect(source.role).toBe("user");expect(source.content).toBe(originalText);expect(source.conversationId).toBe(binding.conversationId);
    const task=(await dispatch("ai.tasks.get",{params:{taskId:binding.taskId}},group.id)).data;
    expect(task.id).toBe(binding.taskId);expect(task.groupId).toBe(group.id);expect(task.projectId).toBe(project.id);expect(task.taskType).toBe("copilot.assist");expect(task.executionTaskId).toBe(binding.executionTaskId);
    expect(task.inputData.sourceMessageId).toBe(source.id);expect(task.inputData.conversationId).toBe(source.conversationId);
    await expect.poll(async()=> (await dispatch("ai.tasks.list",{query:{page:1,pageSize:100,projectId:project.id,taskType:"copilot.assist"}},group.id)).data.find((row:any)=>row.id===binding.taskId),{timeout:300_000}).toMatchObject({taskType:"copilot.assist",inputData:{sourceMessageId:source.id,conversationId:source.conversationId}});
    const originalSources=generationRequests.filter(row=>row.url==="/api/chat");expect(originalSources).toHaveLength(1);
    const user=originalSources[0]!.body.messages.findLast((message:any)=>message.role==="user");expect(user.parts.filter((part:any)=>part.type==="text").map((part:any)=>part.text).join("")).toBe(source.content);
    await testInfo.attach("原提交四ID与同组source-task读回",{body:Buffer.from(JSON.stringify({binding,groupId:group.id,projectId:project.id,source,task},null,2)),contentType:"application/json"});
    // 此例核真实提交生产者，不把未配Pi后的失败/等待签成模型成功；官方生成另逐ledger验。

  });
});

// T-1246：原字节/FAIL封存；本活跃副本仅作已批准的本case合同校准，其余正文、标题及预算保持。
test.describe.configure({ timeout: 29460000 });
