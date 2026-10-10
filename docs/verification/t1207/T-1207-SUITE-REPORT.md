# T-1207 全功能浏览器验收记录

## 执行边界

全程使用 `frontend/playwright.config.ts` 启动本地应用和每次运行独立的临时 PGlite 数据目录。浏览器只访问本地 `127.0.0.1`；页面写入通过公开 `/api/v1/dispatch` 服务，路由矩阵使用一次性测试账号组、测试账号、项目、作品和画布。未使用安装版真实数据、外网、真实平台账号、平台采集/登录/发布或 AI 模型。原 `network-policy` 拦截策略保留。

公共 fixture 新增自动截图 hook：每个 case 在结束时按稳定 test ID 生成 PNG，向 `scenario-index.ndjson` 记录 test ID、标题、URL、状态、截图、页面关闭状态和被拦截的外网尝试，并把图片附加到 Playwright 报告。截图错误会使测试失败；页面已经关闭时会明确记录，不能算 PASS。

## 全量 E2E 基线

收集命令：

```bash
CREATOROS_TEST_PORT=3887 pnpm --dir frontend exec playwright test --project=e2e --list
```

运行命令：

```bash
CREATOROS_TEST_PORT=3887 pnpm --dir frontend exec playwright test --project=e2e --workers=1 --retries=0 --output ../docs/verification/t1207/playwright-output --trace retain-on-failure > docs/verification/t1207/full-e2e.log 2>&1
```

结果：120 cases / 47 specs；73 passed、39 failed、8 timed out、0 skipped，命令退出码 1。每例都有截图，共 120 张；无截图缺失、无页面关闭后漏拍记录、无外网请求尝试。原始完整输出和失败 trace 保存在 `full-e2e.log` 与 `playwright-output/`。

新增自动化回归为 `automations-group-media-jobs.spec.ts` 的 4 个 case，覆盖账号组内跨平台媒体任务列表、平台/账号筛选、切换组后保留任务 ID、归档任务及无计划空态。它们只创建隔离的禁用任务，不触发调度。

关键改动仅限测试基础设施与测试本身：`frontend/tests/helpers/test-environment.ts` 加入稳定命名的逐例截图、NDJSON 记录、HTML/Markdown 总览所需字段和错误传播；`frontend/tests/e2e/automations-group-media-jobs.spec.ts` 与 `frontend/tests/e2e/t1207-supplemental-route-matrix.spec.ts` 是新增 E2E；`docs/verification/t1207/generate-gallery.mjs` 可重复生成人工审查 gallery。4 个新自动化 case 在全量运行中均通过。

完整基线的失败先按证据分类，未改产品实现、重试/超时或质量门。之后修正了两个不稳定/过期测试夹具，并对另一个运行时失败做了独立复跑：

| 分类 | 观察到的证据 |
|---|---|
| 测试夹具缺失 | `T1062 账号组真实原生粗剪` 的多例在进入页面前因 `/tmp/.../manifest.json` 不存在而失败；媒体导入/切 Tab 用例因同一临时目录中的 `neutral-original-speed.mp4` 不存在而失败。此结果不能作为产品链路已验证。 |
| 测试契约与现行页面不一致，需独立复核 | Copilot 旧用例一例断言“提交不发请求”，实际发往本地 `/api/chat`；其他检查要求旧导航项数量、搜索/设置主导航、独立 `/experience`、旧项目路由状态及旧素材卡片存在。运行记录显示 `/experience` 实际重定向到 `/knowledge`；素材组为空时旧断言仍要求卡片网格。没有据此修改断言。 |
| 页面/功能结果不符合现有 E2E 预期，待产品排查 | 项目新建、定位中心、内容雷达、账号绑定/作品页、发布日历、剪辑决策回读、画布等多条真实链路出现字段、状态、内容或等待超时失败。每例 URL、完整错误与页面截图见 Markdown 逐例索引和 gallery；这些失败尚未被逐项根因复核，不能笼统判为环境问题。 |
| 本地服务/运行时异常，复跑结果 | 初次 T1159 账号报告用例在 dispatch 上遇到 `ECONNRESET`；隔离后单独复跑 1/1 通过，初次故障未复现。Next.js 日志仍会在被取消的页面导航时打印 `ECONNRESET: aborted`，路由矩阵 34/34 通过，原日志保留。 |

