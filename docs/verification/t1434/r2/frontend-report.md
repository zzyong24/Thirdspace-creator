# 官网真实浏览器验收

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1434",
  "commit_sha": "1516c8b63e4b0fa5663f871172ddf10784ffbe15",
  "contract_sha": "b6fa76db6d6f",
  "contract_path": "docs/features/t1434-website-changelog-refresh.md",
  "observed_at": "2026-11-01T10:04:28.086Z",
  "status": "pass",
  "run": {
    "verify_key": "website-t1434",
    "command": "node docs/verification/t1434/verify-website.mjs",
    "exit_code": 0,
    "output_ref": "docs/verification/t1434/r2/browser-run.log"
  },
  "environment": {
    "surface": "browser",
    "runtime": "Ego Lite Chromium，真实公开官网",
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
        "id": "release-130",
        "role": "用户确认的最新版本"
      },
      {
        "id": "release-120",
        "role": "用户确认的上一版本"
      }
    ]
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1434/r2/website-tests.log"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1434/r2/browser-observations.json"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1434/r2/browser-observations.json"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "机器浏览器检查，不冒充用户人工验收"
    }
  },
  "checks": [
    {
      "id": "download-removed",
      "test_id": "website-public-content",
      "result": "pass",
      "evidence_ref": "docs/verification/t1434/r2/browser-observations.json"
    },
    {
      "id": "versions",
      "test_id": "website-release-tabs",
      "result": "pass",
      "evidence_ref": "docs/verification/t1434/r2/browser-observations.json"
    },
    {
      "id": "keyboard-refresh",
      "test_id": "website-keyboard-refresh",
      "result": "pass",
      "evidence_ref": "docs/verification/t1434/r2/browser-observations.json"
    },
    {
      "id": "responsive",
      "test_id": "website-two-viewports",
      "result": "pass",
      "evidence_ref": "docs/verification/t1434/r2/browser-observations.json"
    }
  ],
  "coverage": [
    {
      "condition": "refresh",
      "result": "pass",
      "evidence_ref": "docs/verification/t1434/r2/browser-observations.json"
    },
    {
      "condition": "keyboard",
      "result": "pass",
      "evidence_ref": "docs/verification/t1434/r2/browser-observations.json"
    }
  ],
  "tdd_red_ref": "纯静态文案修改不制造TDD红测；真实线上旧版版本名称与多平台说明不符合用户最新要求，失败见 docs/verification/t1434/r2/production-before.log",
  "open_defects": [],
  "visible_copy": {
    "artifact_path": "docs/verification/t1434/r2/visible-copy.json",
    "artifact_sha256": "8af91deb7a774e0409a33faa053c75c5e235464e762bcd7a93b543ec4329e5bb"
  }
}
```
