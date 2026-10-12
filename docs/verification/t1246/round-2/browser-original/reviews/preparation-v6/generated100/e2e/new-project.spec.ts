import type { BrowserContext, Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { expect, test } from "../helpers/test-environment";

type Group = { id: string; name: string };
type Scope = { groupId?: string };
type DispatchInput = { params?: unknown; query?: unknown; body?: unknown };

async function dispatch<T>(
  page: Page,
  id: string,
  input: DispatchInput,
  scope: Scope = {},
): Promise<T> {
  const response = await page.request.post("/api/v1/dispatch", {
    timeout: 120_000,
    headers: {
      "content-type": "application/json",
      ...(scope.groupId ? { "x-group-id": scope.groupId } : {}),
    },
    data: { id, input },
  });
  expect(response.ok(), `${id}: ${response.status()} ${await response.text()}`).toBe(true);
  return ((await response.json()) as { data: T }).data;
}

async function createAndSelectGroup(
  page: Page,
  context: BrowserContext,
  baseURL: string | undefined,
  label: string,
): Promise<Group> {
  const groupName = `${label}-${randomUUID().slice(0, 8)}`;
  const group = await dispatch<Group>(page, "accountGroups.create", {
    body: { name: groupName, idempotencyKey: randomUUID() },
  });

  const cookieURL = baseURL ?? "http://127.0.0.1";
  await context.addCookies([
    { name: "creatoros_current_group", value: encodeURIComponent(group.id), url: cookieURL },
    { name: "creatoros_current_account", value: "", url: cookieURL },
  ]);
  await page.addInitScript((groupId) => {
    window.localStorage.setItem("creatoros:current-group", groupId);
    window.localStorage.removeItem("creatoros:current-account");
  }, group.id);
  return group;
}

async function openNewProjectDialog(page: Page, group: Group) {
  await page.goto("/");
  await expect(page.getByTestId("account-switcher-trigger")).toHaveAttribute(
    "aria-label",
    `当前账号组：${group.name}`,
  );
  await page.getByRole("link", { name: /新建项目/ }).click();
  await expect(page).toHaveURL(/\/projects\/new$/);
  const dialog = page.getByRole("dialog", { name: "新建项目" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function expectCreatedProject(
  page: Page,
  group: Group,
  title: string,
  expectedTypes: string[],
) {
  await page.waitForURL((url) => {
    const pathname = decodeURIComponent(url.pathname);
    const segments = pathname.split("/").filter(Boolean);
    return segments.length === 2 && segments[0] === "projects" && segments[1] !== "new";
  });
  const pathname = decodeURIComponent(new URL(page.url()).pathname);
  const segments = pathname.split("/").filter(Boolean);
  expect(segments).toHaveLength(2);
  expect(segments[0]).toBe("projects");
  expect(segments[1]).not.toBe("new");
  const projectId = segments[1]!;

  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("dialog", { name: "新建项目" })).toHaveCount(0);

  const project = await dispatch<{ id: string; title: string }>(
    page,
    "projects.get",
    { params: { projectId }, query: undefined, body: undefined },
    { groupId: group.id },
  );
  expect(project).toMatchObject({ id: projectId, title });
  const outputs = await dispatch<Array<{ id: string; projectId: string; contentType: string }>>(
    page,
    "projects.outputs.list",
    { params: { projectId }, query: undefined, body: undefined },
    { groupId: group.id },
  );
  expect(outputs.every((output) => output.projectId === projectId)).toBe(true);
  expect(outputs.map((output) => output.contentType).sort()).toEqual([...expectedTypes].sort());
}

test.describe("New Project dialog", () => {
  test("opens from the dashboard, follows the current form contract, and creates selected formats", async ({
    page,
    context,
    baseURL,
  }) => {
    const group = await createAndSelectGroup(page, context, baseURL, "new-project-form");
    const dialog = await openNewProjectDialog(page, group);

    const sections = dialog.locator("[data-form-section]");
    await expect(sections).toHaveCount(2);
    expect(
      await sections.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-section")),
      ),
    ).toEqual(["name", "brief"]);

    const title = `当前表单多格式-${randomUUID().slice(0, 8)}`;
    const name = dialog.getByRole("textbox", { name: "作品主题", exact: true });
    const create = dialog.getByRole("button", { name: "创建", exact: true });
    const article = dialog.getByRole("checkbox", { name: /^文章/ });
    const image = dialog.getByRole("checkbox", { name: /^图文/ });
    const video = dialog.getByRole("checkbox", { name: /^视频/ });

    await expect(name).toBeVisible();
    await expect(create).toBeDisabled();
    await name.fill(title);
    await dialog.getByRole("textbox", { name: "一句话描述", exact: true }).fill("真实 UI 创建回读的隔离验收。");
    await expect(create).toBeEnabled();

    await expect(video).toBeChecked();
    await article.check();
    await expect(article).toBeChecked();
    await expect(video).toBeChecked();
    await video.uncheck();
    await image.check();
    await expect(article).toBeChecked();
    await expect(image).toBeChecked();
    await expect(video).not.toBeChecked();

    await create.click();
    await expectCreatedProject(page, group, title, ["article", "image"]);
  });

  test("creates and enters the new project workspace when requested", async ({
    page,
    context,
    baseURL,
  }) => {
    const group = await createAndSelectGroup(page, context, baseURL, "new-project-workspace");
    const dialog = await openNewProjectDialog(page, group);
    const title = `工作区创建-${randomUUID().slice(0, 8)}`;

    await dialog.getByRole("textbox", { name: "作品主题", exact: true }).fill(title);
    const article = dialog.getByRole("checkbox", { name: /^文章/ });
    const image = dialog.getByRole("checkbox", { name: /^图文/ });
    const video = dialog.getByRole("checkbox", { name: /^视频/ });
    await expect(video).toBeChecked();
    await article.check();
    await image.check();
    await expect(article).toBeChecked();
    await expect(image).toBeChecked();
    await expect(video).toBeChecked();
    await expect(dialog.getByRole("checkbox", { name: "创建后进入工作区" })).toBeChecked();

    await dialog.getByRole("button", { name: "创建", exact: true }).click();
    await expectCreatedProject(page, group, title, ["article", "image", "video"]);
  });
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 51060000 });
