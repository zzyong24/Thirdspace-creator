# 章节 F:知识库 + 素材中心 + 全局搜索

> 日期:2026-07-26
> 任务:T-528 新用户 0→1 标杆路线 · 功能域盘点分章
> 方法:只读代码盘点(subagent),每条断言附 `file:line`;无证据处标 ⚠️未验证
> 对照:产品宪法 [docs/产品定位.md](../../产品定位.md) §7 记「知识/素材/搜索 = 已实现主路径」;R-LIBRARY(§9)
> 行号基于分支 `codex/t471-responses-protocol` 工作区

侧栏入口:`frontend/src/components/shell/sidebar.tsx:101-102`(knowledge=「知识库」matchExact `/knowledge`;assets=「素材中心」matchExact `/assets`)。**`/search` 无侧栏项**(`sidebar.tsx:104`),仅经头部搜索框 / ⌘K 进入。

核心结论:**知识域四条 AI 路由(classify/distill/relate/comment-sift)均不写实体,只产候选,人过确认门才物化 —— R-LIBRARY「AI pending 不污染库」由此保证 ✓**。

---

## F-1 知识库(路由 `/knowledge` · 侧栏「知识库」)

- **如何到达**:侧栏「知识库」→ `/knowledge`(`sidebar.tsx:101`);或旧链接 `/experience` 307 服务端重定向到 `/knowledge`(见 F-1b)。
- **主文件**:
  - route:`frontend/src/app/(creator)/knowledge/page.tsx:52`(Server Component,解析 `?tag=` / `?page=`,session-scoped 读)
  - 页壳:`frontend/src/features/knowledge/knowledge-page.tsx:170`
  - 交互岛:`frontend/src/features/knowledge/knowledge-interactive-region.tsx:133`
  - 录入内核:`frontend/src/features/knowledge/knowledge-dump-zone.tsx:89`
  - AI 确认门(共享):`frontend/src/features/knowledge/knowledge-atom-gate.tsx:119`
  - 评论回流:`frontend/src/features/knowledge/knowledge-comment-backflow.tsx:62`
