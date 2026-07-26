# T-515：编导反复声称“49 条稿子压在 review 没发”诊断

## 结论

这不是实时任务状态，也不是稿件审核队列。

`review` 是 CreatorOS 项目生命周期的英文枚举，产品语义是“复盘”。导入的历史已发布作品
统一停在 `current_stage='review'`，作为发布后的复盘入口；项目列表对此类 `source='imported'`
记录明确显示“已发布”，不显示“待审核”。

“49 条内容已写完但全部压在 review 阶段未发布”已经作为静态文本保存在
“月明水清深”账号定位母版的 `facets.statusNote` 中。每轮 ChatBox 都会把该字段渲染为
`当前状态：...` 注入编导 system prompt，因此模型会反复复述。它不随项目数据变化。

## 当场真实数据

对运行中桌面库制作临时只读快照后查询：

- “月明水清深”：80 条 `source='imported'`、`current_stage='review'` 项目。
- 80 条的 `platform_ref.publishedAt` 均非空。
- 80 条均能关联到 `publications.published_at`。
- 另有 1 条手动项目处于 `brief`。

所以当前事实是“80 条已发布历史作品进入复盘阶段”，不是“49 条未发布稿件等待审核”。

## 根因链

1. `listRecentProjects` 读取项目时虽然拿到了 `source/platformRef`，但向定位生成器投影时丢掉
   `source`，并把所有 `publishedAt` 写死为 `null`。
2. `formatWorksBrief` 只用 `publishedAt` 或 `status === 'published'` 判断已发布；导入项目的
   `status='active'`，于是把它们标成原始英文 `review`。
3. 定位模型把 `review` 误解为“等待审核”，并把当时看到的数量 49 写进 `facets.statusNote`。
4. 用户采纳定位后，这段静态文本落库；`assembleCreativeContext → formatPositioning` 每轮都把
   它注入选题编导，所以即使当前数量已变成 80，仍会反复说 49。

## 代码证据

- `frontend/src/lib/stage-labels.ts:12-41`：`review = 复盘 / 复盘中 / 数据复盘`。
- `frontend/src/features/projects/projects-page.tsx:585-601`：imported 项目显示“已发布”。
- `frontend/src/server/persistence-client.ts:3053-3075`：作品投影把 `publishedAt` 固定为 null。
- `backend/src/modules/ai-runtime/creative-context.ts:1092-1111`：缺发布证据时直接输出 stage。
- `backend/src/modules/ai-runtime/creative-context.ts:1168-1219`：`statusNote` 每轮进入定位 brief。
- `backend/src/modules/ai-runtime/chat-runner.ts:707-725`：定位 brief 每轮进入 ChatBox system prompt。

## 后续修复建议

1. `listRecentProjects` 透传 `source` 和真实 `platformRef.publishedAt`，或通过 publication 读端口
   解析发布状态。
2. `formatWorksBrief` 使用共享中文阶段词表；`source='imported'` 必须明确标“已发布”，禁止把
   内部英文枚举直接喂给模型。
3. `statusNote` 不再允许保存项目数量、任务状态等易过期事实；实时数量由只读上下文计算。
4. 清理当前账号已保存的错误 `statusNote`，否则只修投影仍会继续复读旧句。
