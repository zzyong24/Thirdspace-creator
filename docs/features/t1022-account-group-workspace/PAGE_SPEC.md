# 账号组页面合同

## 当前正式接线（2026-10-05）

用户“ok 开始执行”的实施授权见 DEC-GROUP-1022。本节以当前真实 operation registry 和页面接线为准；下方候选表与原型走查保留作历史设计，不把 planned 名称当成已实现操作。

| 页面 | 当前真实读取与动作 | 范围及验收 |
| --- | --- | --- |
| 全局侧栏 | `accountGroups.list/get`；选择同步 group cookie/header，清理平台账号及日期查询 | 仍在原侧栏底部；保留个人身份；窄窗折叠后同样可操作；在途前台操作沿用离开保护 |
| 首页 `/` | `pages.groupOverview.get` 组合现有 dashboard/projects/publishing/analytics service ports | 原问候、五指标、三列六卡保留；平台只筛数据，不隐藏共享创作卡；未知留空，空图保留坐标与恢复入口 |
| 总览 `/overview` | 同一个 `pages.groupOverview.get` | 播放、阅读分开；粉丝按账号合计未去重；展示覆盖与实际采集时间 |
| 管理 `/accounts` | `accountGroups.create/update/archive/restore`、`accounts.create/update`、binding capabilities、binding start/status/cancel、transfer preview/transfer、migration preview/apply/status/undo、resource grant读取/撤销预览/撤销 | 真实组ID、账号ID及版本；手动登记不等于登录成功；转组与历史资料归组明确分开，需预览digest |
| 发布 `/publishing` | 既有 publishing/content-calendar/project 服务投影 + `pages.groupOverview.get` | 一期内容展开真实账号版本；可切逐条记录；月份切换保留平台/账号/日期；复盘入口携带同一范围和真实目标账号 |
| 分析 `/daily-report` | `pages.dailyReport.get` + `pages.groupOverview.get` 的安全账号选项 | 所有图与表使用同一组、平台、账号、日期；原生横条先于明细，未知不画零条 |
| 项目复盘 | 先验证真实项目owner/group，再读取同组 `pages.dailyReport.get`，按projectId裁剪事实 | 各账号版本并列；预测只消费所选publicationIds，不拿通用稿件分替代跨平台实绩；既有手动复盘与AI候选采纳保留 |
| 相邻创作页、助手及后台任务 | 复用既有真实operation与service ports，并透传冻结group scope；平台私有操作仍带真实accountId/member version | 不创建平行主表；切页面不改在途任务归属；资源读取与写权分开校验 |

本实现没有 `pages.groupDashboard`、`pages.groupAnalytics`、`pages.groupWorks` 或 `pages.groupContentReview` 这些外部操作。它们是历史候选描述，最终复用既有合同与单一组总览读取，避免重复事实及接口。

## 正式浏览器旅程合同

