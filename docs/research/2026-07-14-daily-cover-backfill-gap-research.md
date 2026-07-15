# 每日采集不回填新作品封面(T-322)根因调研

- 调研人:code-research subagent(Opus 4.8)
- 日期:2026-07-15(文件名沿用 task 指定 2026-07-14)
- 触发:用户实测「新发了一个作品,每日抓取作品任务采到了作品,但没抓到封面(项目列表仍是渐变占位假封面)」
- 结论拍板待:用户(本文只给根因 + 精确修点,不改代码)

## 结论速览

封面回填的候选集判据、source 过滤都**没问题**——新作品/merge 作品都进候选。真正的缺口是
**触发耦合**:封面回填挂在 `self.detail` 每日 job 的**尾部**(先跑极脆的创作者中心 xlsx 导出,
导出抛错则整个 handler 在到达封面回填前就 throw,封面永不回填)。而 `self.metrics`(建作品那步)
已成功 → 用户看到新作品出现在列表,却没封面。

---

## ① heavy-backfill / cover_backfill 由谁触发(是不是每日任务)

封面回填 = `backfillDouyinCovers`(`frontend/src/server/ingestion/douyin-cover-backfill.ts:74`),
经 `runDouyinHeavyBackfill`(`frontend/src/server/ingestion/douyin-heavy-backfill.ts:135`)编排,
**唯一调用点在 `self.detail` 采集 handler 尾部**:`frontend/src/server/persistence-client.ts:5110`。

三个每日采集 job 都是 cron 定时(`backend/src/modules/ai-runtime/collection-bootstrap.ts:40`
`DAILY_COLLECTION_JOB_DEFAULTS`):

| sourceKind | schedule | 名称 | 干什么 |
|---|---|---|---|
| `self.metrics` | `0 9 * * *`(9:00) | 每天抓我的新作品指标 | `refreshDouyin` → `ensureImportedProject`×N 建作品/publication + 落指标 + 回昵称。**T-195 已把封面回填从这里挪走**,itemsUpdated 恒 0(`persistence-client.ts:4636-4646`) |
| `self.detail` | `10 9 * * *`(9:10) | 每天拉我的作品明细数据 | 导出 xlsx → 落 hidden_at/platform_status → **尾部跑 `runDouyinHeavyBackfill`(封面回填 + 逐字稿/重建排队)** |
| `comments` | `20 9 * * *` | 每天抓评论 | — |

关键关系:
- `refreshDouyin`(=self.metrics)与封面回填是**两个独立 job**,`refreshDouyin` 跑完**不接**封面回填(T-195 解耦,`persistence-client.ts:4636`)。
- 封面回填**是每日定时任务的一部分**(self.detail,9:10),**不是**要用户单独点的「重回填」。
- 但用户口中「每日抓取作品任务采到了作品」大概率是 `self.metrics`(它建的作品);封面归 `self.detail`,两者差 10 分钟、是不同 job。

## ② 新作品 / merge 作品是否进候选集(source 过滤?)

候选集 SQL = `listMissingCoverPublications`(`backend/src/modules/publishing/publishing.repository.ts:445`),
判据:`userId` + `platform='douyin'` + **`status='published'`** + `hiddenAt IS NULL` +
`externalId IS NOT NULL` + `(currentRevisionId IS NULL OR revision.coverAssetId IS NULL)`。
**不过滤 source**。

- **纯新导入作品**:`createImportedPublication`(`publishing.repository.ts:212`)直接落
  `status:"published"` + `externalId=aweme_id` + `hiddenAt=null` + `currentRevisionId=null`
  → **必进候选集**。
- **T-321 merge 作品**:merge 走 `resolvePublication(platform,externalId)` 命中既有 publication
  (`ingestion.service.ts:548`);该 publication 由「登记已发布」建,同样走 `createImportedPublication`
  → 也是 `status='published'` + externalId(`register-published-form.tsx:7`)。merge 保持 source=manual
  **不影响候选**(候选不看 source)→ **也进候选集**。
