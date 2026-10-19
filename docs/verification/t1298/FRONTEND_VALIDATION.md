# T-1298 真实模型公共旅程验收

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1298",
  "contract_path": "docs/verification/t1298/JOURNEY_CONTRACT.md",
  "contract_sha": "dad555d4382d",
  "commit_sha": "8dbccad6a1b359bd69cd0d43a68988b1b4d37b95",
  "observed_at": "2026-10-15T12:11:53.170821+00:00",
  "run": {
    "verify_key": "script-first-live:e2e",
    "command": "node docs/verification/t1298/run-journey.cjs",
    "exit_code": 0,
    "output_ref": "docs/verification/t1298/logs/browser-sol-final-live.log"
  },
  "environment": {
    "surface": "browser",
    "runtime": "Google Chrome / macOS；新owned PGlite公共宿主，正常Codex授权",
    "viewports": [
      {
        "width": 1536,
        "height": 1024,
        "result": "pass"
      },
      {
        "width": 1280,
        "height": 800,
        "result": "pass"
      }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      {
        "id": "output-e0f0e303-26",
        "role": "公共API创建并真实模型重组/校正采纳的公众号作品"
      },
      {
        "id": "output-e0f0e303-35",
        "role": "公共API创建并真实模型重组/校正采纳的图文作品"
      }
    ]
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1298/CONTENT_LIVE_REVIEW.md"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1298/VISUAL_REVIEW.md"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1298/logs/browser-sol-final-live.log"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "受委派执行者已按实际截图复核；未冒充用户亲自验收或安装版认可。"
    }
  },
  "checks": [
    {
      "id": "real-script-platform-adoption",
      "test_id": "T1298 真实模型重组与对话校正均可采纳，刷新后平台独立且原稿不变",
      "result": "pass",
      "evidence_ref": "docs/verification/t1298/CONTENT_LIVE_REVIEW.md"
    }
  ],
  "coverage": [
    {
      "condition": "真实模型读取原稿并重组两平台",
      "result": "pass",
      "evidence_ref": "docs/verification/t1298/CONTENT_LIVE_REVIEW.md"
    },
    {
      "condition": "真实候选预览与采纳保存、精确版本及刷新读回",
      "result": "pass",
      "evidence_ref": "docs/verification/t1298/CONTENT_LIVE_REVIEW.md"
    },
    {
      "condition": "对话校正后脚本与另一平台不变",
      "result": "pass",
      "evidence_ref": "docs/verification/t1298/CONTENT_LIVE_REVIEW.md"
    },
    {
      "condition": "候选简化预览与主稿一致、两种桌面宽度可用",
      "result": "pass",
      "evidence_ref": "docs/verification/t1298/VISUAL_REVIEW.md"
    }
  ],
  "tdd_red_ref": "docs/verification/t1298/logs/browser-final-live.log",
  "open_defects": [],
  "status": "pass",
  "limitations": [
    "未做ASR或图片生成；剪辑公共旅程复用同源码T1296证据",
    "未安装、部署或替换用户现用App",
    "图文截图覆盖第一页；第二页视觉未单独检查，完整正文以公共精确版本逐字核验。",
    "原1280刷新后输入框断言失败、sandbox端口监听失败均保留；eslint前后相同10项既有错误未修。"
  ]
}
```

四轮完整真实旅程与内容核对见 CONTENT_LIVE_REVIEW.md，实际截图复核与范围见 VISUAL_REVIEW.md。原失败不被当前PASS抹去；全局对账及历史欠债由总控另行归因。
