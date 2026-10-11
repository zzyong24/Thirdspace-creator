# T-1208 剩余旧 E2E 合同只读复核

日期：2026-10-11
范围：`assets.spec.ts`、`settings.spec.ts`、`app-shell.spec.ts`、`experience.spec.ts` 的原失败及现行合同。
执行边界：只读源码、SPEC、截图索引和原 failure/trace；本轮未启动 Next/Playwright，未改测试、产品或共享控制文件，也未判这些路径为 GREEN。

## 结论

素材中心两条失败由隔离测试库确实为空触发：当前页面显示真实的 0 素材空态；原测试没有创建素材却要求卡片网格及第二张卡，属于测试夹具缺失，尚不能用它判断有素材时画廊和详情联动是否正常。

设置页原测试针对旧整页、八个横向分类的结构；失败时的实际页面是 `/settings` 居中对话框，且对话框把后台导航从可访问性树中隐藏。当前实际 UI 有七个纵向分类，但本轮查到的正式材料没有把这七项作为一份完整分类清单获批。T-501 确认居中 Settings Dialog、分类导航，并提出把 Search/RSS/browser 放进“联网与数据源”；DEC-MC-002 随后把该任务缩小为现有模型配置页的轻量优化。RedFox 的“数据服务”入口另有 T-962 范围依据。旧测试不能继续要求八个横向 tab；新测试也不应把实际 UI 的七项数量当作已批准常量。先验证正式确认的弹窗、分类切换及已批准的功能操作；要锁定完整七分类及排序，需单独找回对应 IA 决策或补齐窄 SPEC/DEC。保留无团队/权限/订阅假入口等范围负例。

经验页旧测试要求 `/experience` 独立裁决工作台；用户已在 T-118 选择把候选裁决迁入项目复盘、已验证经验作为知识库只读类型、退役独立入口。原 E2E 跟随重定向抵达 `/knowledge`，属于旧页面合同漂移；应验证两个真实消费面及各自权限，而不是恢复独立经验页。

AppShell 的七导航断言已过时。后续用户授权已经改变 IA 方向：T-114 用户拍板“任务中心 → 自动化”时明确要求保留导航项且 `/automations` 路由不变；T-1022 DEC-GROUP-1022 又明确沿用原品牌、导航和丰富工作台，并在正式 PAGE_SPEC 中增加 `/overview`、列出 `/accounts`。这些较晚的授权与 T-063 的四项收敛方案冲突时，以后续用户确认的保留原导航方向为准；T-1200 也明确本次知识库重设计不改全局导航。它们没有把当前 13 项及其顺序批准为常量。T-1199 明确 `/automations` 内账号组任务列表、平台/账号筛选和公共读取合同，但未单独裁定该链接的导航层级。逐个入口的真实可达性和操作可测，不需要先断言总数为 13。键盘焦点失败的 12 次上限依赖旧导航结构；页距失败时 trace 显示首页仍在“正在打开工作区”，两者都没有独立证明产品功能缺陷。

## 逐例证据与归类