- **首次进入(空态)小白看到什么**:页头「记一条经验」入口(`knowledge-page.tsx:206`)+ 常驻「知识倾倒场」(`:211`)+「评论回流」入口(`:213`);列表区 EmptyState:标题「这个账号的知识库还是空的」,文案说明「知识库按账号独立:每个抖音号一套库,切号即切库…」(`:220-226`)。空态判定 = categories/recent/popularTags/memoryInsights 全空(`:184-188`)。**空库也能录入**(倾倒场/回流入口在 loading/error 之外恒渲)。
- **主路径**:
  1. **录入·AI 蒸馏(主路径)**:倾倒场 textarea 粘文本/URL 或拖入 `.md/.txt`(`knowledge-dump-zone.tsx:177-198`,拖拽读文件 `handleDrop:110`)→ 点「AI 蒸馏(打开对话)」(`:212-221`)→ `router.push(distillCopilotHref(content))` 深链打开 Copilot 隔离桶 `surface:knowledge-distill`(`:138-140` / `distillCopilotHref:69`)。原文 ≤1500 字直接 prefill,过长带引导话术。
  2. **AI 确认门采纳**:蒸馏候选经共享确认门 `KnowledgeAtomGate`(`knowledge-atom-gate.tsx:119`)——每行 checkbox 默认全选 + type 四原子下拉(claim/evidence/quote/qa,`ATOM_TYPE_OPTIONS:42`)+ title/出处可改 → 点「采纳选中 N 条」→ 逐条 `client.createKnowledge`(`:155`),suggestedTags best-effort 挂标签(`assignKnowledgeTagsBestEffort:63`),可选「原文同时存档」多存一条 reference(`:172-182`)。铁律:**AI 只产候选,人点采纳才物化**;失败内联不回滚(`:186-188`)。
  3. **录入·手动补录(降级)**:点「手动补录」(`knowledge-dump-zone.tsx:222`)展开表单 → title + type(五枚举含 reference)+ 正文 → `client.createKnowledge`(`:151`)→ `router.refresh()`。
  4. **AI 搜索(hybrid)**:工具栏搜索框输入即时客户端过滤(`filteredRecent:300`);回车触发服务端 `POST /api/knowledge/search`(`knowledge-interactive-region.tsx:181`),返回 exact/semantic 结果卡(`AiSearchResult:83`);未配 embedding 模型时诚实降级提示「AI 语义搜索未启用…设置→模型配 knowledge.search.embed」(`:811-819`)。
  5. **三视图切换**:关系图 / 观点地图 / 全部(`:158-163`,切换器 `KnowledgeViewSwitch:646`)。关系图 `KnowledgeGraphView`「AI 找关联」→ `POST /api/knowledge/relate`(`knowledge-graph-view.tsx:330`)产候选边,确认门采纳 → `knowledge.relations.create`(createdByType='ai',铁律见 `relate/route.ts:21-23`)。
  6. **详情/修订/归档**:点 recent 行/地图卡/图节点/搜索结果 → `ui/dialog` 弹窗(**项目无 `/knowledge/:id` 路由**,`:418-423`)→ 知识卡走 `KnowledgeDetailPreview` 读最新修订正文;「编辑正文」预填全文 → `createKnowledgeRevision` 存新版本 append-only(`:270-288`);「归档」两步确认 → `archiveKnowledge` soft-delete(`:247-268`)。
  7. **评论回流**:点「评论回流」→ `POST /api/knowledge/comment-sift`(`knowledge-comment-backflow.tsx:74`)三级去噪(规则预筛→AI 蒸馏→人工门)→ 采纳 → `createKnowledge` type='qa' + `sourceMetadata.origin='comment_backflow'` 双料溯源锚(`:123-140`)。0 评论诚实空态引导去复盘页采集(`:205-224`)。
  8. **标签筛选/分页**:热门标签 chip 链 `/knowledge?tag=<name>`(`:1273`),读侧真过滤;「最近更新」混排分页 `?page=` 10 条/页(`RecentPagination:984`)。
- **关键前置依赖**:登录 session + 已选账号(`page.tsx:74` 未选号渲 `ZeroAccountGuidance`);AI 蒸馏/搜索/关联需在 设置→模型 配好对应 capability(`knowledge.classify`/`knowledge.distill`/`knowledge.relate`/`knowledge.search.embed`),经 model-config 解析**不写死**(`distill/route.ts:16`);无 key 诚实 4xx。
- **产出 & 衔接**:知识原子(claim/evidence/quote/qa/reference)入 `knowledge.*`(user+account-scoped);可复用片段供脚本插入(`ReusableSnippets`);知识条目进全局搜索「知识」tab;评论回流串接复盘页采集的 audience_signals。
- **⚠️ 未实现 / 占位 + PRD 差异**:
  - **`/api/knowledge/classify` 路由无 live 前端调用者**(grep 全仓仅 route.ts 自身命中):T-062c 原倾倒场归类流已被 T-094 蒸馏走 Copilot 深链取代(`knowledge-dump-zone.tsx:11-13` 注明旧表单流移除),classify 路由保留但当前无入口触发 → **事实性遗留死路由**。
  - InsightRail 部分块为展示态(F1d 装饰):`MemoryInsights`/`UnsortedItems`/`ReusableSnippets` 无点击处理器(`:410-417` 注明「render with NO click handlers on purpose」)。
  - 无 `/knowledge/:id` 详情路由,详情走弹窗(诚实规避 404,`:418`)。
  - **R-LIBRARY「AI pending 不污染库」符合 ✓**:classify/distill/relate/comment-sift 四路由**均不写实体**,只产候选,人点确认门才 `client.createKnowledge`。
- **归档小结**:知识库 = 单一账号隔离库,「倾倒场→AI 蒸馏(Copilot 深链)→确认门采纳」为录入主路径,手动补录/评论回流/AI 搜索/关系图为辅,全 AI 只产候选、人确认才物化。