T1069 视频导入/切 Tab 测试原先依赖已经消失的 `/tmp` 视频。现改用仓库稳定样本 `output/content-samples/ai-copy-eval-loop/motion-preview.mp4`（SHA-256 `a116d9d135ca730df76dd4932f2cf0e5630e47b4094eff6d83af5f731aa1ac04`），单例复跑 1/1 通过：两段视频均完成导入，切到脚本页再返回后未保存内容保留，保存/刷新后工程与素材一致，并成功导出 MP4。首段文件上传服务耗时约 2.4 秒，第二段上传约 24 毫秒；完整步骤约 43 秒。导出的实际视频已保存为 [neutral-tab-export.mp4](neutral-tab-export.mp4)，切 Tab 后工程截图见 [video-tab-restored.png](screenshots/video-tab-restored.png)。

T954 复盘测试补齐显式账号组与账号选择，避免测试沿用旧的单账号默认组；窄视口检查移到打开 AI 编导对话之前，保留对补采响应、提示词上下文、空态和响应式布局的断言。最终隔离复跑 1/1 通过。原始首轮失败及中间复核的截图和 trace 仍保留在工作区输出目录中。

## 补充真实路由矩阵

为弥补旧 suite 没有覆盖全部主要页面的问题，新增 `t1207-supplemental-route-matrix.spec.ts`，所有动态 ID 来自同一次隔离运行中经公开 dispatch 创建的夹具。每个路由要求本地 HTTP 200、非空真实页面内容，视频剪辑工作台另确认可见工作区区域。

最终覆盖 34 条：13 个侧栏入口（首页、创作者总览、定位中心、内容雷达、选题、项目、知识库、素材中心、创作画布、发布中心、运营分析、自动化、设置）；账号管理、当前账号作品目录、快速创建、发布日历；项目主稿、选题/计划/脚本/发布兼容入口、复盘、组合创作、视频剪辑工作台；文章、图文页、图文深链、视频深链、朋友圈工作台和项目画布详情；登录、注册与网页激活旧入口均验证重定向首页。

三轮结果都保留，避免覆盖失败证据：

| 轮次 | 命令端口 | 结果 | 说明 |
|---|---:|---:|---|
| 首次 | 3888 | 25/29 passed、4 failed | 定位中心、选题、设置弹窗和剪辑工作台四例的通用 `main` 定位器未匹配其实际页面结构；相应页面均有可见内容，失败截图和 trace 原样保留。 |
| 修正定位器 | 3889 | 28/29 passed、1 failed | 剪辑工作台有两个相同 aria-label，Playwright 严格模式拒绝歧义；测试定位器问题。 |
| 最终 | 3890 | 29/29 passed | 使用 `getByRole("region", { name: "视频剪辑工作台" }).first()` 消除重复 aria-label 歧义。 |
| 扩展全页面 | 3897 | 34/34 passed | 增加快速创建、朋友圈稿件和三个旧入口重定向；动态夹具来自公开服务接口。 |

矩阵最终命令：

```bash
CREATOROS_TEST_PORT=3890 pnpm --dir frontend exec playwright test --project=e2e tests/e2e/t1207-supplemental-route-matrix.spec.ts --workers=1 --retries=0 --output ../docs/verification/t1207/route-matrix-final-output --trace retain-on-failure > docs/verification/t1207/route-matrix-final.log 2>&1
```

扩展轮运行时间约 2.2 分钟，退出码 0，34 个 case 全部通过。测试取消旧导航请求时 Next.js 有 `ECONNRESET: aborted` 诊断日志；路径都返回预期页面并通过断言，该信号已单列保留。

## 视觉、无障碍和专项复跑

