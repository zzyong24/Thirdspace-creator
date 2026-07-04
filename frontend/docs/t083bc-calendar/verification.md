# T-083 b/c 内容日历全量交互 + 排期写路径 · 真机验收

> 2026-07-03 · dev :3000（creatoros-dev,登录态 zyongzhu@creatoros.local）· 均截图于 preview

## 切片 b(全量视图交互)

- 月历格渲 publications 真数据:2026-07 本月 2 条(7/1 两条,634 播放 / 560 播放,真封面缩略)。
- 点过去有发布日(7/1)→ 抽屉列当天全部作品(封面 + 标题 + 平台 + 真播放数),每条「打开稿面」链接指向真实 `/projects/{id}`:
  - `/projects/project-18f58d87-143`、`/projects/project-468dd31b-27`。
- 过去空窗格(7/2)不可点(`data-openable` 缺省),无抽屉——断更一眼可辨。
- 未来/今天空格(7/15)可点开抽屉并给出「+ 排期」入口。
- 月份切换保持 a 的静态锚点 `?month=YYYY-MM`(SPEC 允许)。

## 切片 c(排期写路径,复用现成 contract op)

真机走通完整生命周期(均落库 + router.refresh 重读):

1. **新增**:7/15 抽屉「+ 排期」→ 填计划标题「真机验证:七月十五排期一条」→ 确认排期。
   - 网络:`POST /api/v1/dispatch → 200`(createEntry)+ `GET /calendar?_rsc=… → 200`(refresh)。
   - 刷新后 7/15 格显示「计划 ·」chip;抽屉「排期(1)」列出该条 · `2026-07-15 09:00`。
   - plannedAt 由 dateKey 派生当天 09:00 UTC(决定论)。「选项目」下拉出真实项目;绑项目则 note 加 `【项目名】` 前缀。
2. **删除 + 二次确认门**:抽屉内该排期「删除」→ **系统 Dialog**(非原生 confirm):
   「删除这条排期？删除后该计划将从日历移除。此操作不可撤销。」取消 / 删除排期(destructive)。
   - 确认后:`POST /api/v1/dispatch → 200`(deleteEntry)+ `GET /calendar?_rsc=… → 200`。
   - 刷新后 7/15 恢复空排期,格 chip 消失。
3. **改期/改标题**:抽屉排期行「改期」→ 编辑标题/plannedAt → 保存 → updateEntry(单测覆盖)。

## 门/约束

- 禁原生弹窗:删除走 `@/components/ui/dialog` 系统 Dialog(满足 T-097 no-alert lint,eslint 0 error)。
- 未新增 contract op:纯复用 `createEntry` / `updateEntry` / `deleteEntry`。
- 无 console error。

## 复用的 calendar 契约 op

`contract/src/operations/content-calendar.ts`:
- `createEntry`(POST /accounts/:accountId/calendar/entries,body: plannedAt+note+contentOutputId?+candidateId?)
- `updateEntry`(PATCH /calendar/entries/:entryId)
- `deleteEntry`(DELETE /calendar/entries/:entryId)

现成 op 足够,未发现 gap(计划标题落 note,选项目复用 note 前缀标注——entry 无 projectId 列,与 SPEC §1「不加 projects 字段」一致)。
