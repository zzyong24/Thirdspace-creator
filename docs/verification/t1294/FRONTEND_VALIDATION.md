# T1294 普通构建真实浏览器验收

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1294",
  "contract_path": "docs/verification/t1294/JOURNEY_CONTRACT.md",
  "contract_sha": "9d1dea3ceda6",
  "commit_sha": "d2691bc6ed5a938adc516f211e80fa611374d673",
  "observed_at": "2026-10-15T05:09:13.816Z",
  "run": {
    "verify_key": "model-settings-codex-current:e2e",
    "command": "node docs/verification/t1294/run-journey.cjs",
    "exit_code": 0,
    "output_ref": "docs/verification/t1294/browser/runs/prepared-c9038acd34aa82d8/playwright.json"
  },
  "environment": {
    "surface": "browser",
    "runtime": "Playwright Chromium / macOS；正常Worker构建、全新owned服务和数据库",
    "viewports": [
      {
        "width": 1536,
        "height": 1024,
        "result": "pass"
      },
      {
        "width": 390,
        "height": 844,
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
        "id": "grp-b2a58019-256",
        "role": "独立隔离测试组"
      },
      {
        "id": "ai-msg-b2a58019-289",
        "role": "唯一新输入源消息"
      },
      {
        "id": "ai-task-dad2d192-5d85-4e00-bb52-b2339749287e",
        "role": "真实业务任务"
      },
      {
        "id": "execution-task-fbad045f-2883-4cf6-82b1-9daba969b67f",
        "role": "同源succeeded执行任务"
      }
    ]
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1294/account-read-worker-regression.log；account-read-implementation-review/REPORT.md；close-lifecycle-public-regression.log；contract-regression.log；settings-regression-final.log"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-c9038acd34aa82d8/playwright.json"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-c9038acd34aa82d8/playwright.json"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "docs/features/t1294-model-settings-and-codex-chat-acceptance.md：用户安装后自行把关，原生App自动化暂不授权"
    }
  },
  "checks": [
    {
      "id": "official-default",
      "test_id": "T1294 fresh默认官方，设置无向量/独立图片理解与数据服务分类，充值常驻",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-c9038acd34aa82d8/playwright.json"
    },
    {
      "id": "image-sources",
      "test_id": "T1294 已保存混合图片与自配选择重开保留，主动改图片同次CAS只统一vision/image",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-c9038acd34aa82d8/playwright.json"
    },
    {
      "id": "cas-conflict",
      "test_id": "T1294 实际CAS冲突不覆盖其它窗口保存，原草稿与失败提示保留",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-c9038acd34aa82d8/playwright.json"
    },
    {
      "id": "redfox-keys",
      "test_id": "T1294 RedFox在模型页实际保存/掩码/重开/删除，旧深链仍可达且零查询费用",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-c9038acd34aa82d8/playwright.json"
    },
    {
      "id": "keyword-search",
      "test_id": "T1294 旧向量测试明确停用，真实资料创建/修订/搜索保原文与组隔离",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-c9038acd34aa82d8/playwright.json"
    },
    {
      "id": "recharge",
      "test_id": "T1294 常驻充值按钮走原空body受控POST，缺官方配置诚实失败且零资金新操作",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-c9038acd34aa82d8/playwright.json"
    },
    {
      "id": "layout-desktop",
      "test_id": "T1294 设置与助手 desktop 可读可操作且无画布/检查横条",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-c9038acd34aa82d8/playwright.json"
    },
    {
      "id": "layout-narrow",
      "test_id": "T1294 设置与助手 narrow 可读可操作且无画布/检查横条",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-c9038acd34aa82d8/playwright.json"
    },
    {
      "id": "layout-200",
      "test_id": "T1294 设置与助手 CSS640x450/DSF2等效200% 可读可操作且无画布/检查横条",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-c9038acd34aa82d8/playwright.json"
    },
    {
      "id": "codex-chat",
      "test_id": "T1294 唯一新本地Codex对话：设置检查一次→直接发送→四ID同任务完成并可读，unknown不重发",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-c9038acd34aa82d8/playwright.json"
    }
  ],
  "coverage": [
    {
      "condition": "保存后读回",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-c9038acd34aa82d8/playwright.json"
    },
    {
      "condition": "冲突保留草稿",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-c9038acd34aa82d8/playwright.json"
    },
    {
      "condition": "错组隔离",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-c9038acd34aa82d8/playwright.json"
    },
    {
      "condition": "失败保留原任务",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-c9038acd34aa82d8/playwright.json"
    },
    {
      "condition": "不重复检查与重发",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-c9038acd34aa82d8/playwright.json"
    },
    {
      "condition": "桌面窄屏与等效200%",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-c9038acd34aa82d8/playwright.json"
    }
  ],
  "tdd_red_ref": "docs/verification/t1294/cold-focus-default-red.log；close-lifecycle-red.log；pre-admission-red.log；ui-red.log；docs/verification/t1294/account-read-once-red.log",
  "open_defects": [],
  "status": "pass",
  "limitations": [
    "仅浏览器与受控真实本地Codex测试；原生App自动化未授权",
    "原失败任务不重发；未证明上游间歇RPC拒绝的唯一根因",
    "开发页面保留Next dev 1 Issue，已有ResourceGrantsPanel组作用域日志；未将该10项通过视为全应用console零错误",
    "真实付费官方模型、Growth生产部署、Windows及原生App操作不在本次浏览器验收范围"
  ],
  "scope_note": "当前正常bundle独立完整10项通过；仅精确account/read/-32603同连接多读一次，真实认证/权限校验不变。32次诊断中的5个原FAIL及旧任务未改写或重发，上游具体根因仍未唯一确定。App全部功能和全局历史欠债不在本回执通过结论内。"
}
```
