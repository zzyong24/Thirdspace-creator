# 产品审计:搜索 + 变现(违宪残留)+ 边角(modal / 404 / error)

> 审计日期 2026-07-02 · 审计人 Claude(subagent)· dev server localhost:3000(免登录直通 canonical user `user-zyongzhu`)
> 纪律:每个结论给证据(file:line 或 curl 结果);未验证的标「未验证」。本次只做只读验证(注意:`pages.search.get` 本身有「读即写历史」副作用,审计过程写入了数条 query="AI" 等搜索历史行,属该 op 设计行为)。

---

## 1. /search 全局搜索

### 1.1 功能定位

全局资源检索页:在项目 / 知识 / 素材 / 视频四类实体里按关键词找东西。横切工具页,不属于七步流水线任何一环,是流水线产物(项目、知识沉淀、素材、发布视频)的统一检索入口。定位本身合宪(服务数据底座的可发现性)。

**但当前实际状态:搜不到用户的真实数据(46 条抖音导入作品全部不在索引),且页面上唯一可见的搜索框是死的。** 详见 bug 清单。

### 1.2 代码链路

```
app/(creator)/search/page.tsx (Server Component, 读 searchParams.q)
  → createServerClient(session.ctx).getGlobalSearch({ query: { q } })   ← 只传 q,type 被丢弃(:47)
  → op pages.search.get → query-services 模块接管(persistence-client.ts:433-438)
  → createGlobalSearchQueryService.getGlobalSearch (backend/src/modules/query-services/query-services.service.ts:377-442)
  → SearchService.search → SearchRepository.search:user 域 ILIKE over search_documents.search_text,orderBy indexedAt desc,limit 50(backend/src/modules/search/search.repository.ts:126-144)
  → 读后副作用 recordSearch 写 search_history(query-services.service.ts:410-416)
  → DTO 经 globalSearchPageToViewModel 适配(features/search/search-view-model.ts)→ SearchPage 渲染
侧栏分面:SearchFacetsPanel(client)→ op search.facets → SearchRepository.facetMatches(无 limit,同 ILIKE)(search.repository.ts:146-159)
```

索引来源(关键):
- 种子:仅 `canonicalDataset`(mock)投影(frontend/src/server/persistence-client.ts:4134-4137 调 `buildCanonicalSearchDocuments(canonicalDataset, …)`)。
- 实时 fan-out:仅 artifacts(backend/src/modules/artifacts/artifacts.service.ts:158)、production、publishing 三个模块 post-commit upsert。
- **douyin 真实数据种子(persistence-client.ts:4832 起 seedProjects(douyinProjects…))没有对应的 search_documents 写入** → 46 条真实作品项目、其知识条目均不可搜。

### 1.3 区块与交互清单

