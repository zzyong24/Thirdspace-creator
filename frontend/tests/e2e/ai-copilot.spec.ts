import { expect, test } from "../helpers/test-environment";

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
    page,
  }) => {
    // T1024/T1026：打开和预填不自动生成；明确提交必须落原source/task，任意POST不代签。
    const generationRequests: Array<{url:string;body:any}> = [];
    page.on("request", req => {
      if(req.method()!=="POST")return;
      const url=new URL(req.url());let body;try{body=req.postDataJSON();}catch{return;}
      if(url.pathname==="/api/chat"||url.pathname==="/api/v1/dispatch"&&["ai.conversations.messages.create","ai.tasks.create"].includes(body?.id))generationRequests.push({url:url.pathname,body});
    });
    await page.goto("/?copilot=open");
    const dialog=page.getByRole("dialog");await expect(dialog).toBeVisible();
    const input=page.getByLabel("我能帮你做什么");await expect(input).toBeVisible();
    await dialog.locator('[data-slot="suggested-chip"]').first().click();
    await expect(input).not.toHaveValue("");expect(generationRequests).toEqual([]);
    await input.fill("请只确认收到这段用户测试文字，不调用工具或外部网络。");
    expect(generationRequests).toEqual([]);
    const sourceResponse=page.waitForResponse(r=>{try{return new URL(r.url()).pathname==="/api/v1/dispatch"&&r.request().postDataJSON()?.id==="ai.conversations.messages.create";}catch{return false;}},{timeout:300_000});
    await page.getByTestId("submit-button").click();const response=await sourceResponse;expect(response.ok()).toBe(true);
    const source=(await response.json()).data;expect(source.id).toBeTruthy();expect(source.role).toBe("user");expect(source.content).toBe("请只确认收到这段用户测试文字，不调用工具或外部网络。");
    await expect.poll(async()=>{
      const result=await page.request.post("/api/v1/dispatch",{timeout:120_000,data:{id:"ai.tasks.list",input:{query:{page:1,pageSize:100,taskType:"copilot.assist"}}}});expect(result.ok()).toBe(true);
      return (await result.json()).data.find((t:any)=>t.inputData?.sourceMessageId===source.id);
    },{timeout:300_000}).toMatchObject({taskType:"copilot.assist",inputData:{sourceMessageId:source.id,conversationId:source.conversationId}});
    const originalSources=generationRequests.filter(r=>r.body?.id==="ai.conversations.messages.create");expect(originalSources).toHaveLength(1);
    const sent=originalSources[0]!.body.input;expect(sent.body.content).toBe(source.content);expect(sent.params.conversationId).toBe(source.conversationId);
    // 此例核真实提交生产者，不把未配Pi后的失败/等待签成模型成功；官方生成另逐ledger验。

  });
});
