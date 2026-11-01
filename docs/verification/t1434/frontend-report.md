# 官网真实浏览器验收

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1434",
  "commit_sha": "54612d62c2923e6807cb9f1f4571ada1c45e8168",
  "contract_sha": "a22b77e394d1",
  "contract_path": "docs/features/t1434-website-changelog-refresh.md",
  "observed_at": "2026-11-01T09:50:00.894Z",
  "status": "pass",
  "run": {
    "verify_key": "website-t1434",
    "command": "node docs/verification/t1434/verify-website.mjs",
    "exit_code": 0,
    "output_ref": "docs/verification/t1434/browser-run.log"
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
        "id": "release-120-oct",
        "role": "十月真实更新"
      },
      {
        "id": "release-120-sep",
        "role": "九月真实更新"
      }
    ]
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1434/website-tests.log"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1434/browser-observations.json"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1434/browser-observations.json"
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
      "evidence_ref": "docs/verification/t1434/browser-observations.json"
    },
    {
      "id": "versions",
      "test_id": "website-release-tabs",
      "result": "pass",
      "evidence_ref": "docs/verification/t1434/browser-observations.json"
    },
    {
      "id": "keyboard-refresh",
      "test_id": "website-keyboard-refresh",
      "result": "pass",
      "evidence_ref": "docs/verification/t1434/browser-observations.json"
    },
    {
      "id": "responsive",
      "test_id": "website-two-viewports",
      "result": "pass",
      "evidence_ref": "docs/verification/t1434/browser-observations.json"
    }
  ],
  "coverage": [
    {
      "condition": "refresh",
      "result": "pass",
      "evidence_ref": "docs/verification/t1434/browser-observations.json"
    },
    {
      "condition": "keyboard",
      "result": "pass",
      "evidence_ref": "docs/verification/t1434/browser-observations.json"
    }
  ],
  "tdd_red_ref": "纯静态文案与下载区移除不制造TDD红测；真实线上旧版缺少新批次并保留旧下载区的失败见 docs/verification/t1434/production-before.log",
  "open_defects": [],
  "visible_copy": {
    "artifact_path": "docs/verification/t1434/visible-copy.json",
    "artifact_sha256": "f4e0a348eada623ead7dc346050585df24bc11ef7e52f2de6f1b1146569f54a6"
  }
}
```
