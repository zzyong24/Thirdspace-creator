# 调研:收藏夹采集「今日新选题只展示 ~5 条」根因(favorites→candidate 管线)

- **日期**:2026-07-13
- **触发**:用户实测「采集收藏夹 → 新增 13 条,更新 3 条」采集层成功,但选题中心「今日新选题」条带只展示 ~5 条。
- **方法**:Explore 子代理只读调研 favorites 采集 → candidate 写入全链。
- **拍板**:主根因(≤3/run 上限)当轮修(T-278,上限 3→50);二级放大器(NULLS LAST 分页)登记 T-282 后续,pool 增长后再做。

## 结论(确切根因)

**不是「显示层丢候选」,而是「写入层根本没把 13 条转成候选,只转了 3 条」。**

favorites collector 有硬上限 **≤3/run**:`favoritesService.listPendingItems(ctx, 3)`(`frontend/src/server/persistence-client.ts:5666`)。13 条新采里本轮只有 3 条 promote 成 `source=favorites` candidate,其余 10 条留在 `favorites_items` 台账 `status=pending`,等后续 run FIFO 每轮 3 条慢慢消化。favorites 采集作业每天只在 9:50 跑一次 → 一批 13 条要 ~5 天才全进池。

日志两个数的语义被重定义:
- `新增 13 条` = `itemsNew` = 写进 `favorites_items` 台账的**新行数**(原始收藏条目,**不是 candidate**)。
- `更新 3 条` = `itemsUpdated` = 本轮真正 promote 成 candidate 的条数(**不是**"更新已存在候选")。

「今日新选题」那 ~5 条 = 这 3 个 favorites 候选 + 同日其它源(benchmark 拆解 / darkhorse / topic.daily)~2 个,**都正确显示了**——收藏夹这批本就只生成 3 个候选。

「createdAt 赋旧值」的怀疑**不成立**:promote 出的候选 `createdAt = deps.now()`(`candidate.repository.ts:268`),就是采集当下=今天,能过 `filterTodayCandidates`。

## 证据链(文件:行号)

| 环节 | 位置 | 要点 |
|---|---|---|
| 日志文案 | `scheduled-collection-runner.ts:256` | `新增 ${itemsNew} 条,更新 ${itemsUpdated} 条`;两数取自 collector 返回 |
| **promote 上限 3** | `persistence-client.ts:5666` | `listPendingItems(ctx, 3)` —— 本 bug 核心 |
| 返回值映射 | `persistence-client.ts:5740-5743` | `itemsNew=recordedNew`(台账),`itemsUpdated=promoted`(进池) |
| createdAt=今天 | `candidate.repository.ts:268` | `createdAt: deps.now()`;service 只透传不覆写 |
| 台账 stamp 采集时间 | `favorites.repository.ts:216` | `createdAt: nowIso`,`onConflictDoNothing((user,awemeId))` |
| 前端过滤 | `topics-supply-region.tsx:106` | `filterTodayCandidates` 只按 `createdAt >= dayStartIso` |
| 取数 | `topics-page.tsx:166-168` | `page:1,pageSize:100,sort=predictedScore` |

## 二级放大器(→ T-282,当前未触发)

候选排序 `predictedScore DESC **NULLS LAST**`(`candidate.repository.ts:240`),favorites 候选 `predictedScore=null` 排最末;前端只取前 100(`pageSize:100`)。**pool 里已有 ≥100 条有分候选时,当天新 promote 的 null 分 favorites 候选会掉出第 1 页 → 连「今日」过滤都轮不到,直接消失。** 当前 ~5 条可见说明 pool 未到 100,但会随 pool 增长恶化,与主根因叠加。

## 修复方案

- **T-278(已修,主根因)**:favorites 是**用户亲手挑的**(非自动信息流,不需 benchmark 那种「防灌库」限速),上限 3→50(`FAVORITES_PROMOTE_PER_RUN`,匹配单夹抓取 ≤50/夹),一轮全进池、当天即见。
- **T-282(后续,二级放大器)**:根治需契约支持按 `createdAt` 排序 / 日期过滤(`CandidateSort` 现仅 positioningFit/demandCount/predictedScore),给「今日新选题」条带单独按 createdAt 拉数;或给新候选非 null 初值(慎,污染排序语义)。低优先。

## 附:完整调用链

```
定时 9:50 (collection-bootstrap, sourceKind="favorites")
 → dispatchScheduledCollection (persistence-client:5752)
   → runScheduledCollection (scheduled-collection-runner:178)
     → collectors["favorites"] (persistence-client:5582)   ← bug 所在
        ① listEnabledFolders ② fetchDouyinCollectsFolders+匹配 ③ 逐夹 fetchDouyinCollectsVideos(≤50/夹)
           → recordItems → INSERT favorites_items(createdAt=now, onConflictDoNothing) → recordedNew=13
        ④ listPendingItems(ctx, 3) ←★硬上限  for≤3: createCandidate(source=favorites) → promoted=3
        ⑤ runFavoritesDistill(best-effort 蒸馏,正交)
        return { itemsNew:13(台账), itemsUpdated:3(进池) }
前端(异步):TopicsPage→loadViewModel→listCandidates(size100,predictedScore DESC NULLS LAST)
 → TodayTopicsStrip→filterTodayCandidates(createdAt>=今日零点) → 今日≈3(favorites)+~2(其它源)
```