| 区块 | 元素 | 点了发生什么 | 接线 | 状态 |
|---|---|---|---|---|
| TopHeader(search 模式) | 可见的大搜索框 | **什么都不发生**:无 onSubmit → 组件默认 `preventDefault()`;无 onChange(非受控);`searchValue` 也没人传,`?q=AI` 时框仍是空的 | top-header.tsx:137-144(没传 onSubmit)→ search-field.tsx:46-52(默认吞掉 submit);shell-router.tsx:394-409(没传 searchValue);SSR 验证:`/search?q=AI` HTML 中 `#app-header-search` 无 value | **dead(已验证)** |
| 页面级搜索 island | 输入 → URL `?q=` 同步(replace/键);Enter → push + 服务端重读 | 真接线,但整个 island 被 `className="sr-only"` 隐藏,肉眼不可见 | search-page.tsx:255-259;search-interactive-region.tsx:101-139;SSR HTML 确认 wrapper class 含 `sr-only` | works(但不可见,仅读屏可用) |
| ResultTypeTabs(项目/知识/素材/视频) | 点 tab → 纯客户端隐藏其他分组 + 滚动定位;再点取消 | client-only DOM `hidden` 切换,无 op | result-type-tabs.tsx:52-87 | works(客户端;未真机点击,逻辑纯前端) |
| 「显示全部」 | 清除 tab 过滤 | 同上 client state | result-type-tabs.tsx:149-156 | works(同上) |
| 「按相关性排序」 | 纯文本,不可点 | 无;且实际排序是 indexedAt desc,不是相关度 | result-type-tabs.tsx:131-135 vs search.repository.ts:142 | 装饰 + 文案失实 |
| 筛选(SearchFacetsPanel)· 类型分面 | 点类型 → URL 变 `?q=&type=` | facets 读真(op search.facets 已验证返回真桶);**但 type 参数 server 不消费**:page.tsx 只传 `{ q }`,transport 明明支持 type(query-services.transport.ts:67-70) | 实测:dispatch `q=AI&type=project` 返回 1 个项目;页面 `/search?q=AI&type=project` 仍 0 卡 | **dead(仅高亮态变化,结果不变;已验证)** |
| 筛选 · 标签分面 | 点 tag → q 追加该词重搜 | 机制真(改 q 触发服务端重读);但当前索引 tag 桶为空(只有 knowledge 文档 body 带 tags;q=AI 时 `tag:[]`) | search-facets-panel.tsx:123-131;curl search.facets q=AI → `"tag":[]` | works(机制)/ 实际常年空 |
| 项目结果卡 | 跳 `/projects/<id>` | 真实体 id 深链 | search-page.tsx:371-377 | works(路由存在) |
| 知识/素材/视频结果卡 | 跳 `/knowledge` `/assets` `/publishing` 列表页 | 无 per-entity 详情路由,诚实降级到中心页 | search-page.tsx:456-460, 534-535, 610-611 | works(降级) |
| 「查看全部」×4 | 跳 4 个中心页 | 纯链接 | 均 curl 200(/projects /knowledge /assets /publishing) | works |
| 快捷操作 ×3 | 新建项目 → /projects/new;查看知识库 → /knowledge;**上传素材 → /assets(只是跳列表,不是上传)** | 后端 STATIC_QUICK_ACTIONS 出 label,前端 QUICK_ACTION_HREFS 出 href(适配器硬编码) | query-services.service.ts:306-310;search-view-model.ts:64-74;注意用的是 `<a>` 非 `<Link>`(search-page.tsx:695)→ 全页刷新 | works(但「上传素材」名不副实) |
| 搜索历史行 | 跳 `/search?q=<历史词>` 重跑 | 服务端重读 + 再 append 一条历史 | search-page.tsx:734-736 | works(已验证:历史里出现审计 curl 写入的行) |
| 搜索技巧 | 纯文本 | 后端 STATIC_TIPS 硬编码;**教的语法(引号精确匹配、`-` 排除)实际不存在** — 后端是 escapeLike + ILIKE 子串匹配 | query-services.service.ts:311-314 vs search.repository.ts:72-74,130 | 装饰 + **误导** |

### 1.4 数据来源(四桶)

| 数据 | 来源链 | 桶 |
|---|---|---|
| 搜索命中(项目/知识/素材/视频) | search_documents 表(真 SQL 查询)← 但表内容 = canonical mock 种子 + artifacts/production/publishing 实时 fan-out;**douyin 真实作品不在内** | 表是 real,内容主体是 **fixture**(canonical mock);真实数据缺席 |
| 结果 tab 计数 | 前端按已渲染分组长度重算(search-page.tsx:231-241) | real(对渲染诚实,对全量匹配不诚实 — 见 bug S-2) |
| 分面桶(entityType/tag) | op search.facets → facetMatches 真聚合 | real |
| 搜索历史 | search_history 表,读即写 | real |
| 筛选器 DTO(f-type/f-stage/f-tag「AI/教程/提示词/Agent/变现/出海」) | 后端 STATIC_FILTERS 硬编码(query-services.service.ts:301-305);且前端适配后**无组件消费**(SearchSideRail 不渲染 vm.filters — 已被 FacetsPanel 取代) | hardcoded + 死数据路径 |
| 快捷操作 label/描述/href | 后端 STATIC_QUICK_ACTIONS + 前端 QUICK_ACTION_DESCRIPTIONS/HREFS 两头硬编码 | hardcoded |
| 搜索技巧 | 后端 STATIC_TIPS 硬编码 | hardcoded(且失实) |
| 视频卡时长 MM:SS | **前端从实体 id 十六进制字符编造**(search-page.tsx:604-608);DTO 里的真 durationLabel 被适配器丢弃(search-view-model.ts:118-126) | **hardcoded(编造)** |
| 视频卡「平台 · 发布时间 · 播放量」 | 适配器写死 publishedAtLabel:""、views:""(search-view-model.ts:123-124)→ 渲染成「抖音 ·  · 」 | hardcoded(空) |
| 知识卡 typeLabel「知识」/updatedAt | 适配器写死 "知识" / ""(search-view-model.ts:103-109) | hardcoded |

