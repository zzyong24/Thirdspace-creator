# T-1355 冻结候选前瞻验收

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1355",
  "contract_path": "docs/verification/t1355/control/PAGE_SPEC.md",
  "contract_sha": "2f88a3406426",
  "commit_sha": "721dfacf7b3bcbe82eb9c39b61acf1fb1df367d2",
  "observed_at": "2026-10-18T20:43:07.056Z",
  "execution_source": {
    "commit_sha": "d8ea55831914cbe51afec210b6b3c1c0c8c691f3",
    "validation_target_commit": "721dfacf7b3bcbe82eb9c39b61acf1fb1df367d2",
    "watched_path_proof": [
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
        "path": "frontend/src/features/platform-account/native-report-panel.tsx",
        "execution_sha256": "c4a51e5292b2fa98f346c513244540e4b9a3773608f96c008d37d73068c717ee",
        "target_sha256": "c4a51e5292b2fa98f346c513244540e4b9a3773608f96c008d37d73068c717ee",
        "equal": true
      },
      {
        "path": "frontend/src/features/platform-account/account-binding-panel.test.tsx",
        "execution_sha256": "d9e8faf88f6f11b44e91375acbc52cd721e282fcfee8ca6b170097311c874e11",
        "target_sha256": "d9e8faf88f6f11b44e91375acbc52cd721e282fcfee8ca6b170097311c874e11",
        "equal": true
      },
      {
        "path": "frontend/src/features/platform-account/account-group-manager.test.tsx",
        "execution_sha256": "4d8c78cf278a80e964a63e5b2dde0ccd168d3044bcefb6a0ead924d76f8ddf43",
        "target_sha256": "4d8c78cf278a80e964a63e5b2dde0ccd168d3044bcefb6a0ead924d76f8ddf43",
        "equal": true
      },
      {
        "path": "frontend/src/features/platform-account/native-report-panel.test.tsx",
        "execution_sha256": "03911964999f5802b4566363d1e328d57a10deab9158f42da3dd96a53df1ab86",
        "target_sha256": "03911964999f5802b4566363d1e328d57a10deab9158f42da3dd96a53df1ab86",
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
      }
    ],
    "boundary": "真实历史输出保原执行ref；当前HEAD为strict目标。逐路径SHA与必要显式消费者映射保留整文件失配事实；新增入口/总览由T1362当前正式链补验，随后taskctl仍执行当前候选wrapper。"
  },
  "run": {
    "verify_key": "t1355-binding-completion:e2e",
    "command": "node docs/verification/t1355/control/run-frozen-ui.mjs T-1355",
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
      "evidence_ref": "docs/verification/t1355/focused-green-visual-refinement.txt"
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
      "test_id": "t1355-verified-close",
      "result": "pass",
      "evidence_ref": "docs/verification/t1355/candidate-final-attempt02/artifacts/t1355-binding-dialog-compl-e4400-定真实写后读自动回位、原run恢复与正式Next同ID-t1355-normal/witness.json#real-back-refresh-members"
    },
    {
      "id": "unverified_retains_original",
      "test_id": "t1355-retain-run",
      "result": "pass",
      "evidence_ref": "docs/verification/t1355/candidate-final-attempt02/artifacts/t1355-binding-dialog-compl-e4400-定真实写后读自动回位、原run恢复与正式Next同ID-t1355-normal/witness.json#failed-original-run-visible"
    },
    {
      "id": "intent_and_repeated_binding",
      "test_id": "t1355-repeat",
      "result": "pass",
      "evidence_ref": "docs/verification/t1355/candidate-final-attempt02/artifacts/t1355-binding-dialog-compl-e4400-定真实写后读自动回位、原run恢复与正式Next同ID-t1355-normal/witness.json#real-back-refresh-members"
    },
    {
      "id": "single_surface_and_focus",
      "test_id": "t1355-single-surface",
      "result": "pass",
      "evidence_ref": "docs/verification/t1355/candidate-final-attempt02/artifacts/t1355-binding-dialog-compl-e4400-定真实写后读自动回位、原run恢复与正式Next同ID-t1355-normal/witness.json#verified-auto-closed"
    },
    {
      "id": "responsive_states",
      "test_id": "t1355-responsive",
      "result": "pass",
      "evidence_ref": "docs/verification/t1355/candidate-final-attempt02/artifacts/t1355-binding-dialog-compl-e4400-定真实写后读自动回位、原run恢复与正式Next同ID-t1355-normal/witness.json#native-chrome-200-members"
    }
  ],
  "coverage": [
    {
      "condition": "back",
      "result": "pass",
      "evidence_ref": "docs/verification/t1355/candidate-final-attempt02/artifacts/t1355-binding-dialog-compl-e4400-定真实写后读自动回位、原run恢复与正式Next同ID-t1355-normal/witness.json#real-back-refresh-members"
    },
    {
      "condition": "refresh",
      "result": "pass",
      "evidence_ref": "docs/verification/t1355/candidate-final-attempt02/artifacts/t1355-binding-dialog-compl-e4400-定真实写后读自动回位、原run恢复与正式Next同ID-t1355-normal/witness.json#real-back-refresh-members"
    },
    {
      "condition": "repeat",
      "result": "pass",
      "evidence_ref": "docs/verification/t1355/candidate-final-attempt02/artifacts/t1355-binding-dialog-compl-e4400-定真实写后读自动回位、原run恢复与正式Next同ID-t1355-normal/witness.json#unknown-reopen-no-resubmit"
    },
    {
      "condition": "keyboard",
      "result": "pass",
      "evidence_ref": "docs/verification/t1355/candidate-final-attempt02/artifacts/t1355-binding-dialog-compl-e4400-定真实写后读自动回位、原run恢复与正式Next同ID-t1355-normal/witness.json#waiting-single-title"
    },
    {
      "condition": "empty",
      "result": "pass",
      "evidence_ref": "docs/verification/t1355/candidate-final-attempt02/artifacts/t1355-binding-dialog-compl-e4400-定真实写后读自动回位、原run恢复与正式Next同ID-t1355-normal/witness.json#empty-platform-choice"
    },
    {
      "condition": "error",
      "result": "pass",
      "evidence_ref": "docs/verification/t1355/candidate-final-attempt02/artifacts/t1355-binding-dialog-compl-e4400-定真实写后读自动回位、原run恢复与正式Next同ID-t1355-normal/witness.json#failed-original-run-visible"
    },
    {
      "condition": "loading",
      "result": "pass",
      "evidence_ref": "docs/verification/t1355/candidate-final-attempt02/artifacts/t1355-binding-dialog-compl-e4400-定真实写后读自动回位、原run恢复与正式Next同ID-t1355-normal/witness.json#waiting-single-title"
    },
    {
      "condition": "zoom",
      "result": "pass",
      "evidence_ref": "docs/verification/t1355/candidate-final-attempt02/artifacts/t1355-binding-dialog-compl-e4400-定真实写后读自动回位、原run恢复与正式Next同ID-t1355-normal/witness.json#native-chrome-200-members"
    }
  ],
  "visible_copy": {
    "artifact_path": "docs/verification/t1355/control/VISIBLE_COPY.json",
    "artifact_sha256": "3e29923dbbb4ebfcec38b7e1b2c9daed9c71fa4380be3d01864ac968f81423ee"
  },
  "tdd_red_ref": "docs/verification/t1355/baseline/behavior-red-manager.txt",
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