| 文件/用例 | 原结果与证据 | 与当前合同对照 | 归类 |
|---|---|---|---|
| `assets.spec.ts`：画廊、类型栏、详情面板 | Test ID `7d95edad6f617a74a29d-605171d5500a33bc7afb`；`[data-slot="asset-card-grid"]` 不存在。failure 页面快照显示各类型计数均为 0、“共 0 个素材”和真实空态“这个账号还没有素材”。原用例没有建素材。 | [page-specs §12](../../../frontend/specs/page-specs.md)规定有素材时使用三列画廊、详情固定在右侧、素材类型栏独立于全局导航。[T1069](../../features/t1069-installed-media-and-binding.md)明确素材选择要使用真实素材、名称辅助识别、当前候选按用户确认，且不以文件名假推断。可复用已有真实 E2E 字节夹具 `frontend/public/douyin-icon.png`：[`creative-canvas.spec.ts` 上传助手](../../../frontend/tests/e2e/creative-canvas.spec.ts)按组 scope 调 `assets.uploads.create` → PUT 返回的 `uploadUrl` → `assets.uploads.complete`，取得真实资源 ID；另有通过页面 `[data-slot="assets-upload-input"]` 上传该文件的正式 UI 用例。素材列表/详情再用公开 `assets.list`/`assets.get` 回读。空库可不渲卡片，但不得以此删除有数据画廊合同。 | **夹具缺失**。真实路径可支持新隔离组内四个独立上传资产以保留原 `>=4` 断言，并让第二例在至少两张卡之间切换；不插 DOM、不直写数据库。现有 fixture 只证明 PNG 上传，不代表视频/音频/文档缩略都已覆盖。 |
| `assets.spec.ts`：点击另一张卡更新详情 | Test ID `7d95edad6f617a74a29d-425739d7596a7f96ed34`；初始 detail `data-asset-id` 为空，循环找不到与初始值不同的卡，`clicked=false`。同一空库页面快照为 0 素材。 | 当前页面初始空态明确显示“选择一个素材以查看详情”；详情切换合同只有至少两条真实有效资产时才可测。 | **夹具缺失**，不是详情联动的反例；联动仍未验证。 |
| `settings.spec.ts`：设置页结构 | Test ID `87418b536bb3b16b9965-9d167bbc2a2b29b9bb07`；第一个失败点是通过 `getByRole("navigation", {name:"主要导航"})` 查 `/settings` 的 active link，找不到。失败快照可访问内容是 `dialog "设置"`，其中可见七项垂直分类“账户、偏好、外观、模型配置、数据服务、技能、存储”。 | 旧测试按 [page-specs §17](../../../frontend/specs/page-specs.md)要求八项横向 tabs 和整页左右卡片。[T-501 PAGE SPEC §4.1](../../superpowers/specs/2026-07-25-model-configuration-experience-redesign.page-spec.md)要求保留 `/settings` 居中 Settings Dialog 和分类导航；§4.3 的“联网与数据源”特指 Search/RSS/browser 应从模型区移出。后续 [DEC-MC-002](../../../orchestrator/DECISION_LOG.md) 缩小 T-501 为现有模型设置页轻量优化，否决八槽总览、向导和能力平台；并没有给出 Settings 的七分类完整目录。RedFox 另由 [T-962 SPEC](../../features/t962-operations-sync-redfox.md)确认独立密钥设置，DEC-T962 记载其进入独立“数据服务”页签。模态对话框将背景标为不可访问，故 role 查询不返回背景主导航；这不是后台 active 状态丢失的证据。 | **旧结构/可访问性查询合同漂移；七分类全集的形式依据缺失**。先测 Dialog、分类交互与有 SPEC 的操作；若要断言“七项及顺序”，需补精确 IA 决策，不能仅凭源码/截图批准它。 |
| `app-shell.spec.ts`：列出七个主导航 | Test ID `826b944a90800335c80d-29f41b2bbed70474183c`；断言 7，页面实际有 13 个链接。 | [T-063 SPEC §2–3](../../superpowers/specs/2026-07-03-first-principles-redesign.md)曾规定四项一级导航和旧路由归并。其后 [T-114 IA 用户拍板](../../superpowers/specs/2026-07-04-ia-convergence-design.md)明确“导航项 + 页标题 + 文案改名”，`/automations` 路由/功能不变；再后 [DEC-GROUP-1022](../../../orchestrator/DECISION_LOG.md)及 [T-1022 PAGE_SPEC](../../features/t1022-account-group-workspace/PAGE_SPEC.md)确认保留原导航，并具体列出 `/overview`、`/accounts` 页面。故四项方向已被后续授权覆盖。T-1022 没有列出完整导航数组；T-1199 规范了 `/automations` 的组级任务内容与筛选，不决定它的链接层级。 | **固定 7 项是旧断言；当前逐入口可操作性应测，但精确 13 项/顺序没有单独获批**。应去掉总数断言，保留导航 landmark、active 状态、键盘顺序和各项真实路由/页面验收；不得据计数增删产品导航。 |
| `app-shell.spec.ts`：侧栏 → Header → 页面焦点顺序 | Test ID `826b944a90800335c80d-9f1ba789128856c63381`；`inHeader` 断言失败。测试最多按 Tab 12 次，直到 Header。 | 旧注释/算法隐含早期导航数量；当前 sidebar 有 13 个 nav link，12 次本身不足以证明 tab 顺序错误。原失败只报告首次 Header 断言 false，未走到 Header→内容断言。需要按批准的当前 nav 和真实 focusable 集合观察顺序。 | **测试上限依赖旧结构，产品可及性未判定**。保留“侧栏导航可键盘到达、焦点可进入 Header、Header 完后进入页面内容”语义；删的是固定 12 次前提，不是焦点覆盖要求。 |
| `app-shell.spec.ts`：共享页间距 | Test ID `826b944a90800335c80d-4077f0e7e007a8275809`；期望 `gap:20px`，读到 `normal`，左右 padding 均为 `24px`。 | 原 failure snapshot 明确出现首页状态“正在打开工作区”；测试 `page.goto("/")` 后立即用 `app-page-content.firstElementChild` 读样式，没有等待 Dashboard 内容 ready。当前 [DashboardPage](../../../frontend/src/features/dashboard/dashboard-page.tsx) 的 `<main>` 明确用 `gap-section-gap`；AppShell 外层使用 `px-page-gutter`。因此读到 `normal` 可能是加载占位而非 Dashboard main，原快照支持这个竞争条件。 | **页面尚未 ready 时测量的环境/测试准备问题**，不是空间 token 缺失的定论。需等待真实 `main[data-page="dashboard"]` 可见后重读计算样式。 |
| `experience.spec.ts`：独立裁决台 | Test ID `b64559fc4465ec32f46c-c9e4a01ada78a3a6ab2c`；原 URL `/experience` 最终到 `/knowledge`，标题为知识库，旧断言要求“经验沉淀”。 | [T-118 relocation SPEC §0、§A–C](../../superpowers/specs/2026-07-04-experience-relocation-design.md) (lines 11–16, 42–59, 61–65)记录用户选择：candidate 在项目复盘裁决，validated experience 在 `/knowledge` 只读展示，独立模块退役，旧入口重定向；[T-1200 SPEC](../../features/t1200-knowledge-workspace-redesign.md) (lines 9, 35–40)明确不改 AI 候选采纳规则，并保持经验为只读内容类型。公开读写合同在 [`learnings.list/evaluate`](../../../contract/src/operations/learnings.ts) (lines 15–28, 107–118)：按 `projectId + validationStatus=candidate` 读取本作品候选，经 `learnings.evaluate` 把用户采纳结果写为 `validated`，再按 `validationStatus=validated` 重读并在知识库展示。T-118 指定候选来源为 `review.analyze` 任务结果和确认链（SPEC lines 44–46, 87–89）；当前组合在 `ai.tasks.confirm` 后物化 `learning_list`，并按真实项目指标是否存在决定 grounded 自动 validated、否则 candidate（[persistence-client.ts](../../../frontend/src/server/persistence-client.ts) lines 2874–2897；[T-284c G3-A SPEC](../../superpowers/specs/2026-07-13-replication-loop-linkage-design.md) lines 54–57）。因此测试需用隔离的确定性 worker/模型夹具生成一个**未被真实指标背书**、但具备有效复盘输入的项目，经过公开 `ai.tasks.create` / `ai.tasks.confirm` 后用 `learnings.list` 确认真实 candidate；采纳后再用公共 `learnings.evaluate` 和 `learnings.list` 读回。若不存在能满足“有效 review.analyze 输入且无真实 metric”条件的安全样本，应登记 T-118 与 T-284c 的合同冲突，不能插入假卡或把 grounded 结果硬标成 candidate。`learnings.create` 的 contract 注释称手动确认返回 validated，但运行服务会依 `evidenceStrength` 将未背书记录留在 candidate（[learnings.ts](../../../contract/src/operations/learnings.ts) lines 40–46；[learnings.service.ts](../../../backend/src/modules/learnings/learnings.service.ts) lines 375–402）；这一路径不等同于 AI review candidate 生成。 | **已批准的路由与消费面迁移导致旧 E2E 合同失效**。旧 route 的失败本身不是缺失经验功能的证据；知识库只读展示、项目复盘候选采纳和公共读回仍未被原例验证。 |