### 1.5 数据流向(写路径)

- 唯一写:`pages.search.get` 读后副作用 `recordSearch` → search_history 表(每次非空 q 的服务端读都追加一行,无去重)。
- 前端 island 每个键击 `router.replace` → 触发一次服务端读 → **每个键击写一条历史**(机制见 bug S-4)。
- 其余交互均只读/纯客户端。

### 1.6 设计不合理

1. **交互模型倒置(high)**:页面上唯一可见的搜索框(header)是死的非受控输入;唯一活的输入 `sr-only` 不可见。普通用户在搜索页无法搜索。
2. **「按相关性排序」失实**:实际按索引时间倒序。
3. **快捷操作「上传素材」**只是跳素材中心,没有上传行为。
4. 分面板会出现 `artifact` 桶(q=AI 时 64 个,是最大桶),但:无中文标签映射(ENTITY_TYPE_LABELS 缺 artifact,直显英文)、页面没有 artifact 结果分组 — 即使修好 type 转发,点它也是全空页。
5. 空查询空态:四张空 SectionCard + 「找到 0 个结果」,无引导(对比:分面板倒是有「输入搜索词后…」提示)。
6. 搜索技巧教不存在的语法(误导用户)。
7. 历史行只显示 query + 日期;DTO resultCount 被适配器写死 0 且不渲染 — 信息稀薄。

### 1.7 疑似 bug

| # | 描述 | 证据 | 严重度 |
|---|---|---|---|
| S-1 | **真实导入作品不可搜**:搜自己 46 条抖音作品的标题返回 0。索引种子只投影 canonical mock 数据;douyin seed 无索引写入;实时 fan-out 只覆盖 artifacts/production/publishing | projects.list 有 dy-proj-59「AI下的协作开发工程化」;dispatch `pages.search.get q=协作开发` 与 `search.facets q=协作开发` 均全空;persistence-client.ts:4134-4137(种子只用 canonicalDataset)vs :4832(douyinProjects 单独种,无索引) | high |
| S-2 | **artifact 文档挤爆 limit-50 窗口 → 页面 0 结果但实际有匹配**:q=AI 时 facets 显示 {artifact:64, asset:1, project:1} 共 66 条匹配,页面四 tab 全 0、SSR 0 张卡。search() orderBy indexedAt desc limit 50 → 较新的 artifact 文档占满 50 席;composer 只分组 project/knowledge/asset/video,artifact 全被丢弃 | curl dispatch q=AI:pages.search.get 四组全 0;search.facets 返回 66;search.repository.ts:142-143(orderBy+limit);query-services.service.ts:389-393(byType 丢 artifact) | high |
| S-3 | **类型分面点击无效**:panel 导航到 `?q=&type=` 并注释声称「server read REALLY narrows」,但 route 入口只转发 q,type 被丢弃(transport 本身支持) | search/page.tsx:47(`query: { q }`);search-facets-panel.tsx:15-18(注释)、104-113;query-services.transport.ts:67-70(支持 type);实测 dispatch q=AI&type=project → 1 项目,页面 /search?q=AI&type=project → 0 卡 | high |
| S-4 | **打字逐键刷搜索历史**:island 每个 onChange `router.replace` 触发服务端读;服务端每次非空 q 读都 recordSearch(无去重)→ 历史被「A / AI / AI浏 / …」碎片刷屏 | search-interactive-region.tsx:101-119;query-services.service.ts:410-416;审计 2 次 curl 即写 2 条相同 "AI" 行(dispatch 返回 history 可见)。逐键行为未真机敲击验证,链路成立 | medium |
| S-5 | **视频卡时长是编造的**:DTO 携带真 durationLabel,适配器丢弃,前端用实体 id 的 hex 字符算出假 MM:SS 常驻展示;发布时间/播放量为空串 → 「抖音 ·  · 」 | search-view-model.ts:118-126;search-page.tsx:604-608(注释自认 "deterministic fake duration") | medium |
| S-6 | header 搜索框不回填当前 q(searchValue 断线)+ 无提交处理(见 1.3 第一行) | top-header.tsx:137-144;shell-router.tsx:394-409;SSR HTML 验证 | medium(与设计问题 1 同根) |
| S-7 | island 的 isSuspenseFallback 启发式基于已不存在的 Suspense 包装(page.tsx 没有 Suspense),客户端导航瞬间(urlQuery 已更新、initialQuery 未更新)会误判并卸载输入框;因 island sr-only,视觉影响趋零 | search-interactive-region.tsx:20-31(过时注释)、64-65;search/page.tsx 全文无 Suspense | low |
| S-8 | vm.filters 数据路径:后端算 → 适配器映射 → 无人渲染(死代码) | search-view-model.ts:128-133;search-page.tsx SearchSideRail 未接 filters | low |

