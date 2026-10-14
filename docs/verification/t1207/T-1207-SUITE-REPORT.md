# T-1207 全功能浏览器验收记录

## 2026-10-11 持续验证更新

以下原全量基线、失败与原生限制仍保留。截至3942自动化稳定布局复验自然结束，图库为 **394 条历史运行、239 个不同 Test ID、72 个 spec、286 PASS / 100 FAIL / 8 TIMEOUT**；它包含多轮历史，不是新一轮全功能结果。当前计数与截图路径存在检查见 [索引及3927原图字节保全收据](../t1234/before-next-skill-3927/archive-receipt.json)；七张3921原图字节保全见 [收据](../t1232/before-next-settings-run/preservation-receipt.json)。T1223 已修计数与重复跳转，真实 RED/GREEN、两种视口和独立复核见 [报告](../t1223/REPORT.md)。

| 当前实际验证 | 结果与边界 | 证据 |
|---|---|---|
| 稿面视频卡提示与正式预览、实际播放推进 | 3935原提示RED保留；仅修kind提示，3936原旅程PASS；3937追加真实play/currentTime推进0.401083、readyState4/1080×1920/error null，原双击/lazyURL/键盘/刷新900仍PASS，3661声明冻结true。只本中性小样开始播放，不签完整12秒/声音/所有编码/native。原3935/3936整体false保留；后续SDK hooks无限预算发现已更正，不改旧收据 | [3937实际播放三图](../t1243/browser-3937-playback/REPORT.md)、[独立终审](../t1243/browser-3937-playback/independent-review.md) |
| 自动化真实UI启用及立即运行授权等待 | 3938实际exit0/38.649s、单次runNow200、同run/AI/execution等待授权/0统计、刷新同ID、错组404、3663声明冻结true。桌面原详情有扫码提示，未点击/绑定/访问XHS。390图在sidebar过渡中且未滚到job，不能签窄扫码；稳定布局/截图另建T1245，原PASS和图保留 | [3938公开链与原图](../t1244/browser-3938/REPORT.md)、[独立复核](../t1244/browser-3938/independent-review.md)、[窄窗口范围](../../features/t1245-automations-narrow-layout.md) |
| 自动化稳定布局、原任务按钮与运行详情 | 3939稳定390横向溢出及3940的900标题关闭重叠均真实FAIL保留；仅修局部filter/header CSS，3942三视口原12图及完整公共授权等待、原三层同ID、错组404 PASS，3663声明/HEAD冻结true。没有点扫码或编辑提交，不签真人登录/采集；3941配置漂移false另留，不洗旧收据 | [3942新原图与范围](../t1245/browser-3942-config-stable/REPORT.md)、[原FAIL](../t1245/browser-3939-original/REPORT.md)、[第二个FAIL](../t1245/browser-3940-filters/REPORT.md) |
| 安装版任务只读状态 | 公开CLI读取5组14作业的每项最新1条记录：8成功/2失败/4无记录，月明metrics新增2；不是历史成功率或全平台结论。评论批次2/2但仍34历史作品失败、旧测试组accountId缺失分别关联T1027/T1217；没有runNow/改任务/登录/DB访问 | [安装版公开观察](installed-public-status-20261011/REPORT.md) |
| 新建项目、创作画布相关定向重跑 | 已修旧合同/选择器及真实上传入口；保全部原失败，不代签原视觉全集 | [T1218](../t1218/REPORT.md)、[T1219](../t1219/REPORT.md)、[T1220](../t1220/REPORT.md) |
| 多平台计划列表、视频导入切Tab保存刷新导出、文章/图文手工编辑保存导出 | 3911 的7例全部通过。视频209KB中性样本约4.1/4.4秒可操作；不代表大视频性能、平台登录或AI生成质量 | [公共旅程与截图](../t1208/20261011-next-journeys-report.md) |
| 账号组 A→B→A 与刷新、原项目回读、错组404 | 3913 单例实际通过；3912旧失败和两组/返回三张操作图均保留 | [T1221](../t1221/REPORT.md) |
| 内容雷达旧账号/冻结组、删除与项目引用保护 | 最终新增67例及原7文件76例均实际通过，源码前后哈希一致；早期失败保留。后续完整公共旅程的3920结果另列下一行，不用后端测试替代浏览器 | [T1217后端报告](../t1217/BACKEND_VERIFICATION_REPORT.md) |
| 内容雷达来源→逐字稿→组内项目正文浏览器旅程 | 3920原case 1/1PASS、exit0、retry0；本地正式流式替身1请求，完整两段正文贯通UI/项目种子/公开读回/刷新、同ID幂等和两类404。root及独评实际查看三张正文图；不签真实模型质量或正式脚本版本产物。3914/3918原FAIL和3919旧JSON正文图都保留 | [3920实际报告与三图](../t1233/browser-3920/REPORT.md)、[独立复核](../t1233/browser-final-independent-review.md)、[3919原记录](../t1231/browser-3919/REPORT.md) |
| 设置分类、昵称、自动保存偏好、外观、模型与RedFox | 3921完整七例一次执行5PASS/2FAIL，exit1、retry0。密度刷新丢失；模型保存和单次正式探针成功但结果节点消失。两项已登记T1235/T1236；模型后续读回/刷新/空密钥再次保存尚未到达，不签模型持久闭环 | [3921实际结果和原失败](../t1232/browser-3921/REPORT.md)、[密度修复范围](../../features/t1235-density-reload-persistence.md)、[模型结果诊断](../../features/t1236-model-probe-visible-result.md) |
| 紧凑布局全局恢复 | 当场组件RED两轮分别8FAIL/4PASS和9FAIL/3PASS；最小两产品修复后62例PASS、exit0，前端类型/精确lint/边界/diff各exit0。3923原完整外观case 1/1PASS、exit0，关闭后/accounts刷新仍compact，再重开浅色/紧凑一致；桌面/390图实际查看。窄布局缺口另记T1237，未签视觉全绿 | [原公共用例与两图](../t1235/browser-3923/REPORT.md)、[真实组件GREEN收据](../t1235/component-green-receipt.json) |
| 账号组Skill公共操作 | 3924合法组输入disabled的真实RED保留；三产品修复后组件67/67 PASS、LED047 174/174 PASS。3927原2PASS/2FAIL与trace保留。独评后仅校准测试就绪/真实关闭路径和等待器清理；3928公共四例实际4PASS/exit0：UI首写→刷新→r2→两真实历史行，B官方基座/跨组版本404，归档写404，双页409保草稿，真实RSC/原A在途PUT与ABA无污染。80声明源/HEAD同且自然清理；组件67/67、真实内存库13/13分别补字段/旧账号及repository/service边界，未代签真人平台/模型/安装版 | [3928四条真实旅程](../t1234/browser-3928/REPORT.md)、[3927原失败及trace](../t1234/browser-3927-green/REPORT.md)、[3924真实控件RED](../t1234/browser-3924-red/REPORT.md)、[组件修复](../t1234/implementation-report.md)、[真实内存库限定验收](../t1234/repository-probe-run-v2/REPORT.md) |
| Skill历史回滚与恢复默认 | 3930单次1PASS/exit0；真实保存r1/r2→点击旧r1回滚新增r3且内容版本1→恢复默认新增r4且官方内容相等→刷新四历史原ID/旧完整内容保留。3PUT+1rollback，全部同组且无account；80声明源/HEAD同，五张原图亲看并独评；不签模型消费/policy/390px此流程/安装版 | [3930真实按钮旅程与五图](../t1234/browser-3930/REPORT.md)、[独立复核](../t1234/browser-3930/independent-review.md) |
| 设置窄窗口布局 | 四处响应式class修复，3925实际1/1PASS、exit0，390/683/1536真实几何、七分类、草稿、深链和键盘操作通过；12具名PNG分6组不同画面，原图不修图。root和独评亲看窄屏与桌面；仅布局/交互，不代签各分类保存业务 | [实际报告与12张图](../t1237/browser-3925/REPORT.md)、[独立复核](../t1237/browser-final-independent-review.md) |
| 模型保存与结果回显 | 保原3921失败，组件真实RSC/迟到save RED后四产品修复，最终80PASS及类型0；3926原4283完整model case1/1PASS、exit0：UI保存、单次正式SSE、结果可见、脱敏公开读回、刷新、空key仅保存均到达。两图亲看并独评；仅本地协议fixture公共链，不真provider/安装 | [3926报告与两图](../t1236/browser-3926/REPORT.md)、[独立复核](../t1236/browser-final-independent-review.md) |
| 素材选择器140图、分页与照片操作 | 3932原单例1PASS/exit0，公开140次创建/PUT/完成均200，同组、六页140唯一与错组空；缩略图预览解码、确认/取消/键盘回焦及三窗口留图。原140与断言保持，原FAIL保留；合成PNG、API分页及有效CSS视口边界如实说明 | [3932报告与三图](../t1240/browser-3932/REPORT.md)、[原trace白名单回读](../t1240/browser-3932/public-observations.json)、[实际独评](../t1240/browser-3932/independent-review.md) |
| 无指标复盘主入口、诚实空态及刷新同稿件 | 3934单例1PASS/exit0，130声明源/HEAD同；1536/390真图、刷新后同组项目/稿件/版本及正文相等、分析0、chat0。入口未点击、没有模型或经验采纳，不代签知识库回流。3931编译panic/双120秒超时且无图FAIL与3933旧cookie断言FAIL均保留 | [3934报告与五图](../t1239/browser-3934/REPORT.md)、[实际独评](../t1239/browser-3934/independent-review.md)、[3931原失败](../t1239/browser-3931/REPORT.md)、[3933诊断](../t1239/browser-3933/account-cookie-diagnosis.md) |
| 本地Codex执行与免文本配置 | 270条局部回归通过、2条父partial失败；无文本配置的公开能力目录46条不可用（34条文本）。未发送真实模型回合，不能签免配置全功能完成 | [T1227当前矩阵](../t1227/REPORT.md) |

