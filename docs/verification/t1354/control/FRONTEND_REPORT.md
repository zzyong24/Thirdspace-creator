# T-1354 冻结候选前瞻验收

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1354",
  "contract_path": "docs/verification/t1354/control/PAGE_SPEC.md",
  "contract_sha": "7bf47aa9eb7f",
  "commit_sha": "721dfacf7b3bcbe82eb9c39b61acf1fb1df367d2",
  "observed_at": "2026-10-18T20:43:06.061Z",
  "execution_source": {
    "commit_sha": "d8ea55831914cbe51afec210b6b3c1c0c8c691f3",
    "validation_target_commit": "721dfacf7b3bcbe82eb9c39b61acf1fb1df367d2",
    "watched_path_proof": [
      {
        "path": "ai-worker/src/runtime/platform/wechat-browser-source.ts",
        "execution_sha256": "6f123299ea111a17db56a690c5b9e53f3cb3736bfcc73b9e8ef5ecf9a65e5a36",
        "target_sha256": "9f13ab36d297d6422f0f3b25e795dab957ef1db47e0ebc7038231e3bbf5e1b43",
        "equal": false,
        "scope_mapping_ref": "docs/verification/t1362/control/SOURCE_SCOPE_MAPPING_FINAL.json"
      },
      {
        "path": "ai-worker/src/runtime/platform/wechat-dom-witness.ts",
        "execution_sha256": "eb22acc8cfc9115f5a20c0f2b104eb91d7e7100ddd83cd63d23cd48c4dfe2d52",
        "target_sha256": "29026c21ca3744648919476dae0163e73c327b078ba91761f90f9ac501e618d6",
        "equal": false,
        "scope_mapping_ref": "docs/verification/t1362/control/SOURCE_SCOPE_MAPPING_FINAL.json"
      },
      {
        "path": "ai-worker/src/runtime/platform/wechat-official-binding-navigation.integration.test.ts",
        "execution_sha256": "f3a3e5ffb025ff5cca11bbdacf9ffb07036ad7d35e8c348d7f8a7c0226494329",
        "target_sha256": "f3a3e5ffb025ff5cca11bbdacf9ffb07036ad7d35e8c348d7f8a7c0226494329",
        "equal": true
      },
      {
        "path": "frontend/src/features/platform-account/account-binding-panel.tsx",
        "execution_sha256": "006bd21e71404678f2f74d9d872649559f5b8efc97d758d007cabdb86cd51889",
        "target_sha256": "006bd21e71404678f2f74d9d872649559f5b8efc97d758d007cabdb86cd51889",
        "equal": true
      },
      {
        "path": "frontend/src/features/platform-account/account-group-manager.tsx",
        "execution_sha256": "8df36d789c0fac7d0000a77f929080a02560034f0761964821216ba5e5c89326",
        "target_sha256": "8df36d789c0fac7d0000a77f929080a02560034f0761964821216ba5e5c89326",
        "equal": true
      },
      {
        "path": "frontend/tests/e2e/t1355-binding-dialog-completion.spec.ts",
        "execution_sha256": "c1980e6e3e2964e4800237bfc1d7ad5e57731ea9d08f769ba1d575514f2a7e74",
        "target_sha256": "c1980e6e3e2964e4800237bfc1d7ad5e57731ea9d08f769ba1d575514f2a7e74",
        "equal": true
      },
      {
        "path": "frontend/playwright.t1355.config.ts",
        "execution_sha256": "9eb21929592a20baefa76023306030ad4a4cafd37654a5d0959dfced0bd48e1e",
        "target_sha256": "9eb21929592a20baefa76023306030ad4a4cafd37654a5d0959dfced0bd48e1e",
        "equal": true
      },
      {
        "path": "docs/verification/t1355/harness/binding-fixture-server.mts",
        "execution_sha256": "e04d30586a60947aa0f34d45260f0f084736650d70b06cb73ed796d860e63f13",
        "target_sha256": "e04d30586a60947aa0f34d45260f0f084736650d70b06cb73ed796d860e63f13",
        "equal": true
      }
    ],
    "boundary": "真实历史输出保原执行ref；当前HEAD为strict目标。逐路径SHA与必要显式消费者映射保留整文件失配事实；新增入口/总览由T1362当前正式链补验，随后taskctl仍执行当前候选wrapper。"
  },
  "run": {
    "verify_key": "t1354-official-binding:e2e",
    "command": "node docs/verification/t1355/control/run-frozen-ui.mjs T-1354",
    "exit_code": 0,
    "output_ref": "docs/verification/t1355/candidate-final-attempt02/SAFE_SUMMARY.json"
  },
  "environment": {
    "surface": "browser",
    "runtime": "Chromium 与实际 Chrome 桌面浏览器",
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
        "id": "isolated-persistent-t1355-1",
        "role": "真实私有数据库同ID读回与页面见证",
        "evidence_ref": "docs/verification/t1355/candidate-final-attempt02/artifacts/t1355-binding-dialog-compl-e4400-定真实写后读自动回位、原run恢复与正式Next同ID-t1355-minimum/witness.json"
      },
      {
        "id": "isolated-persistent-t1355-2",
        "role": "真实私有数据库同ID读回与页面见证",
        "evidence_ref": "docs/verification/t1355/candidate-final-attempt02/artifacts/t1355-binding-dialog-compl-e4400-定真实写后读自动回位、原run恢复与正式Next同ID-t1355-normal/witness.json"
      }
    ],
    "boundary": "代表性事实通过真实服务持久化；无DTO成功替身。平台身份或目录输入为明确合成事实，非真人扫码、非新平台采集。"
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1354/navigation-probe/IMPLEMENTATION_REPORT.md"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1355/visual-final-source-mapping/REPORT.md"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1355/candidate-final-attempt02/SAFE_SUMMARY.json"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "独立像素复核和执行者过程证据，不冒用户亲手验收"
    }
  },
  "checks": [
    {
      "id": "verified_auto_close",
      "test_id": "t1354-official-navigation-commit",
      "result": "pass",
      "evidence_ref": "docs/verification/t1355/candidate-final-attempt02/artifacts/t1355-binding-dialog-compl-e4400-定真实写后读自动回位、原run恢复与正式Next同ID-t1355-normal/witness.json#real-back-refresh-members"
    }
  ],
  "coverage": [
    {
      "condition": "keyboard",
      "result": "pass",
      "evidence_ref": "docs/verification/t1355/candidate-final-attempt02/artifacts/t1355-binding-dialog-compl-e4400-定真实写后读自动回位、原run恢复与正式Next同ID-t1355-normal/witness.json#waiting-single-title"
    },
    {
      "condition": "error",
      "result": "pass",
      "evidence_ref": "docs/verification/t1355/candidate-final-attempt02/artifacts/t1355-binding-dialog-compl-e4400-定真实写后读自动回位、原run恢复与正式Next同ID-t1355-normal/witness.json#failed-original-run-visible"
    },
    {
      "condition": "refresh",
      "result": "pass",
      "evidence_ref": "docs/verification/t1355/candidate-final-attempt02/artifacts/t1355-binding-dialog-compl-e4400-定真实写后读自动回位、原run恢复与正式Next同ID-t1355-normal/witness.json#real-back-refresh-members"
    },
    {
      "condition": "back",
      "result": "pass",
      "evidence_ref": "docs/verification/t1355/candidate-final-attempt02/artifacts/t1355-binding-dialog-compl-e4400-定真实写后读自动回位、原run恢复与正式Next同ID-t1355-normal/witness.json#real-back-refresh-members"
    }
  ],
  "visible_copy": {
    "artifact_path": "docs/verification/t1354/control/VISIBLE_COPY.json",
    "artifact_sha256": "b85a9637992b7c3d97ae79ba47010275867b14af5d2886d527c1613bc61e44b0"
  },
  "tdd_red_ref": "docs/verification/t1354/navigation-probe/SUMMARY.json",
  "open_defects": [],
  "status": "pass",
  "scope_notes": [
    "历史执行ref、当前strict目标与visual报告中的原像素ref分别保留，不将旧run重命名为当前执行；当前新增作品入口/总览见T1362正式04与独立图审。",
    "原公众号1726首因UNKNOWN；受控导航恢复不代签真人微信扫码。",
    "视频号原REPORT_LINK_MISSING未定位菜单，未重发；首页已知缺消费者修复不冒所有平台采集恢复。",
    "200%全局充值入口轻度遮按钮空白区，Root认定非本任务阻断，未改全局计费入口。",
    "当前安装App仍3b，未将本源验收写为已安装。",
    "最终721全局reconcile自然44ERROR/0WARN，32+7+2+3分层，新增切组宽收据失配登记T1360；当前报告不签全局通过。证据：docs/verification/t1362/control/RECONCILE_FINAL_SCOPE_CLASSIFICATION.json。"
  ]
}
```
