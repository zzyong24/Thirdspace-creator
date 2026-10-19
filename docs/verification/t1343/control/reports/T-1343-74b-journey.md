# T-1343 新包正式界面验收

新74b固定包每UUID独立副本沿原task46c2b534-28与原视频完成真实HTTP GET/HEAD/Range/播放、正常UI确认、下载解码及正常/最小返回刷新。0render/0模型，原source仍awaiting；原RGB观察器1和真实色差未改，几何/四秒/AAC证据另列，不宣色彩已修复。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1343",
  "contract_path": "docs/verification/t1343/control/T-1343.md",
  "contract_sha": "b7ab8a1c3404",
  "commit_sha": "3e6b7eb2e6e879468142edc549d70586ce86848c",
  "observed_at": "2026-10-18T06:40:38.938Z",
  "run": {
    "verify_key": "t1343-final-bare-continuation:e2e",
    "command": "python3 docs/verification/t1343/runtime/final-ui/runner/command.py T-1343 docs/verification/t1342/control/actual-bindings-74b/T1343_BOOTSTRAP_V3.json",
    "exit_code": 0,
    "output_ref": "/Volumes/T7-MacData/CodexBuilds/t1343-legacy-bare-render-20261018/final-ui/runs/20261018T063943Z-afcbf6a9dd3248b5b5dc8bb1bb02447f/COMMAND_RESULT.json"
  },
  "environment": {
    "surface": "desktop-web",
    "runtime": "74b实际固定包Next与随包Chromium，真实页面/公共服务/自有隔离数据",
    "viewports": [
      {
        "width": 1366,
        "height": 900,
        "result": "pass"
      },
      {
        "width": 1024,
        "height": 680,
        "result": "pass"
      }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      {
        "id": "ai-task-46c2b534-28",
        "role": "原已渲染未确认任务，新副本正常UI确认"
      },
      {
        "id": "asset-46c2b534-23",
        "role": "原合法单原片输入及精确SHA"
      }
    ],
    "description": "现役公共调用实际持久化的隔离代表性数据，页面/API无mock；其中两卡外部CLI I/O透明合成，视频为真实确定性ffmpeg产物；不冒用户资料、真实供应商新调用或平台实绩。"
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1343/runtime/test-default-fix-v1/OUTPUT_INDEX.json"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "/Volumes/T7-MacData/CodexBuilds/t1343-legacy-bare-render-20261018/final-ui/runs/20261018T063943Z-afcbf6a9dd3248b5b5dc8bb1bb02447f/journey/TASK_RESULT.json"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "/Volumes/T7-MacData/CodexBuilds/t1343-legacy-bare-render-20261018/final-ui/runs/20261018T063943Z-afcbf6a9dd3248b5b5dc8bb1bb02447f/COMMAND_RESULT.json"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "真实自动操作及独立实图核验另列，不冒真人确认"
    }
  },
  "checks": [
    {
      "id": "production_original_task_preview",
      "test_id": "t1343-production_original_task_preview",
      "description": "原制作页加载同一待确认任务及真实预览",
      "result": "pass",
      "evidence_ref": "/Volumes/T7-MacData/CodexBuilds/t1343-legacy-bare-render-20261018/final-ui/runs/20261018T063943Z-afcbf6a9dd3248b5b5dc8bb1bb02447f/journey/BUSINESS_RESULT.json"
    },
    {
      "id": "actual_next_get_head",
      "test_id": "t1343-actual_next_get_head",
      "description": "真实Next GET与自动HEAD返回原视频",
      "result": "pass",
      "evidence_ref": "/Volumes/T7-MacData/CodexBuilds/t1343-legacy-bare-render-20261018/final-ui/runs/20261018T063943Z-afcbf6a9dd3248b5b5dc8bb1bb02447f/journey/BUSINESS_RESULT.json"
    },
    {
      "id": "range_byte_integrity",
      "test_id": "t1343-range_byte_integrity",
      "description": "三类Range返回精确视频字节及越界416",
      "result": "pass",
      "evidence_ref": "/Volumes/T7-MacData/CodexBuilds/t1343-legacy-bare-render-20261018/final-ui/runs/20261018T063943Z-afcbf6a9dd3248b5b5dc8bb1bb02447f/journey/BUSINESS_RESULT.json"
    },
    {
      "id": "native_play_progress",
      "test_id": "t1343-native_play_progress",
      "description": "真实原生播放器时间推进",
      "result": "pass",
      "evidence_ref": "/Volumes/T7-MacData/CodexBuilds/t1343-legacy-bare-render-20261018/final-ui/runs/20261018T063943Z-afcbf6a9dd3248b5b5dc8bb1bb02447f/journey/BUSINESS_RESULT.json"
    },
    {
      "id": "normal_ui_confirm_asset",
      "test_id": "t1343-normal_ui_confirm_asset",
      "description": "正常按钮采纳并读回素材及制作状态",
      "result": "pass",
      "evidence_ref": "/Volumes/T7-MacData/CodexBuilds/t1343-legacy-bare-render-20261018/final-ui/runs/20261018T063943Z-afcbf6a9dd3248b5b5dc8bb1bb02447f/journey/BUSINESS_RESULT.json"
    },
    {
      "id": "asset_download_and_decode",
      "test_id": "t1343-asset_download_and_decode",
      "description": "采纳后下载与原预览逐字节一致且可解码",
      "result": "pass",
      "evidence_ref": "/Volumes/T7-MacData/CodexBuilds/t1343-legacy-bare-render-20261018/final-ui/runs/20261018T063943Z-afcbf6a9dd3248b5b5dc8bb1bb02447f/journey/BUSINESS_RESULT.json"
    },
    {
      "id": "normal_minimum_back_refresh",
      "test_id": "t1343-normal_minimum_back_refresh",
      "description": "正常及最小窗口返回与刷新保持播放就绪",
      "result": "pass",
      "evidence_ref": "/Volumes/T7-MacData/CodexBuilds/t1343-legacy-bare-render-20261018/final-ui/runs/20261018T063943Z-afcbf6a9dd3248b5b5dc8bb1bb02447f/journey/BUSINESS_RESULT.json"
    },
    {
      "id": "source_scope_and_no_model_ledger",
      "test_id": "t1343-source_scope_and_no_model_ledger",
      "description": "仅原project/output/source/task/同产物；精确记录合法采纳及初始化写与原public账本，私有总账未暴露时不冒全账本零调用",
      "result": "pass",
      "evidence_ref": "/Volumes/T7-MacData/CodexBuilds/t1343-legacy-bare-render-20261018/final-ui/runs/20261018T063943Z-afcbf6a9dd3248b5b5dc8bb1bb02447f/journey/BUSINESS_RESULT.json"
    }
  ],
  "coverage": [
    {
      "condition": "back",
      "result": "pass",
      "evidence_ref": "/Volumes/T7-MacData/CodexBuilds/t1343-legacy-bare-render-20261018/final-ui/runs/20261018T063943Z-afcbf6a9dd3248b5b5dc8bb1bb02447f/journey/BUSINESS_RESULT.json"
    },
    {
      "condition": "refresh",
      "result": "pass",
      "evidence_ref": "/Volumes/T7-MacData/CodexBuilds/t1343-legacy-bare-render-20261018/final-ui/runs/20261018T063943Z-afcbf6a9dd3248b5b5dc8bb1bb02447f/journey/BUSINESS_RESULT.json"
    },
    {
      "condition": "repeat",
      "result": "pass",
      "evidence_ref": "/Volumes/T7-MacData/CodexBuilds/t1343-legacy-bare-render-20261018/final-ui/runs/20261018T063943Z-afcbf6a9dd3248b5b5dc8bb1bb02447f/journey/BUSINESS_RESULT.json"
    }
  ],
  "visible_copy": {
    "artifact_path": "docs/verification/t1343/runtime/final-ui/report-artifacts/journey/VISIBLE_COPY_MAPPED.json",
    "artifact_sha256": "a75fd335f8e712ea4af3fd91bc0ebb4820699f88edccfc0d829925c8ae94f793"
  },
  "tdd_red_ref": "docs/verification/t1343/runtime/red-v1/RESULT.json",
  "open_defects": [],
  "status": "pass"
}
```