新增 [T1226媒体隔离诊断](../../features/t1226-playwright-media-root-isolation.md)：前述浏览器配置已隔离数据库/登录态，但没有隔离缺配置时的默认媒体目录，不能把此前PNG/视频上传称为文件层也完全隔离；不据此猜测或删除用户目录中的文件。T1226现已完成3915真实默认根/fresh媒体根及上传下载错组验证；T1225已完成3916画廊与空态、3917单例恢复复验，原失败保留。原密度和模型失败已分别复验通过；账号组Skill四条公共旅程已实测通过，设置七例整体回归已实际7PASS，3930成功Skill回滚/恢复默认已实际通过；经验候选采纳、真实模型/平台与原生App仍待相应实测。[剩余合同诊断](../t1208/20261011-remaining-contract-triage.md)仅只读证据，不冒称新 E2E 通过。当前main HEAD为4df342497，后续本轮修复仍在未提交工作区；当前安装版仍为此前a091de271来源，没有在本轮重新打包或安装，不能把本轮源码修复当已装进客户端。全局收尾门未通过，不宣称全功能可用性已验收完成。

本轮关键检查点集中见 [关键功能验收截图页](SETTINGS-CHECKPOINT-GALLERY.html)，图片可按原始尺寸打开。

## 原全量基线的执行边界

