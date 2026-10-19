# T-1346 冻结公共界面验收

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1346",
  "contract_path": "docs/verification/t1346/control/PAGE_SPEC.md",
  "contract_sha": "c62f1ed830ac",
  "commit_sha": "3b0f1471de3bf2f4de371849e29112a35a7ab4b3",
  "observed_at": "2026-10-18T14:22:42.036576+00:00",
  "run": {
    "verify_key": "t1346-group-switch:e2e",
    "command": "node docs/verification/t1345/control/run-frozen-ui.mjs T-1346",
    "exit_code": 0,
    "output_ref": "docs/verification/t1346/candidate-attempt09/wrapper.log"
  },
  "environment": {
    "surface": "browser",
    "runtime": "Google Chrome / macOS，干净managed候选3b0f1471d，私有PGlite",
    "viewports": [
      {
        "width": 1280,
        "height": 800,
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
        "id": "grp-86c08f2f-345",
        "role": "1024窗口公共持久切组甲1024-1792333050409"
      },
      {
        "id": "grp-86c08f2f-347",
        "role": "1024窗口公共持久切组乙1024-1792333050409"
      },
      {
        "id": "project-86c08f2f-354",
        "role": "1024窗口公共持久甲组专属作品1024-1792333050409"
      },
      {
        "id": "project-86c08f2f-365",
        "role": "1024窗口公共持久乙组专属作品1024-1792333050409"
      },
      {
        "id": "grp-86c08f2f-6",
        "role": "1280窗口公共持久切组甲1280-1792332968826"
      },
      {
        "id": "grp-86c08f2f-8",
        "role": "1280窗口公共持久切组乙1280-1792332968826"
      },
      {
        "id": "project-86c08f2f-15",
        "role": "1280窗口公共持久甲组专属作品1280-1792332968826"
      },
      {
        "id": "project-86c08f2f-26",
        "role": "1280窗口公共持久乙组专属作品1280-1792332968826"
      }
    ]
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1346/query-router-green.txt"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1346/independent-visual/FINAL_REVIEW.md；docs/verification/t1346/EXECUTOR_FUNCTION_REVIEW.md；独立审查实际19图与Root当场正常/最小图复核，无当前合同视觉阻断"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1346/candidate-attempt09/e2e-results.json"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "执行者/独审不冒用户本人认可，新App安装另验。"
    }
  },
  "checks": [
    {
      "id": "switch_pending",
      "test_id": "t1346-switch_pending",
      "result": "pass",
      "evidence_ref": "docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1024×680-t1346/witness.json；docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1280×800-t1346/witness.json"
    },
    {
      "id": "switch_settled",
      "test_id": "t1346-switch_settled",
      "result": "pass",
      "evidence_ref": "docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1024×680-t1346/witness.json；docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1280×800-t1346/witness.json"
    },
    {
      "id": "aba_order",
      "test_id": "t1346-aba_order",
      "result": "pass",
      "evidence_ref": "docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1024×680-t1346/witness.json；docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1280×800-t1346/witness.json"
    },
    {
      "id": "entity_route",
      "test_id": "t1346-entity_route",
      "result": "pass",
      "evidence_ref": "docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1024×680-t1346/witness.json；docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1280×800-t1346/witness.json"
    },
    {
      "id": "scope_collection",
      "test_id": "t1346-scope_collection",
      "result": "pass",
      "evidence_ref": "docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1024×680-t1346/witness.json；docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1280×800-t1346/witness.json"
    },
    {
      "id": "scope_selection",
      "test_id": "t1346-scope_selection",
      "result": "pass",
      "evidence_ref": "docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1024×680-t1346/witness.json；docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1280×800-t1346/witness.json"
    },
    {
      "id": "scope_detail",
      "test_id": "t1346-scope_detail",
      "result": "pass",
      "evidence_ref": "docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1024×680-t1346/witness.json；docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1280×800-t1346/witness.json"
    },
    {
      "id": "scope_empty",
      "test_id": "t1346-scope_empty",
      "result": "pass",
      "evidence_ref": "docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1024×680-t1346/witness.json；docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1280×800-t1346/witness.json"
    },
    {
      "id": "public_other_pages",
      "test_id": "t1346-public_other_pages",
      "result": "pass",
      "evidence_ref": "docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1024×680-t1346/witness.json；docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1280×800-t1346/witness.json"
    },
    {
      "id": "same_scope_preservation",
      "test_id": "t1346-same_scope_preservation",
      "result": "pass",
      "evidence_ref": "docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1024×680-t1346/witness.json；docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1280×800-t1346/witness.json"
    }
  ],
  "coverage": [
    {
      "condition": "back",
      "result": "pass",
      "evidence_ref": "docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1024×680-t1346/witness.json；docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1280×800-t1346/witness.json"
    },
    {
      "condition": "refresh",
      "result": "pass",
      "evidence_ref": "docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1024×680-t1346/witness.json；docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1280×800-t1346/witness.json"
    },
    {
      "condition": "repeat",
      "result": "pass",
      "evidence_ref": "docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1024×680-t1346/witness.json；docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1280×800-t1346/witness.json"
    },
    {
      "condition": "loading",
      "result": "pass",
      "evidence_ref": "docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1024×680-t1346/witness.json；docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1280×800-t1346/witness.json"
    },
    {
      "condition": "empty",
      "result": "pass",
      "evidence_ref": "docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1024×680-t1346/witness.json；docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1280×800-t1346/witness.json"
    },
    {
      "condition": "error",
      "result": "pass",
      "evidence_ref": "docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1024×680-t1346/witness.json；docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1280×800-t1346/witness.json"
    },
    {
      "condition": "keyboard",
      "result": "pass",
      "evidence_ref": "docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1024×680-t1346/witness.json；docs/verification/t1346/candidate-attempt09/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1280×800-t1346/witness.json"
    }
  ],
  "visible_copy": {
    "artifact_path": "docs/verification/t1346/control/VISIBLE_COPY.json",
    "artifact_sha256": "d12015ae9f54a7728c0a93851948ae3b1885aebc40393c89b1346d471b19e384"
  },
  "tdd_red_ref": "docs/verification/t1346/red/component-red.log",
  "open_defects": [],
  "status": "pass",
  "limitations": [
    "本合同真实执行与T1346同一完整公共suite，报告如实引用实际T1346 allowlist命令，不伪称未执行的任务别名；各合同只认自己的check_ids。strict完成仍实际重跑该正式命令，不缓存PASS。",
    "全部实体为私有PGlite经公共API创建的合成持久事实，不是真实用户数据或HTTP成功mock。",
    "T1349既有项目列表标题/右动作裁切未修，项目scope核可见实体行与同ID可见打开入口，不冒标题布局通过。T1351仍是未实证源码风险。",
    "同scope真实刷新保持实例发生在真实保存后；未发送内容的同scope刷新另由Provider组合回归补证，不冒浏览器全部脏稿刷新已测。",
    "0模型/采集/取消不等于后台任务自然完成；未启动真人平台操作、模型或付费任务。",
    "原attempt01..08各次失败/UNKNOWN分别保，不能由当前PASS覆盖；Next日志有请求取消aborted/ECONNRESET，不能称全程无异常。",
    "全局旧债与本轮宽路径新收据失配T1353另列，不声明全局reconcile通过；当前仅浏览器候选，不签新App或Tauri原椭圆根因。"
  ]
}
```