### 1.8 待对齐点

- 「搜索历史 = 读副作用写入」这个口径与其他页面(明确 mutation op)不一致,是有意的 spec-gap resolution(page.tsx:15-18 注释),对齐时需确认保留与否。
- artifact 是否应成为第五个结果分组(或从索引剔除),需要全局定夺 — 现状是「索引里最大的实体类型在 UI 无处安放」。
- 检索真数据缺席与「数据底座 §7 替换所有 mock/seed」的总差距:搜索是重灾区(命中内容基本全是 mock 种子)。

---

## 2. /monetization 变现中心(疑似违宪残留 → 确认违宪残留)

### 2.1 功能定位与宪法判定

页面回答「哪条内容带来哪笔线索/成交」:转化漏斗(7 阶段)+ 产品/Offer 管理 + 线索/成交登记与流转。

**宪法 §8 第三条明文:「变现中心:移除(太重、不影响飞轮)」**(docs/产品定位.md:43)。现状是**半移除**:
- 已删:侧栏入口(sidebar.tsx:82 注释 `MONE-01:变现中心移除/隐藏…路由保留但无入口`,PRIMARY_NAV 无 monetization 项)。
- 未删:路由(curl /monetization → 200)、shell-router 头部配置(shell-router.tsx:161-167,标题「变现中心」)、整套前端(feature 3 文件)、整套后端(module 18 全部 op,MONETIZATION_OP_IDS 在 PERSISTED_OPS,persistence-client.ts:366-372)、**两条编造的种子产品**(persistence-client.ts:4386-4412)。
- 全仓引用 `/monetization` 的只有 shell-router 一处 → 孤儿路由,知道 URL 就能用全部 CRUD。

判定:**违宪残留成立**。「移除」被执行成了「藏起来」。另外种子产品违反宪法 §7「替换所有 mock/seed」。

### 2.2 代码链路

```
app/(creator)/monetization/page.tsx → MonetizationCenterPage(client=createServerClient(session.ctx))
  → 读:products.list + leads.list + monetization.funnel.get(features/monetization/monetization-center-page.tsx:70-89)
  → backend module 18(monetization.service/repository,真 SQL,user 域)
写(client island monetization-center-interactive-region.tsx,每个成功后 router.refresh()):
  新建产品 → products.create;退役 → products.retire;新增 Offer → products.offers.create(append-only);
  链接内容 → outputs.products.link;登记线索 → leads.create(+金额时 leads.conversions.create);状态流转 → leads.patch
```

### 2.3 区块与交互清单

| 区块 | 元素 | 点了发生什么 | 接线 | 状态 |
|---|---|---|---|---|
| 转化漏斗 | 7 阶段列表 + 未归因桶 + 已/未归因营收 | 纯展示 | monetization.funnel.get(dispatch 验证:全 0,unattributedRatio 0) | works(读);当前全 0 |
| 产品 | 新建产品表单(名称+类型) | createProduct → refresh | island:54-100 → products.create | wired;**写未真机触发(只读纪律),未验证** |
| 产品行 | 「退役产品」按钮 | retireProduct | island:107-115 | wired;未验证(同上) |
| 产品行 | 「新增 Offer」(输价格) | createOffer(不改旧价,append-only) | island:117-127 | wired;未验证 |
| 产品行 | 「链接内容」(**手填内容 id**) | linkOutputProduct(contentRole:"conversion") | island:129-138 | wired;未验证;UX 见 2.6 |
| 线索/成交 | 登记表单(关联内容 id 可空 + 置信度 + 金额可空) | createLead;有金额再 createConversion(两步非原子:lead 成功、conversion 失败会落半状态) | island:213-237 | wired;未验证 |
| 线索行 | 状态下拉 new/qualified/won/lost | patchLead | island:285-294 | wired;未验证 |