### F-1b 已验证经验并入(T-118b · `/experience` 307 → `/knowledge`)—— 已核实 ✅

- 路由:`frontend/src/app/(creator)/experience/page.tsx:14-16` = `redirect("/knowledge")`(Server Component 发 307 GET,去掉旧 `?tab=experience`);测试锁定 `experience-redirect.test.tsx:26` `toHaveBeenCalledWith("/knowledge")`。
- 只读一等类型:经验行 `origin="experience"`(`knowledge-page.tsx:130`),在「最近更新」混排带高亮「经验」chip(`knowledge-interactive-region.tsx:1163-1170`),点开走 `ExperienceDetailPreview` 只读详情(insight + 来源标注,**绝无采纳/翻案/修订**,`:597-640`)。裁决已迁复盘页(T-118a)。侧栏「经验沉淀」独立项彻底退役(`sidebar.tsx:110-111`)。
- 结论:T-118b 断言与代码一致,已核实。

---

## F-2 素材中心(路由 `/assets` · 侧栏「素材中心」)

- **如何到达**:侧栏「素材中心」→ `/assets`(`sidebar.tsx:102`)。
- **主文件**:
  - route:`frontend/src/app/(creator)/assets/page.tsx:45`(Server Component,解析 `?type=`/`?q=`/`?page=`/`?pageSize=`,session-scoped 真读)
  - 页壳:`frontend/src/features/assets/assets-page.tsx:283`
  - 上传按钮:`frontend/src/features/assets/asset-upload-button.tsx:42`
  - 存储卡(页内左下):`assets-page.tsx:694` `StorageUsageCard`
  - 侧栏 storage 卡:`frontend/src/components/shell/sidebar-storage-card.tsx:40`
