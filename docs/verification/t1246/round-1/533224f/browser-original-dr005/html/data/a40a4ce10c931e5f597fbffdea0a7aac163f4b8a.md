# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/t1159-wechat-native-report.spec.ts >> T1159 两微信账号从组成员进入真实0报告，刷新返回与身份拒绝
- Location: tests-t1246-generated/e2e/t1159-wechat-native-report.spec.ts:22:5

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator: getByRole('link', { name: '查看中性视频号账号的数据', exact: true })
Expected: "/accounts/works?accountId=acct-81b98377-6352"
Timeout: 120000ms
Error: element(s) not found

Call log:
  - Expect "toHaveAttribute" with timeout 120000ms
  - waiting for getByRole('link', { name: '查看中性视频号账号的数据', exact: true })

```

```yaml
- complementary "主侧栏":
  - button "收起侧栏"
  - navigation "主要导航":
    - link "首页":
      - /url: /
    - link "创作者总览":
      - /url: /overview
    - link "定位中心":
      - /url: /positioning
    - link "内容雷达":
      - /url: /intelligence
    - link "选题":
      - /url: /topics
    - link "项目":
      - /url: /projects
    - link "知识库":
      - /url: /knowledge
    - link "素材中心":
      - /url: /assets
    - link "创作画布":
      - /url: /canvases
    - link "发布中心":
      - /url: /publishing
    - link "运营分析":
      - /url: /daily-report
    - link "自动化":
      - /url: /automations
    - link "设置":
      - /url: /settings
  - text: AI 助手
  - paragraph: T1232 中性验收创作者，今天想先做点什么？
  - link "打开 AI 助手":
    - /url: "?copilot=open&scope=global"
  - button "帮助与反馈"
  - button "当前账号组：微信报表入口验收": 当前账号组 微信报表入口验收
  - text: T中 T1232 中性验收创作者 个人版
- banner:
  - text: 账号组与绑定账号
  - paragraph: 管理创作者工作区和各平台账号
