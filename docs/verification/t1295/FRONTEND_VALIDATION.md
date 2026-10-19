# T1295 真实浏览器验收

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1295",
  "contract_path": "docs/verification/t1295/JOURNEY_CONTRACT.md",
  "contract_sha": "1157ad2f9025",
  "commit_sha": "6f75509fc715045035559d622c3fc9ffd932e16f",
  "observed_at": "2026-10-15T04:38:06.648Z",
  "run": {
    "verify_key": "desktop-csp-native-current:e2e",
    "command": "node docs/verification/t1295/run-strict-csp.cjs . docs/verification/t1295/browser/v3-native-ui-candidate/owned-normal-binding.json",
    "exit_code": 0,
    "output_ref": "docs/verification/t1295/browser/runs/strict-csp-b36a4d60c398dd07/summary.json"
  },
  "environment": {
    "surface": "browser",
    "runtime": "Google Chrome / macOS Apple M2 Pro ANGLE Metal",
    "viewports": [
      {
        "width": 1536,
        "height": 1024,
        "result": "pass"
      },
      {
        "width": 640,
        "height": 450,
        "result": "pass"
      }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      {
        "id": "output-0d74a350-66",
        "role": "真实公共V2制作并确认的作品"
      },
      {
        "id": "export-0d74a350-217",
        "role": "真实工作台导出并登记成片"
      },
      {
        "id": "asset-0d74a350-205",
        "role": "与native下载逐字节相同的最终资产"
      }
    ]
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1295/csp-final-node.log"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1295/browser/runs/strict-csp-b36a4d60c398dd07/summary.json"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1295/browser/v3-native-ui-candidate/V3_ACTUAL_REPORT.md"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "docs/features/t1295-desktop-csp-wasm-video.md（自动化不代签用户安装验收；原生App自动化已明确暂不授权）"
    }
  },
  "checks": [
    {
      "id": "wasm-csp",
      "test_id": "T1295 release CSP page-origin WASM42 + JS eval/Function禁用 + 真实native预览导出",
      "result": "pass",
      "evidence_ref": "docs/verification/t1295/browser/runs/strict-csp-b36a4d60c398dd07/summary.json"
    },
    {
      "id": "v1-public",
      "test_id": "T1295 真实owned公共上传-原片准备-保存-预览-制作-采纳-下载音画闭环",
      "result": "pass",
      "evidence_ref": "docs/verification/t1295/browser/REPORT.md"
    },
    {
      "id": "v2-public",
      "test_id": "T1295 V2真实主轨来源采用-精确文件编译-公共预览制作采纳下载音画",
      "result": "pass",
      "evidence_ref": "docs/verification/t1295/browser/v2-native-candidate/V2_ACTUAL_REPORT.md"
    },
    {
      "id": "v3-ui",
      "test_id": "T1295 V3真实工作台导出-同snapshot保存-原公开采用成片与下载",
      "result": "pass",
      "evidence_ref": "docs/verification/t1295/browser/v3-native-ui-candidate/V3_ACTUAL_REPORT.md"
    }
  ],
  "coverage": [
    {
      "condition": "精确release CSP真实WASM执行",
      "result": "pass",
      "evidence_ref": "docs/verification/t1295/browser/runs/strict-csp-b36a4d60c398dd07/summary.json"
    },
    {
      "condition": "JavaScript eval及Function仍拒绝",
      "result": "pass",
      "evidence_ref": "docs/verification/t1295/browser/runs/strict-csp-b36a4d60c398dd07/summary.json"
    },
    {
      "condition": "预览导出音画可解码",
      "result": "pass",
      "evidence_ref": "docs/verification/t1295/browser/runs/strict-csp-b36a4d60c398dd07/summary.json"
    },
    {
      "condition": "公开采用与原文件SHA相同",
      "result": "pass",
      "evidence_ref": "docs/verification/t1295/browser/v3-native-ui-candidate/V3_ACTUAL_REPORT.md"
    }
  ],
  "tdd_red_ref": "docs/verification/t1295/csp-red.log；docs/verification/t1295/browser/REPORT.md 保原CSP实际拒绝",
  "open_defects": [],
  "status": "pass",
  "limitations": [
    "App与Windows未自动化验证",
    "现有软件GPU黑片FAIL保留；系统Chrome实际Metal音画PASS",
    "既有AAC padding时长独立T1277，不擅自裁音"
  ],
  "reuse_note": "V1/V2执行时正式用例的既有部分与当前完全一致；随后只追加V3用例，V3实际已执行。release策略与native产物哈希未变；双视口当前完整page-origin原例再实跑。软件GPU旧失败及AAC原padding另列原报告，未被本通过覆盖。"
}
```

全局限制：本轮pmem sync已执行；完整reconcile真实退出1，29 ERROR/0 WARN，均为T1292原32项中的既有门身份、无新增门身份；原32不改写。逐项身份比较见t1294/GLOBAL_RECONCILE_COMPARISON.json，完整日志reconcile-before-freeze.log。T1295范围内CSP/浏览器/类型/边界均通过；此回执不签全项目全绿、Windows或原生App操作。