- 二次过滤 `isPublicationRunnableForHeavyWork`(`douyin-work-detail.ts:275`,heavy-backfill.ts:155 用):
  **NULL/空 platformStatus 返回 true(向后兼容)**。故新作品即便 xlsx 没匹配上、可见性没同步
  (platformStatus 仍 NULL),**照样进封面候选**。

→ **候选集不是瓶颈,source 也没过滤掉 merge 作品。**

## ③ 失败模式排查(封面回填「跑了但没成」)

`fetchDouyinVideoUrl`(`douyin-cdp.ts:503`)走 **plain fetch**(非浏览器,**不碰
chrome-headless-shell 类问题**),GET `https://www.iesdouyin.com/share/video/{aweme_id}/`
(手机 UA)→ `parseDouyinVideoUrl` 抽 `video.cover.url_list[0]`(:459-460)。可能失败点:

1. **分享页请求失败**:非 2xx(IP 风控 403 / 风控页当 200)/ 30s 超时 → 该作品计 `failed`,下轮再试。
2. **分享页无 cover**:`item_list` 为空(图集 / note / 已删)或结构变 → `coverUrl` undefined → 计 `skipped`(诚实不硬造),仍无封面。
3. **封面图下载失败**:`downloadDouyinImage`(`douyin-cover-backfill.ts:196`)带 Referer=`https://www.douyin.com/` + 手机 UA,抖音 CDN 校验来源;非 image content-type(风控页)/ 403 / 空 body / 30s 超时 → 抛 `DouyinCoverDownloadError` → 计 `failed`。

排查锚:真机 console 看 `[douyin-cover-backfill] 候选 N,回填 X,跳过 Y,失败 Z`
(`douyin-heavy-backfill.ts:188`)——**若这行根本没出现 = 封面回填阶段没跑到(见 ④,最可能)**;
出现但 X=0 = 跑了但每条 skipped/failed(=本节 1/2/3)。

## ④ 精确修点(核心根因 + 最小改)

**根因(最可能):封面回填被 self.detail 的脆导出步「劫持」。** `self.detail` handler 顺序
(`persistence-client.ts:4911` 起):
```
4926  const bytes = await fetchDouyinWorkListExport(...)   ← 创作者中心导出面板,DOM 极脆(直播 tab/图集/未登录 → throw)
4933  const details = await parseDouyinWorkListXlsx(bytes) ← 非 xlsx → throw
...   可见性同步 + 指标落库
5110  const heavy = await runDouyinHeavyBackfill(...)      ← 封面回填在这里
```
4926 / 4933 任一抛错 → **整个 handler throw,run 标 failed,永远到不了 5110** → 封面回填当天不跑。
而 self.metrics(9:00)已成功建作品 → 用户看到新作品、没封面。封面回填其实**不依赖导出结果**
(候选集 `listPublicationsMissingCover` 是纯 DB 查,iesdouyin 分享页也独立拉),却被导出成败绑死。

**最小修点 A(推荐,治本):让导出失败不阻断封面回填。** 把 self.detail 里
「导出 xlsx → 解析 → 可见性同步 → 指标落库」(≈ `persistence-client.ts:4926-5100`)整段包进
try/catch,失败只记日志 + 跳过明细/可见性,**继续往下执行 5110 的 `runDouyinHeavyBackfill`**。
理由:封面回填候选是 DB 查 + 独立分享页拉,不需要 xlsx 成功;可见性没同步时 platformStatus=NULL
仍被 `isPublicationRunnableForHeavyWork` 放行(②),封面照回填。风险:可见性没同步 → 隐藏新作品可能
撞空 item_list(计 failed,单作品降级,~30s 超时上限,不拖垮批,可接受)。