- main:
  - heading "账号组与绑定账号" [level=1]
  - paragraph: 同一创作者的内容在一个工作区管理，平台账号分别绑定与分发。
  - complementary:
    - region "账号组":
      - text: 账号组
      - checkbox "显示已归档组"
      - text: 显示已归档组
      - list:
        - listitem:
          - button "@t1022-1 1 个平台账号" [pressed]
        - listitem:
          - button "@t1022-2 1 个平台账号"
        - listitem:
          - button "@t1022-3 1 个平台账号"
        - listitem:
          - button "@t1022-4 1 个平台账号"
        - listitem:
          - button "@t913-1 1 个平台账号"
        - listitem:
          - button "@t913-2 1 个平台账号"
        - listitem:
          - button "@t913-3 1 个平台账号"
        - listitem:
          - button "@t913-4 1 个平台账号"
        - listitem:
          - button "@e2e-t804-1791731607746 1 个平台账号"
        - listitem:
          - button "T1225 画廊甲组 c1457a96-c88d-463c-ae1d-0f8ed99bbec7 0 个平台账号"
        - listitem:
          - button "T1225 画廊甲组 65f7916f-257c-4290-b98d-6f9b81801d78 0 个平台账号"
        - listitem:
          - button "T1225 空画廊乙组 65f7916f-257c-4290-b98d-6f9b81801d78 0 个平台账号"
        - listitem:
          - button "T1225 真实空素材组 bfe7826f-e38b-4c0b-80f6-a4596755fa43 0 个平台账号"
        - listitem:
          - button "@t1074-1791732299848-1366 1 个平台账号"
        - listitem:
          - button "@t1074-1791732304339-1024 1 个平台账号"
        - listitem:
          - button "多媒体任务组-0af1d30b-3311-48c6-9e64-ca5d33dd26d2 4 个平台账号"
        - listitem:
          - button "切组来源组-71ee63df-662b-4885-9c75-e88a680c2148 1 个平台账号"
        - listitem:
          - button "切组目标组-0a2d68ef-57e6-4806-a919-032596c4223a 1 个平台账号"
        - listitem:
          - button "归档历史组-16bb17c2-8ec1-4680-a050-2bc2005edc6e 1 个平台账号"
        - listitem:
          - button "无计划空态组-84e6f6fb-fbca-4b09-bc58-8f8da68fb1dd 1 个平台账号"
        - listitem:
          - button "T1244 无绑定媒体组 t1244-908de3a4-9440-41b5-b16b-ae856a6444d9 1 个平台账号"
        - listitem:
          - button "T1244 隔离组 t1244-1c8e4256-d021-43e2-9e5e-c06d75ea8989 0 个平台账号"
        - listitem:
          - button "@e2e-radar-upgrade-1791732579729 1 个平台账号"
        - listitem:
          - button "T-1231 错组隔离 1791732593823 0 个平台账号"
        - listitem:
          - button "@e2e-t642-reference-1791732597547 1 个平台账号"
        - listitem:
          - button "画布测试组-eb9069b8-c107-4573-91fd-ae5015e676bf 1 个平台账号"
        - listitem:
          - button "@canvas-a-1791732600255 0 个平台账号"
        - listitem:
          - button "画布测试组-41cbf3dd-9602-4571-822d-d2074dc37408 1 个平台账号"
        - listitem:
          - button "@canvas-b-1791732600356 0 个平台账号"
        - listitem:
          - button "画布测试组-704892e6-c176-44fc-baf4-06c3721d3222 1 个平台账号"
        - listitem:
          - button "@canvas-first-1791732619295 0 个平台账号"
        - listitem:
          - button "画布测试组-327b585f-ce3a-480e-92c8-66b012681191 1 个平台账号"
        - listitem:
          - button "@canvas-viewport-1791732630360 0 个平台账号"
        - listitem:
          - button "画布测试组-f3f56f0f-8316-4498-b727-6374bf82763d 1 个平台账号"
        - listitem:
          - button "@canvas-wheel-1791732632609 0 个平台账号"
        - listitem:
          - button "画布测试组-1332d7a4-cc30-4da9-93cd-d6aa657f6a70 1 个平台账号"
        - listitem:
          - button "@canvas-old-1791732634841 0 个平台账号"
        - listitem:
          - button "画布测试组-5febd9e9-8fff-4c8f-a0ce-3db3d5480610 1 个平台账号"
        - listitem:
          - button "@canvas-media-1791732637830 0 个平台账号"
        - listitem:
          - button "画布测试组-2d72f9dd-d68c-4447-96a4-24aaf5477970 1 个平台账号"
        - listitem:
          - button "@canvas-ux-1791732645889 0 个平台账号"
        - listitem:
          - button "画布测试组-31994456-8f96-4bce-bae3-1a7d183158f7 1 个平台账号"
        - listitem:
          - button "@canvas-ux-conflict-1791732661309 0 个平台账号"
        - listitem:
          - button "画布测试组-f9b2b61d-7cec-43cc-a3e2-83f4942635b7 1 个平台账号"
        - listitem:
          - button "@canvas-result-1791732663842 0 个平台账号"
        - listitem:
          - button "画布测试组-9e5cb482-7a23-4a4d-8c78-a0773fd7e304 1 个平台账号"
        - listitem:
          - button "@home-1791732667257 0 个平台账号"
        - listitem:
          - button "画布测试组-e49e138c-3b75-4a8e-b0ee-e6834ab14d4e 1 个平台账号"
        - listitem:
          - button "@asset-home-1791732673815 0 个平台账号"
        - listitem:
          - button "创作验收组 1 个平台账号"
        - listitem:
          - button "创作验收账号 0 个平台账号"
        - listitem:
          - button "创作验收组 1 个平台账号"
        - listitem:
          - button "创作验收账号 0 个平台账号"
        - listitem:
          - button "@e2e-t853-preview-1791732743728 1 个平台账号"
        - listitem:
          - button "T1234 技能选择锚组 0 个平台账号"
        - listitem:
          - button "T1234 空账号组 A 0 个平台账号"
        - listitem:
          - button "T1234 保存锚组 9da3186c-ea83-4196-8966-cb0ce56eec9b 0 个平台账号"
        - listitem:
          - button "T1234 保存组 B 8530b35b-5e0d-479d-97a5-27a9468817b6 0 个平台账号"
        - listitem:
          - button "T1234 CAS 锚组 33fb384a-3f18-429e-b9d3-bbf5f4a1c268 0 个平台账号"
        - listitem:
          - button "T1234 CAS 组 A 4c668d58-e690-4d23-b8ff-eedcaf51cc40 0 个平台账号"
        - listitem:
          - button "T1234 延迟锚组 2d49a9c1-b356-4360-907d-ad681f72832c 0 个平台账号"
        - listitem:
          - button "T1234 延迟组 A 83df9433-8aa7-476f-8eea-fdcbb4b93784 0 个平台账号"
        - listitem:
          - button "T1234 延迟组 B 5e2ae284-3ec3-4cf9-a17e-15366972228d 0 个平台账号"
        - listitem:
          - button "T1234 回滚锚组 5cc5aa0f-19e6-4309-a5de-2dcf709be1c0 0 个平台账号"
        - listitem:
          - button "T1234 回滚默认组 A f4f54a4b-e372-4453-99d5-622ae974b951 0 个平台账号"
        - listitem:
          - button "书架读写验收 0 个平台账号"
        - listitem:
          - button "另一工作区 0 个平台账号"
        - listitem:
          - button "书架读写验收 0 个平台账号"
        - listitem:
          - button "另一工作区 0 个平台账号"
        - listitem:
          - button "new-project-form-f87c5b86 0 个平台账号"
        - listitem:
          - button "new-project-workspace-1250230f 0 个平台账号"
        - listitem:
          - button "E2E作品空目录号 1 个平台账号"
        - listitem:
          - button "e2e-douyin-1791733303994 1 个平台账号"
        - listitem:
          - button "e2e-xiaohongshu-1791733308528 1 个平台账号"
        - listitem:
          - button "页面交互验收-xiaohongshu 1 个平台账号"
        - listitem:
          - button "页面交互验收-kuaishou 1 个平台账号"
        - listitem:
          - button "@e2e-t881-1791733557802 1 个平台账号"
        - listitem:
          - button "@e2e-empty-video-1791733681365 1 个平台账号"
        - listitem:
          - button "@e2e-t599-projects-1791733685212 1 个平台账号"
        - listitem:
          - button "@e2e-t849-publish-1791733694631 1 个平台账号"
        - listitem:
          - button "@e2e-t599-publishing-1791733700130 1 个平台账号"
        - listitem:
          - button "@e2e-publishing-route-1791733824071 1 个平台账号"
        - listitem:
          - button "@e2e-positioning-safety-1791733837833 1 个平台账号"
        - listitem:
          - button "@e2e-source-delete-1791733961662 1 个平台账号"
        - listitem:
          - button "T1239无指标复盘-a4cb743c 0 个平台账号"
        - listitem:
          - button "@e2e-t634-review-1791733974825 1 个平台账号"
        - listitem:
          - button "@e2e-t836-material-1791734243092 1 个平台账号"
        - listitem:
          - button "共享资源验收组 0 个平台账号"
        - listitem:
          - button "首载就绪工作区-e6db7643-7dad-4ed0-a166-9097d2aff18c 0 个平台账号"
        - listitem:
          - button "首同步A-3bdca5c6-a039-43cf-a454-5f6821479ac7 1 个平台账号"
        - listitem:
          - button "首同步B-68fb983d-1c82-4c3f-b982-34996b35847f 0 个平台账号"
        - listitem:
          - button "首同步真实账号-8594ca5c-5fa9-44b2-b25b-d37be1d7886b 0 个平台账号"
        - listitem:
          - button "整页恢复B-8fcff5f0-68b2-4d8d-9246-4ec440411c22 1 个平台账号"
        - listitem:
          - button "恢复真实账号-fa406c56-8885-41e4-baa9-3369ea1a738c 0 个平台账号"
        - listitem:
          - button "中性图库-d3670cae-07c9-44b0-912d-4269e89911e0 0 个平台账号"
        - listitem:
          - button "隔离组-4ceb89e7-5b7c-4567-ba5d-7eca402feade 0 个平台账号"
        - listitem:
          - button "中性视频恢复-0fa218c6-35df-4027-908a-5be9f6047552 0 个平台账号"
        - listitem:
          - button "编导真实UI-a8b940db-de8f-4535-99a5-c967fcf016bf 0 个平台账号"
        - listitem:
          - button "编导真实UI-e20f82fe-6622-4410-95d1-d2c5f471e643 0 个平台账号"
      - text: 新账号组名称
      - textbox "新账号组名称"
      - button "创建账号组" [disabled]
  - region "@t1022-1":
    - text: "@t1022-1 账号组名称"
    - textbox "账号组名称": "@t1022-1"
    - button "保存名称" [disabled]
    - button "进入此账号组"
    - group: 管理账号组
    - link "继续创作 →":
      - /url: /projects
  - region "组内平台账号":
    - text: 组内平台账号 同平台可以登记多个账号，发布时选择具体目标。
    - list:
      - listitem:
        - paragraph: "@t1022-1"
        - paragraph: 抖音 · 身份未验证 · 未自动采集
        - button "转组"
        - group: 账号管理与能力
  - region "平台能力":
    - text: 平台能力 能力来自当前已装配的服务。可用不代表账号已登录，采集结果以真实任务为准。
    - table "各平台能力":
      - rowgroup:
        - row "平台 扫码绑定 自动采集 自动发布 平台草稿 手动登记":
          - columnheader "平台"
          - columnheader "扫码绑定"
          - columnheader "自动采集"
          - columnheader "自动发布"
          - columnheader "平台草稿"
          - columnheader "手动登记"
      - rowgroup:
        - row "抖音 可用 已接入平台登录与真实身份读取 扫码绑定抖音账号 可用 已接入作品与明细采集 暂不可用 尚未接入自动发布 暂不可用 尚未接入平台草稿保存 可用 可登记账号、导出物料与录入真实发布记录":
          - rowheader "抖音"
          - cell "可用 已接入平台登录与真实身份读取 扫码绑定抖音账号":
            - text: 可用
            - paragraph: 已接入平台登录与真实身份读取
            - button "扫码绑定抖音账号" [disabled]
          - cell "可用 已接入作品与明细采集":
            - text: 可用
            - paragraph: 已接入作品与明细采集
          - cell "暂不可用 尚未接入自动发布":
            - text: 暂不可用
            - paragraph: 尚未接入自动发布
          - cell "暂不可用 尚未接入平台草稿保存":
            - text: 暂不可用
            - paragraph: 尚未接入平台草稿保存
          - cell "可用 可登记账号、导出物料与录入真实发布记录":
            - text: 可用
            - paragraph: 可登记账号、导出物料与录入真实发布记录
        - row "快手 可用 已接入平台登录与真实身份读取 扫码绑定快手账号 可用 已接入作品与明细采集 暂不可用 尚未接入自动发布 暂不可用 尚未接入平台草稿保存 可用 可登记账号、导出物料与录入真实发布记录":
          - rowheader "快手"
          - cell "可用 已接入平台登录与真实身份读取 扫码绑定快手账号":
            - text: 可用
            - paragraph: 已接入平台登录与真实身份读取
            - button "扫码绑定快手账号" [disabled]
          - cell "可用 已接入作品与明细采集":
            - text: 可用
            - paragraph: 已接入作品与明细采集
          - cell "暂不可用 尚未接入自动发布":
            - text: 暂不可用
            - paragraph: 尚未接入自动发布
          - cell "暂不可用 尚未接入平台草稿保存":
            - text: 暂不可用
            - paragraph: 尚未接入平台草稿保存
          - cell "可用 可登记账号、导出物料与录入真实发布记录":
            - text: 可用
            - paragraph: 可登记账号、导出物料与录入真实发布记录
        - row "视频号 可用 已接入平台登录与真实身份读取 扫码绑定视频号账号 可用 已接入后台原生报表采集 暂不可用 尚未接入自动发布 暂不可用 尚未接入平台草稿保存 可用 可登记账号、导出物料与录入真实发布记录":
          - rowheader "视频号"
          - cell "可用 已接入平台登录与真实身份读取 扫码绑定视频号账号":
            - text: 可用
            - paragraph: 已接入平台登录与真实身份读取
            - button "扫码绑定视频号账号" [disabled]
          - cell "可用 已接入后台原生报表采集":
            - text: 可用
            - paragraph: 已接入后台原生报表采集
          - cell "暂不可用 尚未接入自动发布":
            - text: 暂不可用
            - paragraph: 尚未接入自动发布
          - cell "暂不可用 尚未接入平台草稿保存":
            - text: 暂不可用
            - paragraph: 尚未接入平台草稿保存
          - cell "可用 可登记账号、导出物料与录入真实发布记录":
            - text: 可用
            - paragraph: 可登记账号、导出物料与录入真实发布记录
        - row "公众号 可用 已接入平台登录与真实身份读取 扫码绑定公众号账号 可用 已接入后台原生报表采集 暂不可用 尚未接入自动发布 暂不可用 尚未接入平台草稿保存 可用 可登记账号、导出物料与录入真实发布记录":
          - rowheader "公众号"
          - cell "可用 已接入平台登录与真实身份读取 扫码绑定公众号账号":
            - text: 可用
            - paragraph: 已接入平台登录与真实身份读取
            - button "扫码绑定公众号账号" [disabled]
          - cell "可用 已接入后台原生报表采集":
            - text: 可用
            - paragraph: 已接入后台原生报表采集
          - cell "暂不可用 尚未接入自动发布":
            - text: 暂不可用
            - paragraph: 尚未接入自动发布
          - cell "暂不可用 尚未接入平台草稿保存":
            - text: 暂不可用
            - paragraph: 尚未接入平台草稿保存
          - cell "可用 可登记账号、导出物料与录入真实发布记录":
            - text: 可用
            - paragraph: 可登记账号、导出物料与录入真实发布记录
        - row "小红书 可用 已接入平台登录与真实身份读取 扫码绑定小红书账号 可用 已接入作品与明细采集 暂不可用 尚未接入自动发布 暂不可用 尚未接入平台草稿保存 可用 可登记账号、导出物料与录入真实发布记录":
          - rowheader "小红书"
          - cell "可用 已接入平台登录与真实身份读取 扫码绑定小红书账号":
            - text: 可用
            - paragraph: 已接入平台登录与真实身份读取
            - button "扫码绑定小红书账号" [disabled]
          - cell "可用 已接入作品与明细采集":
            - text: 可用
            - paragraph: 已接入作品与明细采集
          - cell "暂不可用 尚未接入自动发布":
            - text: 暂不可用
            - paragraph: 尚未接入自动发布
          - cell "暂不可用 尚未接入平台草稿保存":
            - text: 暂不可用
            - paragraph: 尚未接入平台草稿保存
          - cell "可用 可登记账号、导出物料与录入真实发布记录":
            - text: 可用
            - paragraph: 可登记账号、导出物料与录入真实发布记录
    - paragraph: 先进入此账号组，再扫码绑定。
  - region "手动登记平台账号":
    - text: 手动登记平台账号 目标账号组：@t1022-1
    - paragraph: 先进入此账号组，再绑定或登记账号。
  - region "共享资源":
    - text: 共享资源 资料保留在原组，目标组通过授权继续引用。
    - checkbox "显示已撤销授权"
    - text: 显示已撤销授权
    - button "重新读取"
    - alert: 请先进入此账号组，再查看共享资源。
    - list
  - region "整理历史资料":
    - text: 整理历史资料 把历史项目与内容归入另一个账号组，先预览完整影响。
    - paragraph: 先进入此账号组，再查看和整理历史资料。
