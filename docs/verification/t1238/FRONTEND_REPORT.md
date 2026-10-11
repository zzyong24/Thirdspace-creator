# T-1238 设置旅程验收

真实浏览器操作10项通过。原始失败、故障注入说明与全局既有欠债保留。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1238",
  "contract_path": "docs/verification/t1238/settings-journey-contract.md",
  "contract_sha": "078eb6d3a84a",
  "commit_sha": "ebd31b71476cd68e6b5f629a761154b65bb01a9f",
  "observed_at": "2026-10-11T13:29:51.282Z",
  "run": {
    "verify_key": "codex-engine-settings:e2e",
    "command": "node docs/verification/t1238/run-ui-journey.cjs",
    "exit_code": 0,
    "output_ref": "docs/verification/t1238/ui-journey-final-10.txt"
  },
  "environment": {
    "surface": "browser",
    "runtime": "Playwright Chromium（实际浏览器、真实隔离后端）",
    "viewports": [
      {
        "width": 1366,
        "height": 900,
        "result": "pass"
      },
      {
        "width": 390,
        "height": 900,
        "result": "pass"
      }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      {
        "id": "isolated-settings-user",
        "role": "真实本地用户偏好持久化"
      },
      {
        "id": "official-codex-local-runtime",
        "role": "实际本地Codex登录状态读取"
      }
    ]
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1238/settings-pending-guard-recheck.txt"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1238/settings-codex-connected.png"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1238/ui-final.json"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "未要求用户签审；不以机器操作代替用户体验确认"
    }
  },
  "checks": [
    {
      "id": "AC-UI-1",
      "test_id": "E2E-T1238-SETTINGS",
      "result": "pass",
      "evidence_ref": "docs/verification/t1238/ui-final.json#AC-UI-1"
    },
    {
      "id": "AC-UI-2",
      "test_id": "E2E-T1238-SETTINGS",
      "result": "pass",
      "evidence_ref": "docs/verification/t1238/ui-final.json#AC-UI-2"
    },
    {
      "id": "AC-UI-3",
      "test_id": "E2E-T1238-SETTINGS",
      "result": "pass",
      "evidence_ref": "docs/verification/t1238/ui-final.json#AC-UI-3"
    },
    {
      "id": "AC-UI-4",
      "test_id": "E2E-T1238-SETTINGS",
      "result": "pass",
      "evidence_ref": "docs/verification/t1238/ui-final.json#AC-UI-4"
    },
    {
      "id": "AC-UI-5",
      "test_id": "E2E-T1238-SETTINGS",
      "result": "pass",
      "evidence_ref": "docs/verification/t1238/ui-final.json#AC-UI-5"
    },
    {
      "id": "AC-UI-6",
      "test_id": "E2E-T1238-SETTINGS",
      "result": "pass",
      "evidence_ref": "docs/verification/t1238/ui-final.json#AC-UI-6"
    },
    {
      "id": "AC-UI-7",
      "test_id": "E2E-T1238-SETTINGS",
      "result": "pass",
      "evidence_ref": "docs/verification/t1238/ui-final.json#AC-UI-7"
    },
    {
      "id": "AC-UI-8",
      "test_id": "E2E-T1238-SETTINGS",
      "result": "pass",
      "evidence_ref": "docs/verification/t1238/ui-final.json#AC-UI-8"
    },
    {
      "id": "AC-UI-9",
      "test_id": "E2E-T1238-SETTINGS",
      "result": "pass",
      "evidence_ref": "docs/verification/t1238/ui-final.json#AC-UI-9"
    },
    {
      "id": "AC-UI-10",
      "test_id": "E2E-T1238-SETTINGS",
      "result": "pass",
      "evidence_ref": "docs/verification/t1238/ui-final.json#AC-UI-10"
    }
  ],
  "coverage": [
    {
      "condition": "loading",
      "result": "pass",
      "evidence_ref": "docs/verification/t1238/ui-final.json"
    },
    {
      "condition": "unauthenticated",
      "result": "pass",
      "evidence_ref": "docs/verification/t1238/ui-final.json"
    },
    {
      "condition": "image-unavailable",
      "result": "pass",
      "evidence_ref": "docs/verification/t1238/ui-final.json"
    },
    {
      "condition": "refresh",
      "result": "pass",
      "evidence_ref": "docs/verification/t1238/ui-final.json"
    },
    {
      "condition": "repeat",
      "result": "pass",
      "evidence_ref": "docs/verification/t1238/ui-final.json"
    },
    {
      "condition": "error",
      "result": "pass",
      "evidence_ref": "docs/verification/t1238/ui-final.json"
    }
  ],
  "visible_copy": {
    "artifact_path": "docs/verification/t1238/visible-copy.json",
    "artifact_sha256": "2eb2b8eb3bf7b316c41510d325175b01d2da3ecc7878f1abd9797cae8ac6aac8"
  },
  "tdd_red_ref": "docs/verification/t1238/ui-final-turbopack-failure.txt",
  "open_defects": [],
  "status": "pass",
  "limitations": [
    "未登录、生图能力不可用、保存失败是明确浏览器故障注入；正常GET/PATCH、刷新、双窗及最终登录检查是真实服务。",
    "安装版未验；23类账户功能未逐族全部真机。",
    "偏好加载保护使用明确延迟本轮真实GET验证：原服务仍返回真实值，独立文本/图片探测请求为0。",
    "范围外短超时、隔离PG/打包资源与控制面T1204失败保留，不签全局全绿。"
  ]
}
```
