# T-102 项目物理删除 —— 真机 + SQL 验证记录

日期:2026-07-04 · 分支 `refactor/agent-and-structure` · 数据源:真 Postgres(`DATABASE_URL=postgres://creatoros@localhost:5432/creatoros`)

## 契约 / 后端 / 前端全链

- contract 新增 `projects.delete`(`DELETE /projects/:projectId`,additive,返回删除前 `ProjectResource` 快照)。
- backend `projects.service.deleteProject` → `repo.deleteProjectCascade`(事务包裹,自底向上级联删除)。
- 前端 `project-actions.tsx` / `project-row-menu.tsx` 新增红色「删除」入口 → 系统级二次确认 `DeleteProjectDialog`(禁原生 confirm)。

## 真机 E2E + SQL 级联证据(dispatch 路径,真 Postgres)

登录 `zyongzhu@creatoros.local` → 建项目 `project-47ecd216-28` + output + 经 SQL 埋满关联行 → `projects.delete` dispatch → SQL 逐表核对。

| 表 | 删除前 | 删除后 |
|---|---|---|
| projects | 1 | **0** |
| content_outputs | 1 | **0** |
| output_stages | 4 | **0** |
| artifacts | 1 | **0** |
| artifact_versions | 1 | **0** |
| script_sections | 1 | **0** |
| publications | 1 | **0** |
| publication_revisions | 1 | **0** |
| reviews | 1 | **0** |
| review_insights | 1 | **0** |
| material_links | 1 | **0** |
| project_stages | 7 | **0** |
| audience_signals(评论信号) | 1 (publication_id=t102-pub) | **1(行留存,publication_id=NULL 已解锚)** |

- `projects.delete` HTTP 200,返回被删项目快照(id 一致)。
- 评论信号(`audience_signals`)按设计**不物理删除**,只把指向已删 publication 的 `publication_id` 置空(独立 ingestion 溯源保留,消除悬挂引用)。

## 确认门(UI · 真机 Chrome 预览已截图确认)

- 项目列表行「⋯」菜单:打开 / 归档(红) / **删除(红,Trash 图标)** 并列。
- 点「删除」→ 系统级 Dialog:标题「删除项目「<标题>」?」,警告「删除**不可恢复**,将一并清除该项目的脚本、发布记录、复盘与数据。若只想暂时隐藏,请改用「归档」。」,按钮 取消(outline) / 永久删除(destructive)。
- 点「取消」→ 不删(SQL 核对:目标项目仍在,count=1)。
- imported 项目额外一行红字「该项目含真实作品数据(导入的历史作品),删除后其发布记录与评论关联将一并清除。」

> 截图:通过 dev server(:3000)真机 Chrome 预览会话捕获,已在会话内联展示(row 菜单 + 确认框)。headless Playwright 因 Radix DropdownMenu 的 pointer-capture 在无头环境不展开,未落 PNG 文件;真机预览是本次的视觉验收凭据。

## 已知边界(重要)

- **`project-actions.tsx`(旧 ProjectOverviewActions 岛)已按 spec 加了删除入口,但该组件当前无任何 live 路由挂载**——`/projects/[projectId]` 在 T-055a 已重做为 `DraftWorkbenchPage`(draft-workbench)。故详情页的 live 删除入口需落在 draft-workbench 顶条,而 draft-workbench 属本任务**禁区**(T-086 刚提交),未改。
- 结论:**live 生效的删除入口 = 项目列表行菜单**(已真机验证);详情页删除入口待后续任务解禁 draft-workbench 后补(复用现成 `DeleteProjectDialog`,一行挂载即可)。

## 归档过滤(T-102 前半,回归确认)

- 项目页「全部项目」tab 计数 = 78(库内 81 个项目,3 个 archived 被剔除),归档只在「已归档」tab 出现。

## 自动化验证

- contract test:103 passed。
- backend test:833 passed / 4 skipped(含新增 `deleteProject` 级联锁测 + 17-op conformance + 删后 get 404)。
- frontend test:projects/project-overview/dispatch 相关 49 passed(含删除确认流:弹框不删 → 确认才 deleteProject + 跳列表;取消不删;imported 额外警告;「全部」排除 archived 锁测)。
- tsc:contract / backend / frontend / ai-worker / mcp-server 全绿。
- eslint(改动文件):无 no-alert / 无新增告警。
