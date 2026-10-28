# Tab切换源码真实界面验收

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1425",
  "commit_sha": "cfd165baad057b73898a97263f43754d40896082",
  "contract_path": "docs/verification/t1425/frontend-contract.md",
  "contract_sha": "dd5bd2c9d5f0",
  "observed_at": "2026-10-24T13:43:49.766Z",
  "run": {
    "verify_key": "tab-navigation-performance:e2e",
    "command": "ego-browser nodejs < docs/verification/t1425/browser-verify.mjs > docs/verification/t1425/browser-final-verify.log 2>&1",
    "exit_code": 0,
    "output_ref": "docs/verification/t1425/browser-final-verify.log"
  },
  "environment": {
    "surface": "browser",
    "runtime": "Ego Lite 0.6.0.16 / Chromium / Next.js 16.2.9 dev",
    "viewports": [
      {
        "width": 1366,
        "height": 900,
        "result": "pass"
      },
      {
        "width": 1024,
        "height": 768,
        "result": "pass"
      }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      {
        "id": "project-intake-502186e3bf0ee5d16d07935c82083c64",
        "role": "真实API创建的隔离项目"
      },
      {
        "id": "output-d544fcdd-50",
        "role": "正式文章版本及ZIP"
      },
      {
        "id": "output-d544fcdd-62",
        "role": "正式图文版本及原生预览"
      },
      {
        "id": "output-d544fcdd-74",
        "role": "原生视频空工程"
      }
    ]
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1425/integration-focused.log"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1425/browser-gate-result.json"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1425/browser-verification.md"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "当前用户安装版尚未替换，不以机器验收代签人工体感。"
    }
  },
  "checks": [
    {
      "id": "TAB-CYCLE",
      "test_id": "browser-tab-cycle",
      "result": "pass",
      "evidence_ref": "docs/verification/t1425/browser-gate-result.json"
    },
    {
      "id": "SCRIPT-ROUNDTRIP",
      "test_id": "browser-script-roundtrip",
      "result": "pass",
      "evidence_ref": "docs/verification/t1425/browser-gate-result.json"
    },
    {
      "id": "ARTICLE-ZIP",
      "test_id": "browser-article-zip",
      "result": "pass",
      "evidence_ref": "docs/verification/t1425/browser-gate-result.json"
    }
  ],
  "coverage": [
    {
      "condition": "normal-and-small-viewport",
      "result": "pass",
      "evidence_ref": "docs/verification/t1425/browser-gate-result.json"
    },
    {
      "condition": "repeated-real-tab-navigation",
      "result": "pass",
      "evidence_ref": "docs/verification/t1425/browser-gate-result.json"
    },
    {
      "condition": "saved-script-preserved",
      "result": "pass",
      "evidence_ref": "docs/verification/t1425/browser-script-save.json"
    },
    {
      "condition": "one-click-lazy-article-export",
      "result": "pass",
      "evidence_ref": "docs/verification/t1425/browser-gate-result.json"
    }
  ],
  "visible_copy": {
    "artifact_path": "docs/verification/t1425/frontend-visible-copy.json",
    "artifact_sha256": "bdcee870e776f13e0c759fb977669b4a373ab9ce61437a0004af4a5408d22d3b"
  },
  "tdd_red_ref": "docs/verification/t1425/root-red.log; docs/verification/t1425/editor-red.log; docs/verification/t1425/backend-red.log",
  "open_defects": [],
  "status": "pass"
}
```