### 2.4 数据来源(四桶)

| 数据 | 来源链 | 桶 |
|---|---|---|
| 产品列表(「AI 工程训练营」「论文精读陪跑(1v1)」) | products 表 ← **persistence-client 启动种子编造**(persistence-client.ts:4386-4412,id `product-canonical-*`);dispatch 实测返回这 2 条 | **fixture(编造内容)** |
| 线索列表 | leads 表,实测空 | real(空) |
| 漏斗 7 阶段/未归因/营收 | 真实聚合计算,基于空数据 → 全 0 | real(空) |
| 阶段中文名 | 前端 STAGE_LABELS 映射 | hardcoded(映射,合理) |

### 2.5 数据流向

6 个写 op 全部落 module 18 真表(products/offers/output_products/leads/conversions);conversion 经注入 port fan-out 到 MetricValue/通知/索引(persistence-client.ts:370-371 注释)。**即:一个宪法要求移除的功能,仍拥有全仓最完整的写管线之一。**

### 2.6 设计不合理

1. **存在本身(high)**:违宪残留,见 2.1。要么物理删除(路由+feature+shell-router 分支),要么把归因数据留为纯后端 ingest 能力并在文档里明确豁免 — 现状「无入口但全功能可达」最差:测试面、维护面、认知面全在,价值为 0。
2. 「链接内容」「关联内容 id」要求用户**手工粘贴实体 id**(裸字符串输入框)— 与产品「编导智能体,人只审改删」的心智严重脱节。
3. 线索状态下拉直显英文枚举 new/qualified/won/lost,全中文 UI 里突兀(island:280,305-309)。
4. 漏斗 7 阶段全 0 无空态引导(产品/线索区反而有空态文案)。
5. 种子产品是编造的私域产品(训练营/1v1 咨询),用户没有这些产品 → 「怪」的直接来源。

### 2.7 疑似 bug

| # | 描述 | 证据 | 严重度 |
|---|---|---|---|
| M-1 | 登记「线索+成交」两步写非原子:createLead 成功后 createConversion 失败 → 落一条无成交的线索,UI 无错误提示(useMutation 无 catch 提示,finally 只复位 pending) | island:33-52(无错误面)、217-237 | medium(未真机复现;代码链路成立) |
| M-2 | 违宪残留整体(路由/后端/种子未移除) | 见 2.1 各行证据 | high(产品层面) |

### 2.8 待对齐点

- topics 页按「变现潜力」排序、candidate 模块的 monetization 权重字段是否随「变现中心移除」一并复审(本组范围外,列给全局)。
- 「移除」的执行标准需要全局统一:是「无入口」还是「无代码」。

---

## 3. 边角:@modal / not-found / error

### 3.1 @modal 平行路由

| 文件 | 内容 | 状态 |
|---|---|---|
| @modal/default.tsx | 返回 null(平行槽默认值) | works(约定要求) |
| @modal/(.)projects/new/page.tsx | 拦截 `/projects/new` → NewProjectDialog 弹窗 | wired(拦截行为未真机点击验证;Next 约定 + 文件就位) |

NewProjectDialog(components/overlays/new-project-dialog.tsx):
- 关闭逻辑:有历史 → router.back();直达 → replace /projects(:52-70)。Esc/遮罩/焦点圈完备(:73-118)。
- 提交:**真 createProject**(contract → SQL),refresh 后按需跳 `/projects/<id>/research`(:174-197)。
- 文档注释失真:「createProject appends a project to the mock store…`*-mock-*` id」(:170-173)— 现已是真库;拦截路由文件的注释「The dialog content is a placeholder」(@modal/(.)projects/new/page.tsx:11-12)同样过时。

**弹窗表单 NewProjectForm 两处违宪(features/projects/new-project-form.tsx)**:
1. 「内容模板」深度解析/教程干货/观点表达/评测对比/故事叙事/其他 → 映射 contentType video/article/audio/image(:106-113)。宪法 §8:「不分视频类型:唯一的『类型』区分是横屏/竖屏」。
2. 项目层选目标平台(抖音「竖屏短视频」等,:98,:263-265)。宪法 §8:「平台只在发布层选,不在项目层」。
   (targetPlatforms 一路写进 project_target_platforms 意图行 — 违宪字段已进数据层。)