- 视觉矩阵：52 cases，18 passed、34 failed。页面可渲染截图已逐例留存；失败包含既有截图基线和旧页面结构断言不匹配，未更新视觉基线来制造通过。详见 [visual.log](visual.log) 与截图总览。
- 无障碍矩阵：16/16 passed，检查每页单一 H1 及可操作控件具备名称。详见 [accessibility.log](accessibility.log)。
- 媒体导入/切 Tab/保存刷新/MP4 导出专项：1/1 passed，使用稳定仓库 fixture，结果和导出样片如上。
- 复盘空数据与 AI 编导接线：修正账号组 fixture 后 1/1 passed；两微信平台账号的空报告、切换、权限拒绝流程 T1159 单独复跑 1/1 passed。详见对应日志与截图。
- 全量 120 条 E2E 仍保留首次基线 73 passed、39 failed、8 timed out。上述定向复跑不替代完整 suite；不能据此宣称全量 E2E 全绿。
- 对仍未逐项定因的可操作功能失败已登记后续根因与修复任务 [T-1208](../../features/t1208-t1207-e2e-failure-triage.md)，避免把这些失败只留在聊天或截图里。

## 原生 App 验收状态

已探测 `/Applications/CreatorOS.app` 与 Appium 3.8.0/mac2 4.3.6。WebDriverAgent 构建成功，但 XCTest 两次都因 `Timed out while enabling automation mode` 未能建立原生 session；因此没有原生页面截图，也没有把浏览器截图冒充 App 截图。需要用户在 macOS 正常完成 Automation Mode 授权后，才能继续用 Appium 走实际安装版页面。探测细节见 [appium-probe.md](appium-probe.md)。

## 仓库收尾门禁

2026-10-11 执行完整 `node orchestrator/process/reconcile.mjs`，退出码 1，27 error / 0 warning。错误来自看板超限、历史审核回执不一致和 LED-052/018/042/054/058/057/053 守卫回归；具体摘要见 [reconcile-2026-10-11.md](reconcile-2026-10-11.md)。这是已存在的全局债务，根因由开放任务 T-1204 跟踪；T-1207 未改产品实现，故本验收报告保留其失败，不写成全绿。

## 人工查看证据

- [按 spec 分组的可点击截图总览](E2E-GALLERY.html)
- [逐例状态、URL、截图及错误索引](E2E-CASE-INDEX.md)
- [全量 E2E 原始输出](full-e2e.log)
- [路由矩阵首次运行输出](route-matrix-initial.log)
- [路由矩阵定位器修正运行输出](route-matrix-interim.log)
- [路由矩阵最终运行输出](route-matrix-final.log)
- [扩展后的 34 页路由矩阵](route-matrix-expanded.log)
- [视觉截图基线](visual.log)
- [无障碍矩阵](accessibility.log)
- [媒体导入、切 Tab 和 MP4 导出](media-tab.log)
- [复盘专项修正后复跑](t954-final.log)
- [微信账号报告专项复跑](t1159-recheck.log)
- [截图与 trace 文件](screenshots/)
- [Appium 原生自动化探测](appium-probe.md)
- [仓库 reconcile 门禁摘要](reconcile-2026-10-11.md)

按 scenario index 重建总览的命令：

```bash
node docs/verification/t1207/generate-gallery.mjs
```

最终总索引包含 314 条运行记录 / 67 个 spec，226 passed、80 failed、8 timed out。这里包含完整基线与历史路由定位器尝试，不代表 314 个独立功能失败。314 条记录都有已捕获截图，页面关闭前漏拍 0、外网请求尝试 0；历史失败与修正后通过的复跑使用独立图片路径，避免截图状态混淆。Gallery 当前引用 285 个场景截图路径，另有 3 张专项视口/切 Tab 截图，PNG 共 288 张。图库与 Markdown 索引由上面的命令从 `scenario-index.ndjson` 重建。

本轮没有修改 CreatorOS 产品实现，只新增/修正验收与测试夹具；完整 E2E 的失败没有被隐藏或改写。
