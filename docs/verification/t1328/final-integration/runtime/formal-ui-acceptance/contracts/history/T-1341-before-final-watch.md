# T-1341 真实素材标签前瞻正式界面验收合同（尚未执行）

仅把已审真实标签只读投影落实为新包正常/最小窗口旅程。人工中性PNG、自然中文显示名和标签通过正式公开API预先持久化；页面真实读取，不mock DOM/DTO，不称真实用户资料/平台实绩或模型采纳。原13dd supplier采纳、v1错误名字前置、v2真实4目标FAIL与新受控GREEN分别保留，不改历史。

初次与taskctl重复命令只读同已准备输入，0新模型/素材/标签写入；实际准备与其源/key/controller另精确绑定。新包最小为1024×680，390极限检查不冒正式宿主下限。缺标签/投影故障三态逻辑另引用真实组合/组件回归；本旅程不伪造服务故障。

锁前追加实际runner/controller/helper精确watched路径与allowlisted真实命令；当前只是前瞻合同，非已执行报告。标签搜索是现役?q对当前读页的过滤，不冒全库检索或顺改pageSize。

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-1341",
  "copy_guard": {
    "forbid_internal_ids": true
  },
  "required_checks": [
    {
      "id": "collection",
      "test_id": "t1341-collection",
      "description": "真实资料库集合与当前类型/查询条件一致，原公开素材可见"
    },
    {
      "id": "selection",
      "test_id": "t1341-selection",
      "description": "从当前真实素材卡选择正确实体，关闭后恢复集合，不以详情必须重复卡片名为定位假设"
    },
    {
      "id": "detail",
      "test_id": "t1341-detail",
      "description": "原生图片预览及详情真实标签名称与公开taxonomy/AssetResource的真实tagID/name一致"
    },
    {
      "id": "tag_search",
      "test_id": "t1341-tag_search",
      "description": "通过现役标签文本搜索匹配同素材，清空后恢复；不改现有分页规则"
    },
    {
      "id": "empty_next",
      "test_id": "t1341-empty_next",
      "description": "无匹配查询时真实空集合/无旧详情；现有搜索控件清空后恢复可选素材"
    },
    {
      "id": "unchanged_resource",
      "test_id": "t1341-unchanged_resource",
      "description": "全程0模型/标签写入/上传/删除；原素材、关联、usage与文件SHA前后不变"
    }
  ],
  "required_conditions": [
    "empty",
    "back",
    "refresh",
    "repeat"
  ],
  "viewports": [
    {
      "width": 1366,
      "height": 900
    },
    {
      "width": 1024,
      "height": 680
    }
  ],
  "coherence_groups": [
    {
      "id": "asset-selection-detail",
      "pattern": "master-detail",
      "policy": "clear-or-reselect",
      "check_ids": {
        "collection_matches_control": "collection",
        "selection_valid_or_empty": "selection",
        "detail_matches_selection_or_empty": "detail",
        "next_action_when_empty": "empty_next"
      }
    }
  ],
  "watched_paths": [
    "contract/src/resources/assets.ts",
    "backend/src/modules/assets/assets.repository.ts",
    "backend/src/modules/assets/assets.service.ts",
    "backend/src/modules/assets/assets.transport.ts",
    "backend/src/modules/taxonomy/taxonomy.repository.ts",
    "backend/src/modules/taxonomy/taxonomy.service.ts",
    "frontend/src/server/persistence-client.ts",
    "frontend/src/fixtures/selectors/assets.ts",
    "frontend/src/features/assets/assets-data.ts",
    "frontend/src/features/assets/assets-page.tsx",
    "frontend/src/features/assets/assets-toolbar-search.tsx",
    "frontend/src/components/resources/asset-detail-panel.tsx",
    "frontend/src/app/(creator)/assets/page.tsx"
  ]
}
```
