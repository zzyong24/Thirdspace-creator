# 资料书架页面合同

- 任务：T-1075；路由：`/knowledge`；方向：用户已选择01资料书架。
- 用途：存完整资料、找到并读原文、修改保存、整理文件夹、引用到真实项目写稿。
- 原课程与高级知识视图由次级入口访问；主数据来自当前scope后台，不加载fixture或合成示例。
- 正常1366×900，最小1024×768；加载提示、空态添加入口、读取/写入失败重试、提交互斥；非本scope读写仍由后台拒绝。

| 绑定 | 操作 | AC / TEST |
|---|---|---|
| existing | knowledge.list/folders.list/get/revisions.list | collection, selection, detail / library-journey |
| existing | knowledge.create/revisions.create | write-read / library-journey |
| existing | knowledge.folders.create/move/archive | organize / library-journey |
| existing | assets.uploads.create/complete、material.extract、knowledge.create | import / library-journey |
| existing | projects.list、materialLinks.create/list、项目写稿读侧 | reference / library-journey |
| existing | 当前路由query、已有高级/课程、Copilot本地入口 | navigation, empty-next / library-journey |

| AC | 前置与意图 | 即时反馈 | 最终状态与下一步 | 返回/刷新 | TEST |
|---|---|---|---|---|---|
| collection | 有不同类别与文件夹，用户查找资料 | 筛选控件更新，列表匹配 | 只展示匹配集合，可再选条目 | URL恢复查询 | library-journey |
| selection | 已选A，筛选只匹配B | A立即清除 | selection为空或用户随后选择可见B | 不恢复不可见A | library-journey |
| detail | 用户选择B | 清掉旧正文，读取中 | 详情只对应B，失败可重试 | 重载读B当前正文 | library-journey |
| empty-next | 空库/筛选无结果 | 明确无资料/无匹配 | 能添加或清筛选，selection/detail均空 | 原筛选有迹可循 | library-journey |
| write-read | 添加或修改完整原文 | 保存中互斥，失败保留输入 | 当前ID与正文后台回读一致，可继续阅读/整理 | 重载不丢保存结果；取消编辑保留原文 | library-journey |
| organize | 新建文件夹并移动资料/明确归档 | 操作中及内联结果 | 读回实际文件夹/状态，移出集合清空详情 | 刷新一致，历史未删除 | library-journey |
| import | 用户导入Markdown正文 | 确认/处理/成功失败结果 | 原文件asset及知识正文真实保存，可读/再编辑 | 刷新保持原文来源；不支持文件有明确恢复 | library-journey |
| reference | 选择真实项目使用资料 | 引用中互斥，错误原地恢复 | 同一knowledgeId的materialLink回读，可进入写稿看到资料 | 重复/重载不产生第二引用 | library-journey |
| navigation | 已有查询/选择，用户离开返回或刷新；切scope | 查询恢复/切scope清空旧内容 | 保持本scope可见选择，拒绝跨scope请求 | URL与身份一致；晚到响应不回写 | library-journey |

筛选导致已选项不可见采用clear，详情组件按选择ID及scope挂载；保存创建后只有读侧出现该ID才生效选择，不显示占位资料。错误不会清空待保存原文。角色状态：当前scope owner可读写active资料；archived保留追溯不在主列表；其他scope/未登录不能访问实体。授权共享资源沿既有服务权限，不自行复制私有数据。

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-1075",
  "copy_guard": { "forbid_internal_ids": true },
  "watched_paths": [
    "frontend/src/features/knowledge",
    "frontend/src/app/(creator)/knowledge",
    "frontend/src/features/draft-workbench/draft-workbench-data.ts",
    "frontend/src/features/draft-workbench/draft-workbench-data.test.ts",
    "frontend/src/features/draft-workbench/ammo-card-list.tsx",
    "frontend/src/features/draft-workbench/draft-workbench-page.tsx",
    "docs/verification/t1075/run-journey.mjs",
    "frontend/src/features/draft-workbench/ammo-card-list.test.tsx",
    "orchestrator/process/reconcile.config.json",
    "frontend/src/lib/contract-client.ts",
    "frontend/src/lib/contract-client.server.ts",
    "backend/src/modules/knowledge",
    "backend/src/application/knowledge.ts",
    "frontend/src/server/persistence-client.ts",
    "backend/src/modules/material-links",
    "frontend/tests/e2e/knowledge-library.spec.ts"
  ],
  "required_checks": [
    { "id": "collection", "test_id": "library-journey" },
    { "id": "selection", "test_id": "library-journey" },
    { "id": "detail", "test_id": "library-journey" },
    { "id": "empty-next", "test_id": "library-journey" },
    { "id": "write-read", "test_id": "library-journey" },
    { "id": "organize", "test_id": "library-journey" },
    { "id": "import", "test_id": "library-journey" },
    { "id": "reference", "test_id": "library-journey" },
    { "id": "navigation", "test_id": "library-journey" }
  ],
  "required_conditions": ["loading", "empty", "error", "back", "refresh", "repeat"],
  "viewports": [{"width":1366,"height":900},{"width":1024,"height":768}],
  "coherence_groups": [{
    "id":"library-category-detail",
    "pattern":"master-detail",
    "control":"资料类别与文件夹筛选",
    "collection":"资料列表",
    "selection":"当前资料",
    "detail":"原文",
    "transition":"选择A后切到只包含B的类别",
    "policy":"clear",
    "check_ids":{
      "collection_matches_control":"collection",
      "selection_valid_or_empty":"selection",
      "detail_matches_selection_or_empty":"detail",
      "next_action_when_empty":"empty-next"
    }
  }]
}
```