以下边界只描述原全量基线，不覆盖后续已单列的公共RSS服务端外网/本地模型替身旅程。原全量基线使用 `frontend/playwright.config.ts` 启动本地应用和每次运行独立的临时 PGlite 数据目录。浏览器只访问本地 `127.0.0.1`；页面写入通过公开 `/api/v1/dispatch` 服务，路由矩阵使用一次性测试账号组、测试账号、项目、作品和画布。未使用安装版真实数据、外网、真实平台账号、平台采集/登录/发布或 AI 模型。原 `network-policy` 拦截策略保留。

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

早期索引快照包含 314 条运行记录 / 67 个 spec，226 passed、80 failed、8 timed out；该统计仅保留历史，不是当前总览。这里包含完整基线与历史路由定位器尝试，不代表 314 个独立功能失败。314 条记录都有已捕获截图，页面关闭前漏拍 0、外网请求尝试 0；历史失败与修正后通过的复跑使用独立图片路径，避免截图状态混淆。Gallery 当前引用 285 个场景截图路径，另有 3 张专项视口/切 Tab 截图，PNG 共 288 张。图库与 Markdown 索引由上面的命令从 `scenario-index.ndjson` 重建。

原全量基线执行时没有修改 CreatorOS 产品实现，只新增/修正验收与测试夹具；后续 T1217 产品修复另列在顶部持续更新。完整 E2E 的失败没有被隐藏或改写。


## 2026-10-11 本轮素材与雷达继续验证

T1226实际3915隔离公开链1/1 PASS：上传、完成、同IDlist/get、原字节SHA下载、错组get404及blob403。数据和媒体根均fresh专用目录；具体证据见../t1226/browser-3915/。不代表大视频性能或真实平台调用。

T1225实际3916三例2PASS/1FAIL：真实四PNG画廊（1536及1024视口）、真空组filechooser通过。A-B-A恢复用例在“正在打开工作区…”加载骨架期间一次采样卡ID=[]，trace显示下载URL调用更晚才发生。该原失败与三个历史截图均保留在../t1225/before-3916/，不能据此认定数据丢失；正按既有120秒web-first等待校准后单例复验，尚未签恢复通过。T1230旧抖音隔离文字仅改两字符串，静态exit0，真空组新文案/相邻真实上传入口已实际截图并由root查看；不是整页改版或所有筛选族PASS。

T1229原3914task116/transform115的精确隔离pglite副本最低只读取证自然exit0，原树hash不变：物理绑定true、attempt61/retry_wait、无冻结输入、0模型账本calls。正文Skill真实null输出schema与structured入口矛盾的修复范围正在独评和真实resolver RED准备；未修改产品或重发原任务/模型请求，雷达全旅程仍FAIL。