浏览器路径只使用隔离服务中从页面真实创建、保存的组和项目，不用SQL种数替代写入回读。图表有数值的视觉样本另见 chart-fixture.mts，明确不作为真实平台采集证据。普通用户文案不显示治理ID或机器错误前缀。

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-1022",
  "watched_paths": [
    "frontend/src/components/shell",
    "frontend/src/features/platform-account",
    "frontend/src/features/group-workspace",
    "frontend/src/features/dashboard",
    "frontend/src/components/analytics",
    "frontend/src/app/(creator)/page.tsx",
    "frontend/src/app/(creator)/accounts",
    "frontend/src/app/(creator)/projects",
    "frontend/src/lib/http-transport.ts",
    "frontend/src/lib/account-events.ts",
    "frontend/src/lib/session.server.ts",
    "frontend/src/lib/request-context.server.ts",
    "frontend/src/server/persistence-client.ts",
    "backend/src/modules/platform-account",
    "backend/src/modules/projects",
    "backend/src/application/queries/group-workspace.ts",
    "contract/src/operations/account-groups.ts",
    "contract/src/request-context.ts",
    "contract/src/workspace-operation-scope.ts",
    "docs/verification/t1022/run-journey.mjs"
  ],
  "copy_guard": {"forbid_internal_ids": true},
  "required_checks": [
    {"id":"collection","test_id":"group-control-project-collection"},
    {"id":"selection","test_id":"selected-project-visible-or-empty"},
    {"id":"detail","test_id":"project-detail-current-group-or-empty"},
    {"id":"ownership","test_id":"switch-group-old-detail-denied"},
    {"id":"empty","test_id":"zero-account-create-modal-focus"},
    {"id":"write-read","test_id":"group-rename-save-reload"},
    {"id":"conflict","test_id":"real-version-conflict-keeps-input"},
    {"id":"shared-context","test_id":"platform-filter-keeps-creation-context"}
  ],
  "required_conditions": ["empty","error","back","refresh","repeat"],
  "viewports": [{"width":1366,"height":900},{"width":1024,"height":768}],
  "coherence_groups": [{
    "id":"group-project",
    "pattern":"master-detail",
    "policy":"clear-or-reselect",
    "check_ids": {
      "collection_matches_control":"collection",
      "selection_valid_or_empty":"selection",
      "detail_matches_selection_or_empty":"detail",
      "next_action_when_empty":"empty"
    }
  }]
}
```

写入范围覆盖的是当前真实依赖，不为未提交工作树缩小 watched_paths。正式 receipt 必须绑定清洁的当前提交；浏览器通过与机器 receipt 通过分别记录。

## 历史设计候选（不作为当前实现回执）

所有新操作为planned。确认SPEC并补齐contract/backend/public-chain测试后才接入产品。静态原型没有真实绑定或写库动作。

| 页面 | 主对象与优先级 | 控件→操作 | 反馈与下一步 |
| --- | --- | --- | --- |
| Shell | 原版导航、底部当前组、个人身份 | 组选单→accountGroups.list/get；选择→服务端scope验证＋cookie/header同步 | 立即换组选中反馈，重取新组；非终态前台操作沿用保护 |
| 首页 | 原问候、五指标卡、三列六区块；增加组总览/平台筛选 | 平台/账号/日期→pages.groupDashboard；内容→现有项目；分发→现有发布路由 | 按内容计数，展开目标账号版本；缺数据保留恢复入口 |
| 创作者总览 | 当前组各平台覆盖、内容分发与指标 | 共用pages.groupDashboard及组/平台/账号/时间筛选；逐平台下钻→运营分析 | 不另存汇总事实；空平台保留明确缺失状态 |
| 账号组与绑定账号 /accounts | 组列表、真实账号表、登录/采集/发布能力 | 建/改/归档/恢复组→accountGroups.*；绑定→accounts.bind；转组→previewTransfer/transfer；隐藏→accounts.archive | 保存回读、显示版本；扫码run可持续观察；转组出影响预览 |
| 作品与发布中心 | 一期内容、各账号分发结果 | 内容视图/发布记录视图→pages.groupWorks；关联作品→projects.linkPublication；目标→真实账号选择 | 单条失败原地重试；其它平台结果保留；回执确认已发布 |
| 运营分析 | 当前组/平台/账号/日期的表现 | 筛选→pages.groupAnalytics；平台行→同页下钻 | 分平台口径、coverage/asOf；图表、作品表和导出同筛选 |
| 项目复盘 | 一期内容各平台版本与表现 | 项目入口→pages.groupContentReview；分析与采纳→已有AI候选与learnings采纳接口扩展group scope | 不同窗口不比较；采纳回读、保留来源样本 |
| 定位/选题/雷达/知识/素材/助手/画布/自动化 | 同一组的上下文或该组的具体平台账号 | 现有操作scope映射；采集/发布明确accountId | 平台筛选不换定位；跨组实体不给旧组详情；后台继续 |

## 各页公共状态

| 状态 | 处理 |
| --- | --- |
| 正常 | 显示当前组、筛选与对象；数据时间及口径可见 |
| 没有组 | 进入/accounts建组；首页允许引导，不能旧的无accountId门挡住 |
| 空组 | 可以新建内容和设置定位；分发引导绑定，不强制先绑账号才写稿 |
| 平台未绑定 | 绑定入口，保留已有内容与其它平台；没有身份时不显示已连接 |
| 有账号无采集 | 作品/指标为空或—；显示采集能力与动作，不写假0 |
| 加载 | 受影响区占位并可观察；不同时显示空和等待，不遮掉所有合法操作 |
| 单平台失败 | 该平台显示失败原因/重新登录/重试；覆盖计数明确，其余正常 |
| 权限或归属错误 | 404/权限文案；不回退其它组或吞错扩大读取 |
| 版本冲突 | 保留用户输入，读回新版本后明确重试；不覆盖他人更新 |
| 归档组/账号 | 管理页可读历史并恢复；发布到归档账号受阻，其它目标继续 |
| 晚到响应 | 请求绑定组/筛选epoch；变化后丢弃旧响应，卸载不setState |
| 长名称与多账号 | 组名换行或可访问完整标题；具体账号可筛选，不能挤成极小字 |

## 原型用户走查

1. 从首页看当前创作者的内容，再只看小红书；验证当前组不变、缺数据明确。
2. 找到账号组管理，查看五平台的身份与能力状态；没有绑定不可显示已成功。
3. 查看运营分析，再切回全部平台；播放和阅读仍分开，时间不变。
4. 从作品进入内容复盘，找到每个平台的数据和待采集原因。
5. 使用键盘与窄窗重复上述查看任务；筛选和返回位置可辨认。

真正建组、绑定、迁移、保存回读、分发回执和失败恢复只在正式实现的真实入口验收，本轮不能标PASS。

## 用户确认的视觉约束（2026-10-04追加）

保留原版丰富信息和样式；不再选择A/B。原账号入口原位变成账号组入口，首页上方增补总览和平台切换，平台筛选不隐藏组创作卡片。当前预览为original-home.html，旧A/B仅作为已弃探索留档。新预览的抖音数字取自用户截图，只在截图时间范围展示并注明非实时；跨平台与其它日期缺失显示—。

用户随后明确认可该版，并要求可视化更好看。局部精修图表，不改变数据主体、平台能力或历史迁移授权：趋势轻网格与面积、最高/最低摘要；分析页作品横条比较先于原始表；无数据保留明确空态。横条点击绑定已知内容主标题后进入原复盘。样本值与条件见UI_RULES图表规范，未连接生产ECharts或真实查询。

用户再次指出图表缺坐标。当前修订要求日期轴、数值轴、单位与等距刻度完整可见；撤回没有每日明细支撑的轮廓折线，已知最大/最小改为带轴的范围边界。首页与分析页一致，作品横条共用0—25,000次轴；保持原布局和原筛选联动。