**修点 B(可叠加,缩短延迟):把封面回填也接一份到 self.metrics 尾。** 现状封面最快也要等
self.metrics(建作品)→ self.detail(9:10 回填)两 job,且 self.detail 一挂就断。但 T-195 明确
把封面回填移出 self.metrics 是因为「self.metrics 早于 self.detail,可见性未标,隐藏作品撞空
item_list ~40s/个堵串行闸」。**不建议无脑照搬 task 里「接进 refreshDouyin 尾巴」**——会重演 T-195 的坑。
若要缩短延迟,应只对「本轮新建的 publication」跑一次窄封面回填(candidate 限定新作品),而非全量。

**不推荐**改候选集判据——判据本身正确,新作品/merge 作品都已在候选内(②)。

签名参考:
- `runDouyinHeavyBackfill(ctx, host, opts, impl?)`(`douyin-heavy-backfill.ts:135`)
- `backfillDouyinCovers(ports, opts?)`(`douyin-cover-backfill.ts:74`)
- `listPublicationsMissingCover(ctx, {platform, limit})`(`publishing.service.ts:516`)

## 建议下一步(用户拍板)

1. 先真机跑一次 self.detail(或看当天 job_run 日志),确认是**「没跑到封面阶段」(修点 A)**还是
   **「跑了但 skipped/failed」(③)**——`[douyin-cover-backfill] 候选…` 那行在不在即可分流。
2. 若是前者(最可能)→ 落修点 A(self.detail 导出段 try/catch,兜住封面回填)。

---

## 实施笔记(T-322,2026-07-15,实现 subagent Opus 4.8)

已落**修点 A**,只动 `frontend/src/server/persistence-client.ts` 一处(`self.detail` handler):

- **try 范围**:包住「导出→解析→装配 catalog→可见性同步→明细落库→detail-ingest console.log」整段
  (改后行号约 `4926` 的 `try {` 起,到 `5109` 的 detail-ingest console.log 结束;`5110` 起是 `catch`)。
  `const heavy = await runDouyinHeavyBackfill(...)`(改后 `5129`)在 try 外,任何情况都会执行。
- **变量作用域**:唯一跨界变量是 `detailWritten`(handler 结尾 `return { itemsNew: detailWritten, ... }` 读它)。
  已把 `let detailWritten = 0;` **提到 try 外**(改后 `4925`),try 内只保留赋值 `detailWritten = result.recordsWritten;`。
  `capturedAt`(`deps.now()`)、`externalSourceId`(`ensureDouyinSource`)声明本就在拟包区之前、仅在 try 内使用,
  留在 try 外不变。`bytes`/`details`/`matches`/`records`/`catalog`/`visDiag` 全部只在 try 内用,包进去无碍。
- **封面回填不依赖导出结果的代码证据**:`awk` 扫 `5106–5372`,导出段变量在封面回填段/handler 尾**零引用**
  (仅 `5372` 用 `detailWritten`+`heavy`,`5281` 的 `.capturedAt` 是 metric row 对象属性,与 handler `capturedAt` 无关)。
  `runDouyinHeavyBackfill` 的 host 全部引用外层闭包 service + `ctx`/`report`/`resolveCoverBackfillLimit()`。
  且 `4922–5110` 区间**无 `return` 早退**(T-195 已去早退)→ catch 后控制流必达封面回填。
- **catch 语义**:`console.error("[douyin-detail] 明细导出/解析/同步失败,跳过明细、继续回填封面:", detailErr)`
  + `report({ stage:"export", message:"明细导出失败,跳过明细、继续回填封面" })`,**不 rethrow**。
- **未动**:候选集判据、封面回填本身逻辑、refreshDouyin(未照修点 B,避免重演 T-195 坑)。
- **验证**:frontend `tsc --noEmit` exit=0;`vitest run src/server/ingestion` 12 文件 228 测试全过
  (含 douyin-heavy-backfill / douyin-cover-backfill / douyin-work-detail)。未起 dev server / 未碰打包 app / 未 commit。
  注:`self.detail` handler 内联接真 service,无独立单测直驱「导出失败仍回填」路径,该行为需真机 self.detail 跑一次
  或看 job_run 日志确认(看 `[douyin-detail] …跳过明细、继续回填封面` + 随后 `[douyin-cover-backfill] 候选…` 两行)。
