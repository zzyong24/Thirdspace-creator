import { expect as baseExpect, test } from "../helpers/test-environment";
import type { Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
const expect = baseExpect.configure({ timeout: 120000 });
const evidence = resolve(process.cwd(), "../docs/verification/t1075");
const checks = [
  "collection",
  "selection",
  "detail",
  "empty-next",
  "write-read",
  "organize",
  "import",
  "reference",
  "navigation",
];
const captures: Array<{
  checkpoint: string;
  check_ids: string[];
  viewport: { width: number; height: number };
  text: string;
}> = [];
const witnesses: Array<{ id: string; role: string }> = [];
async function op(page: Page, id: string, input: unknown, groupId?: string) {
  const response = await page.request.post("/api/v1/dispatch", {
    timeout: 120000,
    headers: groupId ? { "x-group-id": groupId } : {},
    data: { id, input },
  });
  const body = await response.json();
  expect(response.ok(), `${id}: ${JSON.stringify(body.error)}`).toBe(true);
  return body.data;
}
async function capture(page: Page, checkpoint: string, check_ids = checks) {
  captures.push({
    checkpoint,
    check_ids,
    viewport: page.viewportSize()!,
    text: await page.locator("body").innerText(),
  });
  await page.screenshot({
    path: resolve(evidence, checkpoint + ".png"),
    fullPage: true,
    style: "nextjs-portal{visibility:hidden}",
  });
}
for (const viewport of [
  { width: 1366, height: 900 },
  { width: 1024, height: 768 },
]) {
  test(`library-journey ${viewport.width} 真实读写、整理与项目引用`, async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(600000);
    page.setDefaultTimeout(120000);
    page.setDefaultNavigationTimeout(180000);
    await page.setViewportSize(viewport);
    const group = await op(page, "accountGroups.create", {
      body: {
        name: "书架读写验收",
        idempotencyKey: `library-${viewport.width}-${Date.now()}`,
      },
    });
    const other = await op(page, "accountGroups.create", {
      body: {
        name: "另一工作区",
        idempotencyKey: `other-${viewport.width}-${Date.now()}`,
      },
    });
    await page
      .context()
      .addCookies([
        { name: "creatoros_current_group", value: group.id, url: baseURL! },
      ]);
    await page.addInitScript((id) => {
      if (!localStorage.getItem("creatoros:current-group"))
        localStorage.setItem("creatoros:current-group", id);
      localStorage.removeItem("creatoros:current-account");
      localStorage.setItem("creatoros:onboarding:hidden", "1");
    }, group.id);
    const project = await op(
      page,
      "projects.create",
      { body: { title: "知识库创作验证", brief: "使用已保存原文写稿" } },
      group.id,
    );
    await page.goto("/knowledge");
    const library = page.locator('[data-page="knowledge-library"]');
    await expect(library).toContainText("书架还是空的");
    await capture(page, `empty-${viewport.width}`, ["empty-next"]);
    await library
      .getByRole("button", { name: "添加资料", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await expect(
      library.getByRole("button", { name: "添加资料", exact: true }),
    ).toBeFocused();
    await library
      .getByRole("button", { name: "添加资料", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await expect(
      library.getByRole("button", { name: "添加资料", exact: true }),
    ).toBeFocused();
    await library
      .getByRole("button", { name: "添加资料", exact: true })
      .click();
    await dialog
      .getByRole("textbox", { name: "资料标题", exact: true })
      .fill("用户访谈与课程定价");
    const original =
      "访谈记录：先保留完整原文，再整理观点。\n\n这份资料讨论课程定价与用户需求。\n第二段需要完整保存。";
    await dialog
      .getByRole("textbox", { name: "完整原文", exact: true })
      .fill(original);
    await dialog
      .getByRole("textbox", { name: "出处（可选）" })
      .fill("本周用户访谈");
    // 真实写入成功后只让读回断网，重试必须读同一ID，不能再次创建。
    let releaseCreate!: () => void;
    const createHeld = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    let markCreate!: () => void;
    const createArrived = new Promise<void>((resolve) => {
      markCreate = resolve;
    });
    const saveRecovery = async (route: import("@playwright/test").Route) => {
      const request = route.request().postDataJSON();
      if (request.id === "knowledge.create") {
        const response = await route.fetch({ timeout: 120000 });
        markCreate();
        await createHeld;
        await route.fulfill({ response });
      } else if (request.id === "knowledge.list") await route.abort("failed");
      else await route.continue();
    };
    await page.route("**/api/v1/dispatch", saveRecovery);
    await dialog.getByRole("button", { name: "保存资料", exact: true }).click();
    await createArrived;
    await expect(
      dialog.locator('[data-slot="knowledge-file-import"]'),
    ).toBeDisabled();
    await expect(
      dialog.locator('[data-slot="knowledge-file-input"]'),
    ).toBeDisabled();
    releaseCreate();
    await expect(
      dialog.getByRole("button", { name: "重新读取已保存资料" }),
    ).toBeEnabled();
    await expect(
      dialog.getByRole("textbox", { name: "资料标题", exact: true }),
    ).toBeDisabled();
    await page.unroute("**/api/v1/dispatch", saveRecovery);
    await dialog.getByRole("button", { name: "重新读取已保存资料" }).click();
    await expect(dialog).toHaveCount(0);
    const afterRecovery = await op(
      page,
      "knowledge.list",
      { query: { page: 1, pageSize: 100 } },
      group.id,
    );
    expect(
      afterRecovery.filter(
        (x: { title: string }) => x.title === "用户访谈与课程定价",
      ),
    ).toHaveLength(1);
    await expect(
      library.getByRole("region", { name: "资料原文" }),
    ).toContainText("第二段需要完整保存");
    const id = new URL(page.url()).searchParams.get("item")!;
    witnesses.push({ id, role: "primary-knowledge" });
    await page.reload();
    await expect(page.getByRole("region", { name: "资料原文" })).toContainText(
      "第二段需要完整保存",
    );
    const current = await op(
      page,
      "knowledge.get",
      { params: { knowledgeId: id } },
      group.id,
    );
    const revs = await op(
      page,
      "knowledge.revisions.list",
      { params: { knowledgeId: id } },
      group.id,
    );
    expect(
      revs.find((r: { id: string }) => r.id === current.currentRevisionId)
        .content,
    ).toBe(original);
    await page.getByRole("button", { name: "编辑原文", exact: true }).click();
    await page
      .getByRole("textbox", { name: "编辑完整原文" })
      .fill(original + "\n\n补充：定价要经过验证。");
    await page.getByRole("button", { name: "保存新版本" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "资料原文" })).toContainText(
      "定价要经过验证",
    );
    expect(
      await op(
        page,
        "knowledge.revisions.list",
        { params: { knowledgeId: id } },
        group.id,
      ),
    ).toHaveLength(2);
    await capture(page, `reader-${viewport.width}`, ["write-read", "detail"]);
    await page.getByRole("button", { name: "新建文件夹", exact: true }).click();
    await page.getByRole("textbox", { name: "文件夹名称" }).fill("用户研究");
    await page.getByRole("button", { name: "创建文件夹", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const folders = await op(page, "knowledge.folders.list", {}, group.id);
    const folder = folders.find((f: { name: string }) => f.name === "用户研究");
    await page
      .getByRole("region", { name: "资料原文" })
      .getByLabel("更多资料操作")
      .click();
    await page.getByLabel("移动到文件夹").selectOption(folder.id);
    await expect(page.getByRole("status")).toContainText("已更新文件夹");
    expect(
      (
        await op(
          page,
          "knowledge.get",
          { params: { knowledgeId: id } },
          group.id,
        )
      ).folderId,
    ).toBe(folder.id);
    await expect(page.getByRole("button", { name: "编辑原文" })).toBeEnabled();
    const second = await op(
      page,
      "knowledge.create",
      {
        body: {
          title: "产品案例与上线记录",
          content: "这是第二份真实资料。",
          knowledgeType: "note",
        },
      },
      group.id,
    );
    witnesses.push({ id: second.id, role: "secondary-knowledge" });
    await page.reload();
    await page
      .getByRole("navigation", { name: "资料分类" })
      .getByRole("button", { name: /^笔记/ })
      .click();
    await expect(page.getByRole("region", { name: "资料列表" })).toContainText(
      "产品案例与上线记录",
    );
    await expect(
      page.getByRole("region", { name: "资料原文" }),
    ).not.toContainText("用户访谈与课程定价");
    await page
      .getByRole("region", { name: "资料列表" })
      .getByRole("button", { name: /产品案例与上线记录/ })
      .click();
    await expect(page.getByRole("region", { name: "资料原文" })).toContainText(
      "第二份真实资料",
    );
    await capture(page, `selection-${viewport.width}`, [
      "collection",
      "selection",
      "detail",
    ]);
    await page.goBack();
    await expect(page.getByRole("region", { name: "资料原文" })).toContainText(
      "选择一份资料",
    );
    await page.goForward();
    await expect(page.getByRole("region", { name: "资料原文" })).toContainText(
      "第二份真实资料",
    );
    await page
      .getByRole("textbox", { name: "搜索资料标题" })
      .fill("没有这样的标题");
    await expect(page.getByRole("region", { name: "资料列表" })).toContainText(
      "没有匹配的资料",
    );
    await expect(
      page.getByRole("region", { name: "资料原文" }),
    ).not.toContainText("第二份真实资料");
    await page.getByRole("button", { name: "清除筛选" }).click();
    // 真实请求延迟，观察加载；使用原响应，不合成正文。
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let intercepted = false;
    await page.route("**/api/v1/dispatch", async (route) => {
      if (
        !intercepted &&
        route.request().postDataJSON()?.id === "knowledge.get"
      ) {
        intercepted = true;
        const response = await route.fetch({ timeout: 120000 });
        await gate;
        await route.fulfill({ response });
      } else await route.continue();
    });
    await page
      .getByRole("region", { name: "资料列表" })
      .getByRole("button", { name: /用户访谈与课程定价/ })
      .click();
    await expect(page.getByRole("region", { name: "资料原文" })).toContainText(
      "正在加载内容",
    );
    release();
    await expect(page.getByRole("region", { name: "资料原文" })).toContainText(
      "定价要经过验证",
    );
    await page.unroute("**/api/v1/dispatch");
    // 临时网络故障，正文失败可原地重读，不伪造成功结果。
    let fail = true;
    await page.route("**/api/v1/dispatch", async (route) => {
      if (
        fail &&
        route.request().postDataJSON()?.id === "knowledge.get" &&
        route.request().postDataJSON()?.input?.params?.knowledgeId === second.id
      ) {
        await route.abort("failed");
      } else await route.continue();
    });
    await page
      .getByRole("region", { name: "资料列表" })
      .getByRole("button", { name: /产品案例与上线记录/ })
      .click();
    await expect(
      page.getByRole("region", { name: "资料原文" }).getByRole("alert"),
    ).toBeVisible();
    await capture(page, `error-${viewport.width}`, ["detail"]);
    await page.unroute("**/api/v1/dispatch");
    await page.getByRole("button", { name: "重新读取正文" }).click();
    await expect(page.getByRole("region", { name: "资料原文" })).toContainText(
      "第二份真实资料",
    );
    await page
      .getByRole("region", { name: "资料列表" })
      .getByRole("button", { name: /用户访谈与课程定价/ })
      .click();
    await expect(page.getByRole("button", { name: "编辑原文" })).toBeEnabled();
    // 弹窗期间浏览器返回不能将A草稿写到B，变更选择后关闭编辑。
    await page.getByRole("button", { name: "编辑原文", exact: true }).click();
    await page
      .getByRole("textbox", { name: "编辑完整原文" })
      .fill("不能写到另一份资料的未保存草稿");
    await page.goBack();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const untouched = await op(
      page,
      "knowledge.revisions.list",
      { params: { knowledgeId: second.id } },
      group.id,
    );
    expect(untouched).toHaveLength(1);
    expect(untouched[0].content).toBe("这是第二份真实资料。");
    await page.goForward();
    await expect(
      page.getByRole("button", { name: "编辑原文", exact: true }),
    ).toBeEnabled();
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.getByRole("button", { name: "用到项目", exact: true }).click();
      await page.getByLabel("选择项目").selectOption(project.id);
      await page.getByRole("button", { name: "确认引用" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    const links = await op(
      page,
      "materialLinks.list",
      { query: { projectId: project.id, page: 1, pageSize: 100 } },
      group.id,
    );
    expect(
      links.filter((x: { entityId: string }) => x.entityId === id),
    ).toHaveLength(1);
    await capture(page, `reference-${viewport.width}`, ["reference"]);
    await page
      .getByRole("link", { name: /进入「知识库创作验证」写稿/ })
      .click();
    await expect(
      page.getByRole("button", { name: "预览 用户访谈与课程定价" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "预览 用户访谈与课程定价" }).click();
    await expect(page.getByRole("dialog")).toContainText("定价要经过验证");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "关闭", exact: true })
      .click();
    await page.goBack();
    await expect(page.locator('[data-page="knowledge-library"]')).toBeVisible();
    await page.getByRole("button", { name: "添加资料", exact: true }).click();
    await page.locator('[data-slot="knowledge-file-input"]').setInputFiles({
      name: "访谈原文.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# 访谈原文\n\n原文件与完整正文一起保存。"),
    });
    await page
      .locator('[data-slot="knowledge-import-confirm-dialog"]')
      .getByRole("button", { name: /开始导入|确认导入/ })
      .click();
    await expect(
      page.locator('[data-slot="knowledge-import-result-dialog"]'),
    ).toContainText("1");
    await page
      .locator('[data-slot="knowledge-import-result-dialog"]')
      .getByRole("button", { name: "知道了" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "关闭", exact: true })
      .click();
    await page.reload();
    await page
      .getByRole("region", { name: "资料列表" })
      .getByRole("button", { name: /访谈原文.md/ })
      .click();
    await expect(page.getByRole("region", { name: "资料原文" })).toContainText(
      "原文件与完整正文一起保存",
    );
    await expect(page.getByRole("link", { name: "查看原文件" })).toBeVisible();
    const sourceFile = await page
      .getByRole("link", { name: "查看原文件" })
      .getAttribute("href");
    expect(sourceFile).toBeTruthy();
    const bytes = await page.request.get(sourceFile!, { timeout: 120000 });
    expect(bytes.ok()).toBe(true);
    expect(await bytes.text()).toContain("原文件与完整正文一起保存");
    const importedId = new URL(page.url()).searchParams.get("item")!;
    const imported = await op(
      page,
      "knowledge.get",
      { params: { knowledgeId: importedId } },
      group.id,
    );
    expect(imported.assetId).toBeTruthy();
    await capture(page, `import-${viewport.width}`, ["import", "organize"]);
    // 越界和未知软引用由后台拒绝；隔离组仍是空库。
    for (const body of [
      { title: "越界", folderId: folder.id },
      { title: "未知", folderId: "missing-folder" },
      { title: "越界文件", assetId: imported.assetId },
    ]) {
      const bad = await page.request.post("/api/v1/dispatch", {
        timeout: 120000,
        headers: { "x-group-id": other.id },
        data: { id: "knowledge.create", input: { body } },
      });
      expect(bad.status()).toBe(404);
    }
    expect(
      await op(
        page,
        "knowledge.list",
        { query: { page: 1, pageSize: 100 } },
        other.id,
      ),
    ).toHaveLength(0);
    // 归档保留原文及版本，不物理删除。
    await page
      .getByRole("region", { name: "资料原文" })
      .getByLabel("更多资料操作")
      .click();
    await page.getByRole("menuitem", { name: "归档资料" }).click();
    await page.getByRole("button", { name: "确认归档" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(
      (
        await op(
          page,
          "knowledge.get",
          { params: { knowledgeId: importedId } },
          group.id,
        )
      ).status,
    ).toBe("archived");
    await page
      .getByRole("region", { name: "资料列表" })
      .getByRole("button", { name: /用户访谈与课程定价/ })
      .click();
    await expect(page.getByRole("region", { name: "资料原文" })).toContainText(
      "定价要经过验证",
    );
    await capture(page, `final-${viewport.width}`);
    if (viewport.width === 1366) {
      const historical = [] as { id: string }[];
      for (let start = 0; start < 205; start += 5) {
        historical.push(
          ...(await Promise.all(
            Array.from({ length: Math.min(5, 205 - start) }, (_, n) =>
              op(
                page,
                "knowledge.create",
                {
                  body: {
                    title: `历史资料 ${String(start + n + 1).padStart(3, "0")}`,
                    knowledgeType: "note",
                    content: "历史资料的完整正文仍需可访问。",
                  },
                },
                group.id,
              ),
            ),
          )),
        );
      }
      const complete = await op(
        page,
        "knowledge.list",
        { query: { page: 1, pageSize: 100 } },
        group.id,
      );
      expect(
        complete.filter((x: { status: string }) => x.status === "active"),
      ).toHaveLength(207);
      expect(new Set(complete.map((x: { id: string }) => x.id)).size).toBe(
        complete.length,
      );
      await page.reload();
      await expect(
        page.getByRole("region", { name: "资料列表" }),
      ).toContainText("207 份");
      expect(
        await page
          .getByRole("region", { name: "资料列表" })
          .getByRole("button", { name: /历史资料/ })
          .count(),
      ).toBeLessThanOrEqual(20);
      for (let start = 0; start < 101; start += 5)
        await Promise.all(
          historical
            .slice(start, start + 5)
            .filter((_, n) => start + n < 101)
            .map((k) =>
              op(
                page,
                "materialLinks.create",
                {
                  body: {
                    projectId: project.id,
                    entityType: "knowledge",
                    entityId: k.id,
                    role: "reference",
                    stage: "research",
                    addedByType: "user",
                  },
                },
                group.id,
              ),
            ),
        );
      await page.goto(`/projects/${project.id}`);
      await expect(
        page.getByRole("navigation", { name: "项目资料分页" }),
      ).toContainText("102 份");
      for (let step = 0; step < 8; step++)
        await page.getByRole("button", { name: "下一页项目资料" }).click();
      await page
        .getByRole("button", { name: "预览 用户访谈与课程定价" })
        .click();
      await expect(page.getByRole("dialog")).toContainText("定价要经过验证");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "关闭", exact: true })
        .click();
      await page.goto(`/knowledge?item=${id}`);
      await expect(
        page.getByRole("region", { name: "资料原文" }),
      ).toContainText("定价要经过验证");
      await capture(page, "large-collection-1366", checks);
    }
    // 切组事件立即卸载旧正文和草稿，刷新从新scope读取。
    await page.getByRole("button", { name: "编辑原文" }).click();
    await page
      .getByRole("textbox", { name: "编辑完整原文" })
      .fill("切组前尚未保存的草稿");
    await page.evaluate((id) => {
      localStorage.setItem("creatoros:current-group", id);
      document.cookie = `creatoros_current_group=${id}; Path=/`;
      window.dispatchEvent(
        new CustomEvent("creatoros:accounts-changed", {
          detail: { groupId: id },
        }),
      );
    }, other.id);
    await expect(
      page.getByRole("textbox", { name: "编辑完整原文" }),
    ).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("定价要经过验证");
    await page.reload();
    await expect(page.locator("[data-page=knowledge-library]")).toContainText(
      "书架还是空的",
    );
    await page.evaluate((id) => {
      localStorage.setItem("creatoros:current-group", id);
      document.cookie = `creatoros_current_group=${id}; Path=/`;
    }, group.id);
    await page.reload();
    // 附加长标题与多段原文，均由真实服务保存。
    if (viewport.width === 1024) {
      const longTitle =
        "用户访谈：为什么整理资料时会丢失上下文，以及产品上线以后怎样验证用户需求";
      const reading = await op(
        page,
        "knowledge.create",
        {
          body: {
            title: longTitle,
            knowledgeType: "reference",
            content:
              "访谈日期：本周\n\n受访者：独立内容创作者\n\n采访者：你通常怎样保存资料？\n受访者：我希望原文和出处保留在一起。\n\n采访者：找到原文后会做什么？\n受访者：修改笔记，把它引用到当前项目继续写稿。",
          },
        },
        group.id,
      );
      await page.goto(`/knowledge?item=${reading.id}`);
      await expect(
        page.getByRole("heading", { name: longTitle, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("region", { name: "资料原文" }),
      ).toContainText("引用到当前项目继续写稿");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(1024);
      await capture(page, "long-title-1024", checks);
      await page.setViewportSize({ width: 1366, height: 900 });
      await capture(page, "long-title-1366", checks);

      await page.setViewportSize({ width: 390, height: 844 });
      await expect(
        page.getByRole("button", { name: "添加资料", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("navigation", { name: "资料分类" }),
      ).toBeHidden();
      await page.getByRole("button", { name: /^资料目录/ }).click();
      await expect(
        page.getByRole("navigation", { name: "资料分类" }),
      ).toBeVisible();
      await page.getByRole("button", { name: /^资料目录/ }).click();
      await capture(page, "extreme-390", checks);
      await page.setViewportSize(viewport);
    }
  });
}
test.afterAll(() => {
  mkdirSync(evidence, { recursive: true });
  const commit_sha = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  writeFileSync(
    resolve(evidence, "visible-copy.json"),
    JSON.stringify(
      {
        schema: "frontend-visible-copy/v1",
        task_id: "T-1075",
        commit_sha,
        observed_at: new Date().toISOString(),
        captures,
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(
    resolve(evidence, "journey-observations.json"),
    JSON.stringify(
      {
        commit_sha,
        witnesses,
        observed_at: new Date().toISOString(),
        data_mode: "non-fixture",
      },
      null,
      2,
    ) + "\n",
  );
});