/projects/new 直达全页(app/(creator)/projects/new/page.tsx:22-27):`<DashboardPage />`(无 viewModel → fixture 回退,features/dashboard/dashboard-page.tsx:72)+ 弹窗。**直达/刷新时弹窗背后是 fixture 假驾驶舱**,与真首页(op-backed)数据不一致。已验证:curl /projects/new → 200,HTML 含 dialog + dashboard 背景。

### 3.2 not-found.tsx

- 视觉/文案(中文、保留侧栏、返回首页)本身合格(app/(creator)/not-found.tsx)。
- **但任意乱 URL 根本走不到它**:curl /nonexistent-route-xyz → HTTP 404,正文是 **Next 默认英文页「404: This page could not be found.」,无 AppShell、无中文**(已验证 HTML)。原因:app/ 根目录没有 not-found.tsx(ls 验证:只有 (creator)/api/login/register/layout/globals.css);route-group 内的 not-found 只捕获组内 `notFound()` 抛出。
- 全仓唯一 notFound() 调用:projects/[projectId]/page.tsx:65(OwnershipError 时)。实测 /projects/definitely-not-a-project → **HTTP 200** + 定制 404 视觉 + 侧栏(状态码 200 因流式渲染已开始,语义上应是 404)。
- 结论:D-007「共享 404 视觉」只覆盖了最少见的一类 404(坏项目 id),最常见的一类(手滑 URL/失效外链)露出英文裸 404。

### 3.3 error.tsx

- 代码检查合格:role=alert、digest 展示、「重试」reset()、「返回首页」保留侧栏可逃生;console.error 仅本地(注释明说无远端 error sink)。
- `error.message` 直显给用户:开发态会露技术栈英文信息;生产态 Next 会用泛化 digest 消息兜底,可接受。
- **未验证**:只读纪律下无法安全触发运行时错误,未真机看到该边界渲染。

### 3.4 边角疑似 bug 汇总

| # | 描述 | 证据 | 严重度 |
|---|---|---|---|
| E-1 | 任意乱 URL 渲染 Next 默认英文 404(无 AppShell),定制 404 形同虚设 | curl /nonexistent-route-xyz → 404 + 「404: This page could not be found.」;app/ 无根 not-found.tsx | medium |
| E-2 | /projects/<bad-id> 返回 HTTP 200 而非 404(视觉对,状态码错) | curl -w 实测 status=200,HTML 含 creator-not-found | low |
| E-3 | /projects/new 直达背景是 fixture 假驾驶舱 | projects/new/page.tsx:22-27;dashboard-page.tsx:72 | medium |
| E-4 | 新建项目弹窗:内容模板(contentType)+ 项目层平台选择,双违宪 §8 | new-project-form.tsx:98,106-113;产品定位.md:41-42 | high(宪法层面) |
| E-5 | 弹窗两处注释过时(mock store / placeholder) | new-project-dialog.tsx:170-173;@modal/(.)projects/new/page.tsx:11-12 | low |

### 3.5 待对齐点

- 404 策略需全局:补根 app/not-found.tsx(或全局 catch-all),中英文与 AppShell 口径统一。
- 「新建项目」表单字段(contentType/模板/平台)与宪法 §8 的冲突属于 projects 组页面共同问题,需全局裁决(改横竖屏 or 删字段;数据层 project_target_platforms 同步处置)。

---

## 4. 三页共同结论(给全局对齐)

1. **搜索是「数据底座 §7」欠账最重的页面**:表结构真、查询真,但内容池还是 mock 种子;用户真实资产(46 作品)整体缺席;外加 limit-50 被 artifact 挤爆 + type 转发断线,叠加成「搜什么都是 0」。用户「怪怪的」在此页有直接体感。
2. **变现中心证实违宪残留**,且执行标准(「移除=藏入口」)需要全局统一定义。
3. **边角的诚实度不错**(404/error 文案、诚实漏损桶、空态),但 404 覆盖面错位、弹窗表单违宪字段是隐藏在「边角」里的宪法冲突。
4. 反复出现的模式:**注释声称的行为与实际接线不符**(facets panel 声称 server 消费 type;dialog 声称 mock store;island 声称 Suspense fallback)— 建议全局审「注释即文档」的漂移。
