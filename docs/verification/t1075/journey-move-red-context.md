# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/knowledge-library.spec.ts >> library-journey 1366 真实读写、整理与项目引用
- Location: tests/e2e/knowledge-library.spec.ts:53:7

# Error details

```
Error: expect(locator).toBeEnabled() failed

Locator: getByRole('button', { name: '编辑原文' })
Expected: enabled
Timeout: 120000ms
Error: element(s) not found

Call log:
  - Expect "toBeEnabled" with timeout 120000ms
  - waiting for getByRole('button', { name: '编辑原文' })

```

```yaml
- main:
  - status: 已更新文件夹
- menu "更多资料操作":
  - text: 放入文件夹
  - combobox "移动到文件夹":
    - option "未放入文件夹"
    - option "用户研究" [selected]
  - menuitem "AI 提炼"
  - menuitem "归档资料"
```

# Test source

```ts
  137 |         await createHeld;
  138 |         await route.fulfill({ response });
  139 |       } else if (request.id === "knowledge.list") await route.abort("failed");
  140 |       else await route.continue();
  141 |     };
  142 |     await page.route("**/api/v1/dispatch", saveRecovery);
  143 |     await dialog.getByRole("button", { name: "保存资料", exact: true }).click();
  144 |     await createArrived;
  145 |     await expect(
  146 |       dialog.locator('[data-slot="knowledge-file-import"]'),
  147 |     ).toBeDisabled();
  148 |     await expect(
  149 |       dialog.locator('[data-slot="knowledge-file-input"]'),
  150 |     ).toBeDisabled();
  151 |     releaseCreate();
  152 |     await expect(
  153 |       dialog.getByRole("button", { name: "重新读取已保存资料" }),
  154 |     ).toBeEnabled();
  155 |     await expect(
  156 |       dialog.getByRole("textbox", { name: "资料标题", exact: true }),
  157 |     ).toBeDisabled();
  158 |     await page.unroute("**/api/v1/dispatch", saveRecovery);
  159 |     await dialog.getByRole("button", { name: "重新读取已保存资料" }).click();
  160 |     await expect(dialog).toHaveCount(0);
  161 |     const afterRecovery = await op(
  162 |       page,
  163 |       "knowledge.list",
  164 |       { query: { page: 1, pageSize: 100 } },
  165 |       group.id,
  166 |     );
  167 |     expect(
  168 |       afterRecovery.filter(
  169 |         (x: { title: string }) => x.title === "用户访谈与课程定价",
  170 |       ),
  171 |     ).toHaveLength(1);
  172 |     await expect(
  173 |       library.getByRole("region", { name: "资料原文" }),
  174 |     ).toContainText("第二段需要完整保存");
  175 |     const id = new URL(page.url()).searchParams.get("item")!;
  176 |     witnesses.push({ id, role: "primary-knowledge" });
  177 |     await page.reload();
  178 |     await expect(page.getByRole("region", { name: "资料原文" })).toContainText(
  179 |       "第二段需要完整保存",
  180 |     );
  181 |     const current = await op(
  182 |       page,
  183 |       "knowledge.get",
  184 |       { params: { knowledgeId: id } },
  185 |       group.id,
  186 |     );
  187 |     const revs = await op(
  188 |       page,
  189 |       "knowledge.revisions.list",
  190 |       { params: { knowledgeId: id } },
  191 |       group.id,
  192 |     );
  193 |     expect(
  194 |       revs.find((r: { id: string }) => r.id === current.currentRevisionId)
  195 |         .content,
  196 |     ).toBe(original);
  197 |     await page.getByRole("button", { name: "编辑原文", exact: true }).click();
  198 |     await page
  199 |       .getByRole("textbox", { name: "编辑完整原文" })
  200 |       .fill(original + "\n\n补充：定价要经过验证。");
  201 |     await page.getByRole("button", { name: "保存新版本" }).click();
  202 |     await expect(page.getByRole("dialog")).toHaveCount(0);
  203 |     await expect(page.getByRole("region", { name: "资料原文" })).toContainText(
  204 |       "定价要经过验证",
  205 |     );
  206 |     expect(
  207 |       await op(
  208 |         page,
  209 |         "knowledge.revisions.list",
  210 |         { params: { knowledgeId: id } },
  211 |         group.id,
  212 |       ),
  213 |     ).toHaveLength(2);
  214 |     await capture(page, `reader-${viewport.width}`, ["write-read", "detail"]);
  215 |     await page.getByRole("button", { name: "新建文件夹", exact: true }).click();
  216 |     await page.getByRole("textbox", { name: "文件夹名称" }).fill("用户研究");
  217 |     await page.getByRole("button", { name: "创建文件夹", exact: true }).click();
  218 |     await expect(page.getByRole("dialog")).toHaveCount(0);
  219 |     const folders = await op(page, "knowledge.folders.list", {}, group.id);
  220 |     const folder = folders.find((f: { name: string }) => f.name === "用户研究");
  221 |     await page
  222 |       .getByRole("region", { name: "资料原文" })
  223 |       .getByLabel("更多资料操作")
  224 |       .click();
  225 |     await page.getByLabel("移动到文件夹").selectOption(folder.id);
  226 |     await expect(page.getByRole("status")).toContainText("已更新文件夹");
  227 |     expect(
  228 |       (
  229 |         await op(
  230 |           page,
  231 |           "knowledge.get",
  232 |           { params: { knowledgeId: id } },
  233 |           group.id,
  234 |         )
  235 |       ).folderId,
  236 |     ).toBe(folder.id);
> 237 |     await expect(page.getByRole("button", { name: "编辑原文" })).toBeEnabled();
      |                                                              ^ Error: expect(locator).toBeEnabled() failed
  238 |     const second = await op(
  239 |       page,
  240 |       "knowledge.create",
  241 |       {
  242 |         body: {
  243 |           title: "产品案例与上线记录",
  244 |           content: "这是第二份真实资料。",
  245 |           knowledgeType: "note",
  246 |         },
  247 |       },
  248 |       group.id,
  249 |     );
  250 |     witnesses.push({ id: second.id, role: "secondary-knowledge" });
  251 |     await page.reload();
  252 |     await page
  253 |       .getByRole("navigation", { name: "资料分类" })
  254 |       .getByRole("button", { name: /^笔记/ })
  255 |       .click();
  256 |     await expect(page.getByRole("region", { name: "资料列表" })).toContainText(
  257 |       "产品案例与上线记录",
  258 |     );
  259 |     await expect(
  260 |       page.getByRole("region", { name: "资料原文" }),
  261 |     ).not.toContainText("用户访谈与课程定价");
  262 |     await page
  263 |       .getByRole("region", { name: "资料列表" })
  264 |       .getByRole("button", { name: /产品案例与上线记录/ })
  265 |       .click();
  266 |     await expect(page.getByRole("region", { name: "资料原文" })).toContainText(
  267 |       "第二份真实资料",
  268 |     );
  269 |     await capture(page, `selection-${viewport.width}`, [
  270 |       "collection",
  271 |       "selection",
  272 |       "detail",
  273 |     ]);
  274 |     await page.goBack();
  275 |     await expect(page.getByRole("region", { name: "资料原文" })).toContainText(
  276 |       "选择一份资料",
  277 |     );
  278 |     await page.goForward();
  279 |     await expect(page.getByRole("region", { name: "资料原文" })).toContainText(
  280 |       "第二份真实资料",
  281 |     );
  282 |     await page
  283 |       .getByRole("textbox", { name: "搜索资料标题" })
  284 |       .fill("没有这样的标题");
  285 |     await expect(page.getByRole("region", { name: "资料列表" })).toContainText(
  286 |       "没有匹配的资料",
  287 |     );
  288 |     await expect(
  289 |       page.getByRole("region", { name: "资料原文" }),
  290 |     ).not.toContainText("第二份真实资料");
  291 |     await page.getByRole("button", { name: "清除筛选" }).click();
  292 |     // 真实请求延迟，观察加载；使用原响应，不合成正文。
  293 |     let release!: () => void;
  294 |     const gate = new Promise<void>((resolve) => {
  295 |       release = resolve;
  296 |     });
  297 |     let intercepted = false;
  298 |     await page.route("**/api/v1/dispatch", async (route) => {
  299 |       if (
  300 |         !intercepted &&
  301 |         route.request().postDataJSON()?.id === "knowledge.get"
  302 |       ) {
  303 |         intercepted = true;
  304 |         const response = await route.fetch({ timeout: 120000 });
  305 |         await gate;
  306 |         await route.fulfill({ response });
  307 |       } else await route.continue();
  308 |     });
  309 |     await page
  310 |       .getByRole("region", { name: "资料列表" })
  311 |       .getByRole("button", { name: /用户访谈与课程定价/ })
  312 |       .click();
  313 |     await expect(page.getByRole("region", { name: "资料原文" })).toContainText(
  314 |       "正在加载内容",
  315 |     );
  316 |     release();
  317 |     await expect(page.getByRole("region", { name: "资料原文" })).toContainText(
  318 |       "定价要经过验证",
  319 |     );
  320 |     await page.unroute("**/api/v1/dispatch");
  321 |     // 临时网络故障，正文失败可原地重读，不伪造成功结果。
  322 |     let fail = true;
  323 |     await page.route("**/api/v1/dispatch", async (route) => {
  324 |       if (
  325 |         fail &&
  326 |         route.request().postDataJSON()?.id === "knowledge.get" &&
  327 |         route.request().postDataJSON()?.input?.params?.knowledgeId === second.id
  328 |       ) {
  329 |         await route.abort("failed");
  330 |       } else await route.continue();
  331 |     });
  332 |     await page
  333 |       .getByRole("region", { name: "资料列表" })
  334 |       .getByRole("button", { name: /产品案例与上线记录/ })
  335 |       .click();
  336 |     await expect(
  337 |       page.getByRole("region", { name: "资料原文" }).getByRole("alert"),
```