新完整非concise仓库日志../t1227/reconcile.log已结束，实际26 errors/1 warning/DRIFT，原exec退出码收据恢复时缺失，不补造。19条历史收据和7条LED失败仍保留，未归因成全为范围外。自动重复Stop检查已取消释放资源，记录为cancelled_duplicate_not_pass（../t1204/duplicate-stop-reconcile-cancelled-20261011.json），不代表质量门通过。上文27条旧检查是其当时实际记录，未改成新的数字或重签历史PASS。


3917原失败标题单例复验已自然exit0，case9.1秒、含冷启动33.7秒，1worker/0retry/fresh DB+media。新增两个原120秒web-first等待之后，A-B-A四项原ID集合与公开list一致、详情选择和B错组404通过；没有修改产品恢复行为。3916另外两项PASS未重复运行，不能说修改后全三例同轮通过。root已实际查看恢复四卡1536图、新空态1536及画廊1024图。最新总览的351条历史/226不同TestID及255PASS/88FAIL/8TIMEOUT以gallery-index-after-3917.json为证，所有当前截图路径存在；这是索引检查及生成结果，不是本轮重新浏览器验图库全部卡片。

随后已在真实 Chromium 打开当前本地总览，1024×768和1536×960两个视口截图由root实际查看；351条卡片被读取，3916恢复场景FAIL和3917同标题PASS的不同锚点各实际点击一次，弹出图像成功解码且地址分别匹配原保存失败图和新通过图。该次浏览器自然exit0，非file请求0；见../t1225/gallery-current-browser.log、gallery-current-browser-observation.json和gallery-current-1024/1536.png。不代表逐张查看351张原图或重跑全部功能。

T1229真实官方Skill与effective resolver的隔离完整链已实际RED：原产品1/1 FAIL、exit1，精确Zod拒绝“结构化任务缺少冻结输出契约”，0模型账本calls、0本地模型请求。首轮诊断bindingMatches误比较ownerId与transformId，已透明登记并保留原日志；真实生产者ownerId为itemId，新测试仅校准诊断和补前置绑定断言。修复范围独评PASS后正在实施正文专用私有分支，尚无GREEN/公共旅程复验或新安装版结果；详见../t1229/official-rewrite-original-red-report.md。

后续T1229四产品修复已经稳定：最终契约23、Worker51、完整隔离正文链8，均retry0通过；三包类型、边界和精确diff检查exit0。八族包括真实官方null、真实overlay object、旧桥合法冻结object回放、空白、断连unknown，以及错误owner/fence/停止的拒绝后合法恢复。原setup/config/type失败也分别保留，没有改成通过。原task unknown的二次consumer只断言task全行和HTTP数不变，未另对二次ledger全行断言；正族有ledger全值比较。正文正确取消后晚结果不提交另有实际Worker测试。

本次timeout-policy整体exit1：静态27项/13文件，未命中四产品修复文件；七组动态检查166项通过。具体旧Codex、第三方编辑器计时与Workbench消费者仍待逐项核对，不泛称全部无害或全局绿。最终源和退出码收据见../t1229/final-freeze-receipt.json；原公共3918旅程正重新验证，未将上述隔离模型结果替代真人、安装版或完整建项目验收。


2026-10-11 新增整体回归：[3928 Skill 四条公共旅程](../t1234/browser-3928/REPORT.md)实际4PASS、[3929 原设置七例](../t1232/browser-3929/REPORT.md)实际7PASS，两个数字退出码均0，旧失败保留。当前关键截图见 [检查点图库](SETTINGS-CHECKPOINT-GALLERY.html)。已验证公共旅程未重写旧用例状态，也不把本地文本协议夹具称为真实Codex/供应商验收。成功Skill历史回滚与恢复默认、项目复盘经验候选采纳仍按真实缺口补验。

## 3931—3934 编译阻塞与续验记录

3931在公开创建四次200后首次冷编译review发生Turbopack图关系panic，导航与自动截图各120秒失败；实际自然exit1、原trace/日志和失败临时库均保留，没有补造PNG。T1241独评精确处置后，在主工作树服务已退出、缓存无句柄且目标无符号链接时，只清理1,791,050,392逻辑字节的可再生成Turbopack缓存；另清理可再生成pnpm元数据及已PASS临时库1,000,701,100逻辑字节，未清用户数据、失败库或其他会话工作区。3933同源码页面编译正常，但刷新后账号cookie已清除与测试空字符串断言不符；原FAIL图字节归档。T1242按真实消费者独评仅接受空或不存在账号标记，仍拒绝非空；3934完整页面公共链自然通过。此结果不证明缓存或磁盘是唯一根因，也不证明正式安装版已修复。[精确缓存处置收据](../t1241/cache-disposition/result.json)、[范围独评](../t1241/cache-disposition-scope-review.md)、[原图保全](../t1242/before-source/index-remap-receipt.json)、[最终类型检查](../t1242/root-static-dd6-363/receipt.json)。