- alert
```

# Test source

```ts
  1   | import type { BrowserContext, Page } from "@playwright/test";
  2   | import { mkdirSync, writeFileSync } from "node:fs";
  3   | import { resolve } from "node:path";
  4   | import type { AccountGroupResource, PlatformAccountResource } from "@creatoros/contract";
  5   | import { expect, test } from "../helpers/test-environment";
  6   | 
  7   | const output = resolve((process.env.CREATOROS_T1246_RUN_DIR! + "/original-output/t1159"));
  8   | const wait = { timeout: 120_000 };
  9   | const viewports = [{ width: 1366, height: 900 }, { width: 900, height: 900 }, { width: 390, height: 900 }];
  10  | async function dispatch<T>(page: Page, id: string, input: unknown, groupId?: string, accountId?: string): Promise<T> {
  11  |   const response = await page.request.post("/api/v1/dispatch", {
  12  |     ...wait, headers: { "content-type": "application/json", ...(groupId ? { "x-group-id": groupId } : {}), ...(accountId ? { "x-account-id": accountId } : {}) }, data: { id, input },
  13  |   timeout: 120000});
  14  |   expect(response.ok(), `${id}: HTTP ${response.status()}`).toBe(true);
  15  |   return (await response.json()).data;
  16  | }
  17  | async function selectGroup(page: Page, context: BrowserContext, baseURL: string, groupId: string) {
  18  |   await context.addCookies([{ name: "creatoros_current_group", value: encodeURIComponent(groupId), url: baseURL }]);
  19  |   await page.addInitScript(id => { localStorage.setItem("creatoros:current-group", id); localStorage.removeItem("creatoros:current-account"); }, groupId);
  20  | }
  21  | 
  22  | test("T1159 两微信账号从组成员进入真实0报告，刷新返回与身份拒绝", async ({ page, context, baseURL }) => {
  23  |   // T1166：准备8 + 窗口24×6 + 身份24×2，至多200个120秒串行点，再留1200秒结算。
  24  |   test.setTimeout(Math.max((25_200_000), 25200000));
  25  |   page.setDefaultTimeout(120_000); page.setDefaultNavigationTimeout(120_000);
  26  |   mkdirSync(resolve(output, "screenshots"), { recursive: true });
  27  |   const group = await dispatch<AccountGroupResource>(page, "accountGroups.create", { body: { name: "微信报表入口验收", idempotencyKey: crypto.randomUUID() } });
  28  |   await dispatch<AccountGroupResource>(page, "accountGroups.create", { body: { name: "管理操作验收目标组", idempotencyKey: crypto.randomUUID() } });
  29  |   const accounts: PlatformAccountResource[] = [];
  30  |   for (const [platform, name] of [["wechatVideo", "中性视频号账号"], ["wechatOfficial", "中性公众号账号"]] as const) {
  31  |     const account = await dispatch<PlatformAccountResource>(page, "accounts.create", { body: { platform, accountHandle: name, idempotencyKey: crypto.randomUUID() } }, group.id);
  32  |     expect(account.externalAccountId).toBeNull(); accounts.push(account);
  33  |   }
  34  |   await selectGroup(page, context, baseURL!, group.id);
  35  |   const captures: { name: string; text: string; viewport: { width: number; height: number } | null; check_ids: string[] }[] = [];
  36  |   const observations: unknown[] = [];
  37  |   let bindingStarts = 0;
  38  |   page.on("request", request => {
  39  |     if (!request.url().endsWith("/api/v1/dispatch") || request.method() !== "POST") return;
  40  |     const id = request.postDataJSON()?.id;
  41  |     if (id === "accounts.bind.start" || id === "platforms.bind.begin") bindingStarts++;
  42  |   });
  43  |   for (const account of accounts) {
  44  |     const read = () => dispatch<{ items: unknown[]; total: number; nextCursor: string | null }>(page, "platforms.reports.list", { params: { accountId: account.id }, query: { pageSize: 20, cursor: null } }, group.id, account.id);
  45  |     const before = await read(); expect(before).toEqual({ items: [], total: 0, nextCursor: null });
  46  |     for (const viewport of viewports) {
  47  |       await page.setViewportSize(viewport); await page.goto("/accounts", wait);
  48  |       await expect(page.getByRole("heading", { name: "账号组与绑定账号", exact: true })).toBeVisible(wait);
  49  |       const link = page.getByRole("link", { name: `查看${account.accountHandle}的数据`, exact: true });
> 50  |       await expect(link).toHaveAttribute("href", `/accounts/works?accountId=${encodeURIComponent(account.id)}`, wait);
      |                          ^ Error: expect(locator).toHaveAttribute(expected) failed
  51  |       const member = link.locator("xpath=ancestor::li[1]");
  52  |       await member.locator("summary").click(wait);
  53  |       await expect(member.getByRole("button", { name: "隐藏", exact: true })).toBeVisible(wait);
  54  |       const transferTrigger=member.getByRole("button", { name: "转组", exact: true });
  55  |       await transferTrigger.click(wait);
  56  |       const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible(wait);
  57  |       await expect(dialog.getByRole("button", { name: "查看转组影响", exact: true })).toBeVisible(wait);
  58  |       await page.keyboard.press("Escape"); await expect(dialog).toBeHidden(wait); await expect(transferTrigger).toBeFocused(wait);
  59  |       await link.click(wait);
  60  |       const panel = page.getByTestId("native-report-panel");
  61  |       await expect(panel).toHaveAttribute("data-account-id", account.id, wait);
  62  |       await expect(panel.getByRole("heading", { name: `${account.accountHandle}的作品与数据`, exact: true })).toBeVisible(wait);
  63  |       await expect(panel.getByText("尚无后台报表。同步后可查看当前账号数据。", { exact: true })).toBeVisible(wait);
  64  |       await expect(panel.getByRole("button", { name: "同步数据", exact: true })).toBeEnabled(wait);
  65  |       expect(await panel.getByRole("heading", {level:1}).evaluate(element=>getComputedStyle(element).fontSize)).toBe("24px");
  66  |       const name = `${account.platform}-empty-${viewport.width}`;
  67  |       await page.screenshot({ path: resolve(output, "screenshots", `${name}.png`) , timeout: 120000});
  68  |       captures.push({ name, viewport, text: await panel.innerText(), check_ids: ["AC-REPORT-ENTRY", "AC-UI"] });
  69  |       await page.reload(wait); await expect(panel).toHaveAttribute("data-account-id", account.id, wait); expect(await read()).toEqual(before);
  70  |       await panel.getByRole("link", { name: "返回账号", exact: true }).click(wait); await expect(link).toBeVisible(wait);
  71  |     }
  72  |     // 公共start实际拒绝：不替换成功或失败响应，不开始扫码/采集/下载。
  73  |     await page.setViewportSize(viewports[0]!); await page.goto(`/accounts/works?accountId=${encodeURIComponent(account.id)}`, wait);
  74  |     const panel = page.getByTestId("native-report-panel");
  75  |     const responsePromise = page.waitForResponse(response => response.url().endsWith("/api/v1/dispatch") && response.request().postDataJSON()?.id === "platforms.collections.start", wait);
  76  |     await panel.getByRole("button", { name: "同步数据", exact: true }).click(wait);
  77  |     const response = await responsePromise; expect(response.status()).toBeGreaterThanOrEqual(400); expect(response.status()).toBeLessThan(500);
  78  |     const failure = await response.json(); expect(failure.error.code).toBe("SCOPE_MISSING");
  79  |     await expect(panel.getByRole("alert")).toContainText("请先扫码绑定这个账号，再同步数据。", wait);
  80  | 
  81  |     const recovery=panel.getByRole("button", { name: "扫码绑定账号", exact: true });
  82  |     await expect(recovery).toBeVisible(wait);await expect(panel.locator('header').getByRole('button',{name:'扫码绑定账号',exact:true})).toBeEnabled(wait);
  83  |     await expect(panel.getByRole('button',{name:'同步数据',exact:true})).toHaveCount(0,wait);
  84  |     await expect(panel.getByText('尚无后台报表。完成扫码后，可同步当前账号数据。',{exact:true})).toBeVisible(wait);
  85  |     await recovery.click(wait);const binding=page.getByRole('dialog');await expect(binding).toBeVisible(wait);
  86  |     await page.keyboard.press('Escape');await expect(binding).toBeHidden(wait);await expect(recovery).toBeFocused(wait);
  87  | 
  88  |     expect(await read()).toEqual(before);
  89  |     const name = `${account.platform}-identity-required`;
  90  |     await page.screenshot({ path: resolve(output, "screenshots", `${name}.png`) , timeout: 120000});
  91  |     captures.push({ name, viewport: page.viewportSize(), text: await panel.innerText(), check_ids: ["AC-REPORT-ENTRY", "AC-UI"] });
  92  |     await page.reload(wait); await expect(panel.getByRole("alert")).toContainText("请先扫码绑定这个账号，再同步数据。", wait); expect(await read()).toEqual(before);
  93  |     observations.push({ accountId: account.id, platform: account.platform, externalAccountId: account.externalAccountId, before, after: await read(), refusal: { httpStatus: response.status(), code: failure.error.code }, refresh: true, repeat: true, back: true });
  94  |   }
  95  |   expect(bindingStarts).toBe(0);
  96  |   writeFileSync(resolve(output, "public-read-observation.json"), JSON.stringify({ surface: "browser", mode: "non-fixture", witnesses: { groupId: group.id, accountIds: accounts.map(account => account.id) }, domainResponsesReplaced: false, manualAccountsIdentityVerified: false, realWechatCalled: false, bindingStarts, observations, captures }, null, 2) + "\n");
  97  | });
  98  | 
  99  | // T-1246 copied-source declaration: original assertions unchanged.
  100 | test.describe.configure({ timeout: 25200000 });
  101 | 
```