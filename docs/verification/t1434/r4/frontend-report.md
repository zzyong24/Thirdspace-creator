# 两站真实截图与SEO验收

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1434",
  "commit_sha": "53c51a886c10657f21831c8f9078fdcf46cedb17",
  "contract_sha": "65df3ca95e96",
  "contract_path": "docs/features/t1434-website-changelog-refresh.md",
  "observed_at": "2026-11-05T14:46:45.606Z",
  "status": "pass",
  "run": {
    "verify_key": "website-t1434",
    "command": "node docs/verification/t1434/verify-website.mjs",
    "exit_code": 0,
    "output_ref": "docs/verification/t1434/r4/browser-run.log"
  },
  "environment": {
    "surface": "browser",
    "runtime": "Ego Lite Chromium，真实官网与购买页",
    "viewports": [
      {
        "width": 1440,
        "height": 1000,
        "result": "pass"
      },
      {
        "width": 390,
        "height": 844,
        "result": "pass"
      }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      {
        "id": "creatoros-public-site",
        "role": "官网实际截图"
      },
      {
        "id": "creatoros-public-store",
        "role": "购买站实际截图"
      }
    ]
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1434/r4/website-tests.log"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1434/r4/browser-observations.json"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1434/r4/browser-observations.json"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "真实浏览器自动检查，不冒用户人工验收"
    }
  },
  "checks": [
    {
      "id": "download-removed",
      "test_id": "website-download-removed",
      "result": "pass",
      "evidence_ref": "docs/verification/t1434/r4/browser-observations.json"
    },
    {
      "id": "versions",
      "test_id": "website-versions",
      "result": "pass",
      "evidence_ref": "docs/verification/t1434/r4/browser-observations.json"
    },
    {
      "id": "keyboard-refresh",
      "test_id": "website-keyboard-refresh",
      "result": "pass",
      "evidence_ref": "docs/verification/t1434/r4/browser-observations.json"
    },
    {
      "id": "responsive",
      "test_id": "website-responsive",
      "result": "pass",
      "evidence_ref": "docs/verification/t1434/r4/browser-observations.json"
    },
    {
      "id": "real-screenshots",
      "test_id": "website-real-screenshots",
      "result": "pass",
      "evidence_ref": "docs/verification/t1434/r4/browser-observations.json"
    },
    {
      "id": "seo",
      "test_id": "website-seo",
      "result": "pass",
      "evidence_ref": "docs/verification/t1434/r4/browser-observations.json"
    },
    {
      "id": "storefront-preserved",
      "test_id": "website-storefront-preserved",
      "result": "pass",
      "evidence_ref": "docs/verification/t1434/r4/browser-observations.json"
    }
  ],
  "coverage": [
    {
      "condition": "refresh",
      "result": "pass",
      "evidence_ref": "docs/verification/t1434/r4/browser-observations.json"
    },
    {
      "condition": "keyboard",
      "result": "pass",
      "evidence_ref": "docs/verification/t1434/r4/browser-observations.json"
    }
  ],
  "tdd_red_ref": "静态内容不制造TDD红测；线上旧页面缺少14张截图及SEO的失败见 docs/verification/t1434/r3/production-before.log",
  "open_defects": [],
  "visible_copy": {
    "artifact_path": "docs/verification/t1434/r4/visible-copy.json",
    "artifact_sha256": "9a4e48d0fe53aeafdda96005ea2906a7a4aa81261725b7bd7dbb521819c81003"
  }
}
```
