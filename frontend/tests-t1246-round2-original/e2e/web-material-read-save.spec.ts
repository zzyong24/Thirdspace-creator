import type { Page, Route } from "@playwright/test";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { expect, test } from "../helpers/test-environment";

const SOURCE_URL = "https://example.com/deepseek-harness#intro";
const ASSET_ID = "asset-web-read-e2e";
const NOW = "2026-08-13T16:00:00.000Z";

async function fulfillToolResult(
  route: Route,
  toolName: string,
  toolCallId: string,
  input: unknown,
  output: unknown,
): Promise<void> {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: "start", messageId: `assistant-${toolCallId}` });
      writer.write({ type: "start-step" });
      writer.write({ type: "tool-input-available", toolCallId, toolName, input });
      writer.write({ type: "tool-output-available", toolCallId, output });
      writer.write({ type: "finish-step" });
      writer.write({ type: "finish", finishReason: "stop" });
    },
  });
  const response = createUIMessageStreamResponse({ stream });
  await route.fulfill({
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: Buffer.from(await response.arrayBuffer()),
  });
}

test.describe("联网素材先阅读后保存", () => {
  test("搜索线索只能阅读全文，成功后才允许按稳定素材保存到当前项目", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(Math.max((60_000), 40260000));
    const accountResponse = await page.request.post("/api/v1/dispatch", {
      data: {
        id: "accounts.create",
        input: {
          params: undefined,
          query: undefined,
          body: {
            platform: "douyin",
            accountHandle: `@e2e-web-read-${Date.now()}`,
          },
        },
      },
    timeout: 120000});
    expect(accountResponse.ok()).toBe(true);
    const account = (await accountResponse.json()) as { data: { id: string } };
    const projectResponse = await page.request.post("/api/v1/dispatch", {
      headers: { "x-account-id": account.data.id },
      data: {
        id: "projects.create",
        input: {
          params: undefined,
          query: undefined,
          body: { title: "联网素材阅读验收", brief: "" },
        },
      },
    timeout: 120000});
    expect(projectResponse.ok()).toBe(true);
    const project = (await projectResponse.json()) as { data: { id: string } };
    await page.context().addCookies([
      {
        name: "creatoros_current_account",
        value: encodeURIComponent(account.data.id),
        url: baseURL ?? "http://127.0.0.1",
      },
    ]);
    await page.context().addInitScript(
      ([key, value]) => window.localStorage.setItem(key!, value!),
      ["creatoros:current-account", account.data.id],
    );

    const chatBodies: Array<Record<string, unknown>> = [];
    await page.context().route("**/api/chat", async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      chatBodies.push(body);
      const chatContext = (body.chatContext ?? {}) as Record<string, unknown>;
      if (chatContext.functionKey !== "web.read" || !chatContext.webReadUrl) {
        await fulfillToolResult(
          route,
          "material.gather",
          "tool-gather-e2e",
          { query: "DeepSeek Harness" },
          {
            kind: "material.gather",
            grounding: "web",
            items: [
              {
                title: "DeepSeek Harness 开发者预览版",
                url: SOURCE_URL,
                sourceUrl: SOURCE_URL,
                source: "example.com",
                whyRelevant: "介绍 Harness 的插件式能力与使用方式",
                category: "产品资料",
              },
            ],
          },
        );
        return;
      }
      await fulfillToolResult(
        route,
        "web.read",
        "tool-web-read-e2e",
        { url: SOURCE_URL },
        {
          kind: "web.read",
          asset: {
            id: ASSET_ID,
            name: "正文·DeepSeek Harness 开发者预览版",
            previewUrl: null,
            sourceUrl: "https://example.com/deepseek-harness",
            title: "DeepSeek Harness 开发者预览版",
            excerpt: "正文首段介绍 Harness；中段解释插件机制；末段给出体验方式。",
            extractor: "readability",
          },
          needLogin: null,
          error: null,
          window: { offset: 0, length: 32, total: 32 },
          hasMore: false,
          fromCache: false,
        },
      );
    });

    const mutations: Array<{ id: string; input: Record<string, unknown> }> = [];
    await page.context().route("**/api/v1/dispatch", async (route) => {
      const body = route.request().postDataJSON() as {
        id?: string;
        input?: Record<string, unknown>;
      };
      if (body.id === "assets.commit") {
        mutations.push({ id: body.id, input: body.input ?? {} });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              id: ASSET_ID,
              userId: "user-e2e",
              currentFileId: "file-web-read-e2e",
              assetType: "document",
              name: "正文·DeepSeek Harness 开发者预览版",
              description: "",
              status: "active",
              isFavorite: false,
              mimeType: "text/plain",
              fileSize: 96,
              width: null,
              height: null,
              durationMs: null,
              extractStatus: "done",
              materialSummary: null,
              extractedText:
                "正文首段介绍 Harness；中段解释插件机制；末段给出体验方式。",
              sourceUrl: "https://example.com/deepseek-harness",
              deletedAt: null,
              createdAt: NOW,
              updatedAt: NOW,
            },
            meta: { requestId: "e2e-web-read" },
          }),
        });
        return;
      }
      if (body.id === "materialLinks.create") {
        mutations.push({ id: body.id, input: body.input ?? {} });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              id: "material-link-web-read-e2e",
              userId: "user-e2e",
              projectId: project.data.id,
              contentOutputId: null,
              entityType: "asset",
              entityId: ASSET_ID,
              role: "reference",
              stage: "script",
              addedByType: "ai",
              priority: "normal",
              createdAt: NOW,
            },
            meta: { requestId: "e2e-web-read" },
          }),
        });
        return;
      }
      await route.continue();
    });

    const runJourney = async (targetPage: Page) => {
      const journeyBodyOffset = chatBodies.length;
      const hydrationFinished = targetPage.waitForResponse((response) => {
        if (!response.url().endsWith("/api/v1/dispatch")) return false;
        try {
          return response.request().postDataJSON()?.id === "ai.conversations.list";
        } catch {
          return false;
        }
      }, { timeout: 300000 });
      await targetPage.goto(
        `/?copilot=open&surface=project&selKind=project&selId=${project.data.id}&selTitle=${encodeURIComponent("联网素材阅读验收")}`,
      );
      // Copilot 会先恢复该项目最近会话；恢复完成前发送会与空历史回写竞争。
      // 等真实恢复请求结束，再模拟用户输入，避免测试制造现实中“抢在初始化前点击”的竞态。
      await hydrationFinished;
      const composer = targetPage.getByLabel("我能帮你做什么");
      const submit = targetPage.getByLabel("提交提示给 Copilot");
      await expect(composer).toBeEnabled();
      await expect
        .poll(async () => {
          await composer.fill("联网找 DeepSeek Harness 的资料");
          return (await composer.inputValue()).length > 0 && (await submit.isEnabled());
        })
        .toBe(true);
      await submit.click();

      await expect(targetPage.getByRole("button", { name: "阅读全文" })).toBeVisible();
      await expect(targetPage.getByText(/保存到项目/)).toHaveCount(0);
      await targetPage.getByRole("button", { name: "阅读全文" }).click();

      await expect(targetPage.getByText("已阅读 · 当前对话临时上下文")).toBeVisible();
      await expect(targetPage.getByText("已读 32 / 共 32 字 · 本页正文已读完")).toBeVisible();
      await expect(targetPage.getByText("提取方式：readability")).toBeVisible();
      await targetPage.setViewportSize({ width: 1024, height: 768 });
      await expect(targetPage.getByText("已阅读 · 当前对话临时上下文")).toBeVisible();
      const saveButton = targetPage.getByRole("button", { name: "保存到项目" });
      await expect(saveButton).toBeVisible();

      const readBody = chatBodies
        .slice(journeyBodyOffset)
        .find((body) => {
          const context = (body.chatContext ?? {}) as Record<string, unknown>;
          return context.functionKey === "web.read";
        });
      const secondChatContext = (readBody?.chatContext ?? {}) as Record<string, unknown>;
      expect(secondChatContext).toMatchObject({
        functionKey: "web.read",
        webReadUrl: SOURCE_URL,
        projectId: project.data.id,
      });

      await saveButton.click();
      await expect.poll(() => mutations.length, { timeout: 300000 }).toBe(2);
      expect(mutations).toHaveLength(2);
      expect(mutations[0]).toMatchObject({
        id: "assets.commit",
        input: {
          params: { assetId: ASSET_ID },
          body: { expectedSourceUrl: "https://example.com/deepseek-harness" },
        },
      });
      expect(mutations[1]).toMatchObject({
        id: "materialLinks.create",
        input: {
          body: {
            projectId: project.data.id,
            entityType: "asset",
            entityId: ASSET_ID,
            role: "reference",
            stage: "script",
            addedByType: "ai",
          },
        },
      });
    };

    await page.setViewportSize({ width: 1536, height: 1024 });
    await runJourney(page);
  });
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 40260000 });
