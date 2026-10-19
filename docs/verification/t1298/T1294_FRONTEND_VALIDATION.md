# T1294 在T1298当前源码上的公共回归

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1294",
  "contract_path": "docs/verification/t1294/JOURNEY_CONTRACT.md",
  "contract_sha": "9d1dea3ceda6",
  "commit_sha": "8dbccad6a1b359bd69cd0d43a68988b1b4d37b95",
  "observed_at": "2026-10-15T12:19:31.874163+00:00",
  "run": {
    "verify_key": "model-settings-codex-current:e2e",
    "command": "node docs/verification/t1294/run-journey.cjs",
    "exit_code": 0,
    "output_ref": "docs/verification/t1294/browser/runs/prepared-2c06a8f22158b86e/playwright.json"
  },
  "environment": {
    "surface": "browser",
    "runtime": "Playwright Chromium / macOS；正常Worker构建，fresh owned localhost服务、数据库与媒体目录；未改现用App或复制密钥",
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
        "id": "grp-08ba4e45-256",
        "role": "隔离测试组"
      },
      {
        "id": "ai-conv-08ba4e45-288",
        "role": "唯一新测试对话"
      },
      {
        "id": "ai-msg-08ba4e45-289",
        "role": "唯一新输入源消息"
      },
      {
        "id": "ai-task-641b22fe-d34c-4e81-bf48-9179830907fa",
        "role": "真实业务任务"
      },
      {
        "id": "execution-task-b0f91fdc-c073-4c08-8b55-6615593c5df7",
        "role": "同源succeeded执行任务"
      }
    ]
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-2c06a8f22158b86e/playwright.json"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-2c06a8f22158b86e/playwright.json"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-2c06a8f22158b86e/playwright.json"
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
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-2c06a8f22158b86e/playwright.json"
    },
    {
      "id": "image-sources",
      "test_id": "T1294 已保存混合图片与自配选择重开保留，主动改图片同次CAS只统一vision/image",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-2c06a8f22158b86e/playwright.json"
    },
    {
      "id": "cas-conflict",
      "test_id": "T1294 实际CAS冲突不覆盖其它窗口保存，原草稿与失败提示保留",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-2c06a8f22158b86e/playwright.json"
    },
    {
      "id": "redfox-keys",
      "test_id": "T1294 RedFox在模型页实际保存/掩码/重开/删除，旧深链仍可达且零查询费用",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-2c06a8f22158b86e/playwright.json"
    },
    {
      "id": "keyword-search",
      "test_id": "T1294 旧向量测试明确停用，真实资料创建/修订/搜索保原文与组隔离",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-2c06a8f22158b86e/playwright.json"
    },
    {
      "id": "recharge",
      "test_id": "T1294 常驻充值按钮走原空body受控POST，缺官方配置诚实失败且零资金新操作",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-2c06a8f22158b86e/playwright.json"
    },
    {
      "id": "layout-desktop",
      "test_id": "T1294 设置与助手 desktop 可读可操作且无画布/检查横条",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-2c06a8f22158b86e/playwright.json"
    },
    {
      "id": "layout-narrow",
      "test_id": "T1294 设置与助手 narrow 可读可操作且无画布/检查横条",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-2c06a8f22158b86e/playwright.json"
    },
    {
      "id": "layout-200",
      "test_id": "T1294 设置与助手 CSS640x450/DSF2等效200% 可读可操作且无画布/检查横条",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-2c06a8f22158b86e/playwright.json"
    },
    {
      "id": "codex-chat",
      "test_id": "T1294 唯一新本地Codex对话：设置检查一次→直接发送→四ID同任务完成并可读，unknown不重发",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-2c06a8f22158b86e/playwright.json"
    }
  ],
  "coverage": [
    {
      "condition": "保存后读回",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-2c06a8f22158b86e/playwright.json"
    },
    {
      "condition": "冲突保留草稿",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-2c06a8f22158b86e/playwright.json"
    },
    {
      "condition": "错组隔离",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-2c06a8f22158b86e/playwright.json"
    },
    {
      "condition": "失败保留原任务",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-2c06a8f22158b86e/playwright.json"
    },
    {
      "condition": "不重复检查与重发",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-2c06a8f22158b86e/playwright.json"
    },
    {
      "condition": "桌面窄屏与等效200%",
      "result": "pass",
      "evidence_ref": "docs/verification/t1294/browser/runs/prepared-2c06a8f22158b86e/playwright.json"
    }
  ],
  "tdd_red_ref": "docs/verification/t1294/cold-focus-default-red.log；close-lifecycle-red.log；pre-admission-red.log；ui-red.log；docs/verification/t1294/account-read-once-red.log",
  "open_defects": [],
  "status": "pass",
  "limitations": [
    "仅浏览器与受控真实本地Codex测试；原生App自动化未授权",
    "原失败任务不重发；未证明上游间歇RPC拒绝的唯一根因",
    "实际next.log保留ResourceGrantsPanel组作用域错误、account-null ingestion.douyin.status AccountRequiredError及主动CAS冲突；与历史同类，badge条目未打开，不能唯一归因1 Issue或声称console零异常。见docs/verification/t1298/regression/t1294-next-dev-issue.json",
    "真实付费官方模型、Growth生产部署、Windows及原生App操作不在本次浏览器验收范围"
  ],
  "scope_note": "本轮当前HEAD公共回归10/10，真实新Codex对话仅1次UI提交/1次chat POST、同四ID succeeded，0 legacy状态GET，未retry/resume；实际看过完成文本“连接正常”及设置/窄屏/200%截图。严格驱动test0/shutdown0见docs/verification/t1294/browser/runs/prepared-2c06a8f22158b86e/strict-run-result.json。旧TDD仅保留历史引用，不补拍红测；本回执仅更新受T1298生产窄修影响的公共组合验收。"
}
```

新测试库与真实对话独立于用户App。原10项合同和原失败不改；本次未把开发诊断清零当作通过条件。
