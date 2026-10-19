# T1345 冻结候选浏览器验收

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1345",
  "contract_path": "docs/verification/t1345/control/PAGE_SPEC.md",
  "contract_sha": "b29bc5814f70",
  "commit_sha": "3b0f1471de3bf2f4de371849e29112a35a7ab4b3",
  "observed_at": "2026-10-18T14:41:40.996068+00:00",
  "run": {
    "verify_key": "t1345-account-binding:e2e",
    "command": "node docs/verification/t1345/control/run-frozen-ui.mjs T-1345",
    "exit_code": 0,
    "output_ref": "docs/verification/t1345/candidate-formal-attempt03.log"
  },
  "environment": {
    "surface": "browser",
    "runtime": "Google Chrome / macOS，干净managed候选3b0f1471d，私有PGlite；真实浏览器appearance200%而非CSSzoom",
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
        "id": "grp-eb84636a-20",
        "role": "首屏真实零组后公共API创建的当前甲组"
      },
      {
        "id": "grp-eb84636a-47",
        "role": "真实转组与归档恢复的乙组"
      },
      {
        "id": "acct-eb84636a-35",
        "role": "写后同ID读回的长名平台账号"
      }
    ]
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1345/pre-freeze-frontend-owned.txt；docs/verification/t1345/pre-freeze-public-binding.txt"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1345/candidate-attempt03/e2e/first-home-1024.png；docs/verification/t1345/candidate-attempt03/e2e/members-dark-1024.png；docs/verification/t1345/independent-visual/FINAL_T1345_REVIEW.md（旧同产品像素独评）；docs/verification/t1345/VISUAL_FUNCTION_REVIEW.md"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1345/candidate-formal-attempt03.log"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "执行者与独评核查不冒用户本人体验认可；待安装另验。"
    }
  },
  "checks": [
    {
      "id": "first_group_entry",
      "test_id": "t1345-first-home",
      "result": "pass",
      "evidence_ref": "docs/verification/t1345/candidate-attempt03/e2e/observed.json"
    },
    {
      "id": "scan_once_and_continue",
      "test_id": "t1345-click-run",
      "result": "pass",
      "evidence_ref": "docs/verification/t1345/candidate-attempt03/e2e/observed.json；docs/verification/t1345/pre-freeze-frontend-owned.txt；docs/verification/t1345/pre-freeze-public-binding.txt"
    },
    {
      "id": "removed_and_single_row",
      "test_id": "t1345-single-row",
      "result": "pass",
      "evidence_ref": "docs/verification/t1345/candidate-attempt03/e2e/observed.json"
    },
    {
      "id": "group_control",
      "test_id": "t1345-group-master",
      "result": "pass",
      "evidence_ref": "docs/verification/t1345/candidate-attempt03/e2e/observed.json"
    },
    {
      "id": "member_selection",
      "test_id": "t1345-member-selection",
      "result": "pass",
      "evidence_ref": "docs/verification/t1345/candidate-attempt03/e2e/observed.json"
    },
    {
      "id": "member_detail",
      "test_id": "t1345-member-detail",
      "result": "pass",
      "evidence_ref": "docs/verification/t1345/candidate-attempt03/e2e/observed.json"
    },
    {
      "id": "empty_next_action",
      "test_id": "t1345-empty-next",
      "result": "pass",
      "evidence_ref": "docs/verification/t1345/candidate-attempt03/e2e/observed.json"
    },
    {
      "id": "back_refresh_repeat",
      "test_id": "t1345-return",
      "result": "pass",
      "evidence_ref": "docs/verification/t1345/candidate-attempt03/e2e/observed.json"
    },
    {
      "id": "responsive_and_zoom",
      "test_id": "t1345-visual",
      "result": "pass",
      "evidence_ref": "docs/verification/t1345/candidate-attempt03/e2e/observed.json"
    }
  ],
  "coverage": [
    {
      "condition": "back",
      "result": "pass",
      "evidence_ref": "docs/verification/t1345/candidate-attempt03/e2e/observed.json；docs/verification/t1345/candidate-attempt03/e2e/visible-copy.json"
    },
    {
      "condition": "refresh",
      "result": "pass",
      "evidence_ref": "docs/verification/t1345/candidate-attempt03/e2e/observed.json；docs/verification/t1345/candidate-attempt03/e2e/visible-copy.json"
    },
    {
      "condition": "repeat",
      "result": "pass",
      "evidence_ref": "docs/verification/t1345/candidate-attempt03/e2e/observed.json；docs/verification/t1345/candidate-attempt03/e2e/visible-copy.json"
    },
    {
      "condition": "keyboard",
      "result": "pass",
      "evidence_ref": "docs/verification/t1345/candidate-attempt03/e2e/observed.json；docs/verification/t1345/candidate-attempt03/e2e/visible-copy.json"
    },
    {
      "condition": "empty",
      "result": "pass",
      "evidence_ref": "docs/verification/t1345/candidate-attempt03/e2e/observed.json；docs/verification/t1345/candidate-attempt03/e2e/visible-copy.json"
    },
    {
      "condition": "error",
      "result": "pass",
      "evidence_ref": "docs/verification/t1345/candidate-attempt03/e2e/observed.json；docs/verification/t1345/candidate-attempt03/e2e/visible-copy.json"
    },
    {
      "condition": "loading",
      "result": "pass",
      "evidence_ref": "docs/verification/t1345/candidate-attempt03/e2e/observed.json；docs/verification/t1345/candidate-attempt03/e2e/visible-copy.json"
    },
    {
      "condition": "zoom",
      "result": "pass",
      "evidence_ref": "docs/verification/t1345/candidate-attempt03/e2e/observed.json；docs/verification/t1345/candidate-attempt03/e2e/visible-copy.json"
    }
  ],
  "visible_copy": {
    "artifact_path": "docs/verification/t1345/candidate-attempt03/visible-copy-contract.json",
    "artifact_sha256": "ee726726eb6c9d0d50bc1e3c0d8689a930abe18fb7d918d77858b54f0836a3d2"
  },
  "tdd_red_ref": "docs/verification/t1345/red/target-red-v2.txt；docs/verification/t1345/red/continuous-binding-risk-red.txt",
  "open_defects": [],
  "status": "pass",
  "limitations": [
    "所有浏览器实体为全新私有PGlite经公共API建立的代表性合成数据，不是用户数据。",
    "浏览器故意中止外部扫码启动，只证明一次点击未知恢复；成功扫码、核验后继续同/不同平台由真实组件测试与受控宿主公共持久链分别证明，不冒真人扫码。",
    "240项局部测试及六受控run测试在共享开发树执行；相关生产字节与冻结候选相同，开发树foreign未打入候选。",
    "首轮7885测试本体通过但历史索引被夹具写入，整轮冻结检查失败；原过渡灰帧/失败保留。954580与本次3b正式分别exit0，不覆盖旧结果。3b关键首屏/稳定暗色已实际重看；原独立视觉按相同产品字节有界承继。",
    "当前仅浏览器候选，未安装或验证新App；全局开工旧债与本轮新增宽路径收据失配T1353分列，不宣称全局对账通过。"
  ]
}
```