- **首次进入(空态)小白看到什么**:`data-page-state="empty"`(`assets-page.tsx:343`);顶部工具栏(搜索 + 上传按钮);左轨素材类型窄栏(图片/视频/音频/文档/字幕,计数全 0)+ 存储卡;中央画廊空态。读失败 → ErrorState(不伪造画廊,`:316-329`)。
- **主路径**:
  1. **上传素材(主路径)**:点「＋上传素材」(`asset-upload-button.tsx:144`)→ 隐藏 `<input type=file>`(accept 限图/视频/音频/.pdf/.doc/.md/.txt/.srt/.vtt,`:136`)→ **两阶段真上传**:① `client.createUpload`(assetType/mimeType/fileSize/fileName,`:66`)→ ② PUT 真字节到 presigned URL(非 mock:// 才 PUT,`:82-92`)→ ③ `client.completeUpload`(service headObject 校验字节后建资产,`:94`)→ `router.refresh()`。MIME→assetType 映射 `assetTypeForFile:31`。
  2. **文档自动抽取**:document 上传完成 → fire-and-forget `createAITask` taskType='material.extract'(抽全文 + AI 要点卡,`:100-112`);>20MB 前端拦截提示拆分(`:58-62`)。
  3. **类型筛选**:左轨类型行是真 `?type=` 链接(保留 `?q=`,`assets-page.tsx:451-524`),server 重读重排;计数取真实读行(`deriveGallery` typeCounts `:260-264`)。
  4. **搜索**:工具栏 `AssetsToolbarSearch` 写 `?q=`,name/description/tag 子串过滤(client-over-page,`deriveGallery:237-250`)。
  5. **排序/分页**:统一「按新旧」`sortAssetsByNewest`(createdAt desc,`:234`);真分页 `?page=`/`?pageSize=`(默认 24,`:252`)。
  6. **详情**:选中资产 → 固定右轨 `AssetDetailPanel`(**非弹窗**,page-specs §12 硬约束,`:46`),含 MediaPreview/元数据/标签/使用历史/文档要点卡。
- **关键前置依赖**:登录 session + 已选账号(`page.tsx:66` 未选号渲 `ZeroAccountGuidance`);真上传需 S3/MinIO 或 local-fs 后端(local-fs 签相对路径 `/api/v1/blob/…` 也会 PUT,`:78-82`);文档抽取需配 material.extract 模型。
- **产出 & 衔接**:资产入 `assets.*`(user+account-scoped);进全局搜索「素材」tab;素材供项目弹药区/脚本引用;usage history 按 projectId 分组(`AssetUsageRow:173`)。
- **侧栏 storage 卡接真实容量(T-115)—— 已核实 ✅**:
  - 页内 `StorageUsageCard`(`assets-page.tsx:694`)+ 侧栏 `SidebarStorageCard`(`sidebar-storage-card.tsx:40`)+ 设置页 **同一真实源** `client.getStorage`(`settings.storage.get`)。`usedBytes = Σ asset_files.file_size`,`totalBytes = rootPath 所在磁盘真实容量(fs.statfs)`(`assets-data.ts:36-40,107-109,218-224`)。
  - T-196 诚实处理:totalBytes 未知(0)时**不显百分比条**,仅显已用量,不摆假分母(`assets-page.tsx:696-701,717-729`);侧栏卡读失败诚实降级「存储用量不可用」绝不回退假值(`sidebar-storage-card.tsx:61-64,102-105`)。去掉旧硬编码「12.4/50GB·25%·自动同步」假数据(`sidebar-storage-card.tsx:6-9`)。
- **⚠️ 未实现 / 占位 + PRD 差异**:
  - `assets.list` **无服务端 type/q 过滤参数**,`?type=`/`?q=` 为 client-over-page 过滤(`assets-page.tsx:196-200`);分页是真的,但过滤只作用在已读页 → **大库跨页过滤会漏**(代码注释已诚实标注)。
  - 已移除的假 UI:5 个装饰筛选 chip + 批量操作菜单(`:372-376`)、截图/录屏/封面/B-roll/收藏/回收站假类型行(`:449-450`)—— 均因 `assets.list` 无支撑而删。
  - 上传字节/下载/复制链接/收藏部分标「规划中(heavy: real object storage)」(`assets-data.ts:40`)。
  - **R-LIBRARY「AI pending 资产不污染库」符合 ✓**:上传走真 two-phase(create→PUT→complete headObject 校验),完成才建资产;抽取是 fire-and-forget AITask 不阻断入库。
- **归档小结**:素材中心 = 账号隔离真实素材库,「＋上传→两阶段真字节落盘→completeUpload 建资产」为主路径,类型筛选/搜索/排序全接真读,存储卡三处同源接 fs.statfs 真磁盘容量。

---

## F-3 全局搜索(路由 `/search` · 入口 = 头部搜索框 + ⌘K,**无侧栏项**)

- **如何到达**:任意页头部 `HeaderGlobalSearch` 框回车 → `router.push(/search?q=…)`(`header-global-search.tsx:55-70`);或全局 ⌘K/Ctrl+K → `/search`(`global-search-hotkey.tsx:14-34`,输入框聚焦时不劫持);侧栏无导航项(`sidebar.tsx:104,127`)。
- **主文件**:
  - route:`frontend/src/app/(creator)/search/page.tsx:43`(Server Component,`pages.search.get` 服务端读,threads `?q=`+`?type=`)
  - 页壳:`frontend/src/features/search/search-page.tsx:214`
  - 头部搜索岛:`frontend/src/components/shell/header-global-search.tsx:33`
  - ⌘K hotkey:`frontend/src/components/shell/global-search-hotkey.tsx:14`
  - DTO→VM 适配:`frontend/src/features/search/search-view-model.ts:83`
  - 类型 tab 岛:`frontend/src/features/search/result-type-tabs.tsx`;facet 面板:`search-facets-panel.tsx`
- **首次进入(空态)小白看到什么**:`search` 模式头部搜索框(唯一真身,`search-page.tsx:253-256`);ResultTypeTabs(项目/知识/素材/视频四类,`:257`);无 `?q=` 时四组按 fixture 回退/空;右轨 SearchFacetsPanel + 快捷操作 + 搜索历史(空则「暂无搜索历史」,`:728`)+ 搜索技巧。
- **主路径**:
  1. **发起搜索**:头部框输入(打字仅更新本地受控值,不逐键写 URL 防垃圾历史,`header-global-search.tsx:8-17`)→ 回车 → `push(/search?q=…)` 保留既有 `?type=`(`:60-68`)→ server `getGlobalSearch({q,type})`(`search/page.tsx:67-71`)。
  2. **四类结果渲染**:`pages.search.get` 返回分组 DTO → `globalSearchPageToViewModel` 映射(`search-view-model.ts:83`)→ 四组 ProjectResultSection(3 卡横排)/KnowledgeResultSection/AssetResultSection(缩略图)/VideoResultSection(`search-page.tsx:296-345`),锁定顺序 项目/知识/素材/视频。
  3. **类型分面窄化**:点 tab push `?type=`(白名单 project/knowledge/asset/video,`search/page.tsx:35,49-51`)→ server 据此窄化卡片组、保留全量 tab 计数(`search-page.tsx:227-244`);窄化时只渲选中组(`SearchResults visible:311`)。
  4. **结果卡跳转**:项目卡深链 `/projects/<id>`(`:386`);知识/素材/视频**无 per-entity 详情路由**,分别链到 `/knowledge`/`/assets`/`/publishing` 中心列表(`:470-472,547,623`),诚实不伪造详情 URL。
  5. **搜索历史**:侧轨历史行链 `/search?q=<query>` 重跑(server 重查 + 后端追加 SearchHistory,无独立 mutation 端点,`:742-756`);op-backed 时 facet 面板真接 `search.facets` 分面桶(`:678-685`)。
- **关键前置依赖**:登录 session + 已选账号(`search/page.tsx:63` 未选号渲 `ZeroAccountGuidance`);结果依赖各域已有数据。
- **产出 & 衔接**:全局搜索是跨域**只读汇聚层**,把项目/知识/素材/视频四域串成统一入口;结果卡回流各中心;历史落 SearchHistory。
- **⚠️ 未实现 / 占位 + PRD 差异**:
  - **四类搜索只返回当前 scope(R-LIBRARY)**:route 走 session-scoped `createServerClient(session.ctx)` + accountId 守卫(`search/page.tsx:63-71`),后端 `SearchService.search` 按 ctx 窄化 → 符合。⚠️未逐行验证后端 SQL scope(超出本次前端盘点范围)。
  - 无 per-entity 详情路由(知识/素材/视频),统一回落中心列表(诚实设计,`:468-469`)。
  - 搜索技巧行为纯装饰(静态语法提示,`:767`);历史 label 只渲日期段(`search-view-model.ts:146-148`)。
  - 已移除假 UI:sr-only 复制搜索框(交互倒置修复,`:253-256`)、装饰话题 chip(GAP-SRCH-1,`:288`)、fixture 硬编码 tab 计数(op-backed 时信任后端,`:227-244`)。
- **归档小结**:全局搜索 = 头部框/⌘K 入口(无侧栏项)的跨四域只读汇聚,`?q=`+`?type=` 双参驱动 server `pages.search.get`,结果卡回落各中心列表(无 per-entity 详情路由),account-scoped。

---

## 关键跨域发现(供路线文档决策)

1. **三域统一模式**:route(Server Component)解析 URL 参数 → session+accountId 守卫(未选号统一渲 `ZeroAccountGuidance`)→ session-scoped `createServerClient` 真读 → VM → 交互岛。三域均「读侧做真、账号隔离」。
2. **知识库 AI 铁律贯穿**:classify/distill/relate/comment-sift 四路由**均不写实体**,只产候选,人过确认门才 `client.createKnowledge`/`relations.create` —— R-LIBRARY「AI pending 不污染库」在知识域由此保证。
3. **遗留死路由**:`/api/knowledge/classify` 无 live 前端调用者(被 T-094 Copilot 深链蒸馏取代),建议后续清理。
4. **T-118b / T-115 断言均已核实为真**(见各节)。
5. **无 per-entity 详情路由**是三域一致的诚实设计(知识/素材/视频详情走弹窗或回落中心列表,规避 404)。