以上具体失败截图与完整上下文均保留在 [T-1207 逐例索引](../t1207/E2E-CASE-INDEX.md) 及 `docs/verification/t1207/playwright-output/`。原 T-1207 全量基线为 120 cases / 47 specs，73 pass、39 fail、8 timeout；本报告不改写或覆盖这些结果。[T-1208 验收规范](../../features/t1208-t1207-e2e-failure-triage.md)要求保留原失败证据，只有现行合同有独立依据时才校准测试。

## 建议的最小测试写集

本报告不直接改动以下文件。根任务登记后，由独立复核确认写集和依赖。

1. `frontend/tests/e2e/assets.spec.ts`：为 populated-gallery 两例创建隔离用户/组，通过既有公开 `assets.uploads.create` → PUT → `assets.uploads.complete` 上传 `frontend/public/douyin-icon.png`；列表/详情再用 `assets.list`/`assets.get` 核真实 ID。第一例创建四个独立资源以保留当前 `>=4` 断言，第二例至少两项；另保留真实空库用例。断言有素材时右侧详情不是 dialog、不同卡选择后真实资产 ID 变化；不插 DOM 假卡或绕过组 scope。该 fixture 不代签视频/音频/文档缩略图。
2. `frontend/tests/e2e/settings.spec.ts`：保留已通过的 T-606，不改其断言；只将结构用例转为当前 Dialog 合同，检查单个 AppShell、Settings Dialog、分类导航和选中 panel；验证有明确 SPEC/DEC 支持的模型配置与数据服务操作。保留没有 team/permission/subscription 详情入口的负例。完整七分类及排序先找到正式 catalog/DEC 后再锁，不能拿当前源码或截图自批。
3. `frontend/tests/e2e/app-shell.spec.ts`：按后续用户确认修正旧固定七项断言，不写死 13 项。逐入口核当前实际链接可达与目标页面真实内容，至少包含 T1022 正式列出的 `/overview`、`/accounts` 和 T114/T1199 所定义 `/automations`；保留单导航 landmark、active link 语义。焦点用例遍历真实键盘顺序并断言关键区域次序，不依赖固定 Tab 数。页距用例等待真实 Dashboard ready，再定位 Dashboard `<main>` 与实际 token；保留单壳、单滚动区域、滚轮只滚内容区和 24px 页面边距等既有验证。
4. `frontend/tests/e2e/experience.spec.ts`：按当前消费者验证 `/experience` → `/knowledge`，以及知识库 validated 经验列表/详情只读（无采纳/翻案/修订按钮）。用隔离 project 经真实 `review.analyze` 公共入口和确定性本地模型/worker fixture 产出 candidate；在真实复盘 UI 执行采纳或不采，随后用 `learnings.list` 按项目/状态读回，并验证 validated 条目只读显示在知识库。不得用 `learnings.create` 直接造 validated 行冒充候选，不恢复全局独立裁决模块。

## 不能从本轮得出的结论

- 后续 T114/T1022 用户确认已把“只保留四项”的方向替换为“保留原导航”；但没有确认 13 项的精确清单、排序或每项的独立主导航层级。本轮逐入口核验建议不等同于批准计数常量。
- Settings Dialog、分类导航及 T-501 的模型/联网数据源边界有 SPEC/DEC 依据；当前七项分类全集和排序没有找到完整正式清单，待精确来源或单独 IA 决策。
- 未验证 populated `/assets` 卡片/详情行为、跨账号组隔离或大视频性能。
- 未以真实浏览器重跑当前设置对话框的键盘/背景可访问性；未验证设置所有标签页都能完成其真实服务操作。
- 未在知识库中验证真实 validated 经验详情和项目复盘候选写入/采纳回读；路由重定向证据不替代这些消费链路验收。候选须来自真实 `review.analyze` 路径；手录 `learnings.create` 属 validated 写入，不可替代候选采纳链。
- 本轮没有运行 Next、Playwright、安装版或任何服务测试，因此不产生 PASS/GREEN。
