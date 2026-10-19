# T-1362 冻结候选前瞻验收

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1362",
  "contract_path": "docs/verification/t1362/control/PAGE_SPEC.md",
  "contract_sha": "e411a4bb9ee8",
  "commit_sha": "721dfacf7b3bcbe82eb9c39b61acf1fb1df367d2",
  "observed_at": "2026-10-18T20:43:10.047Z",
  "execution_source": {
    "commit_sha": "969d1cf40414b3cec3c414de56af1a124212f35e",
    "validation_target_commit": "721dfacf7b3bcbe82eb9c39b61acf1fb1df367d2",
    "watched_path_proof": [
      {
        "path": "frontend/src/components/shell/account-switcher.tsx",
        "execution_sha256": "c469d3d402a11e1e9071fc21366f696bc7bb4ded3bcf1503aee2ae0bba192443",
        "target_sha256": "c469d3d402a11e1e9071fc21366f696bc7bb4ded3bcf1503aee2ae0bba192443",
        "equal": true
      },
      {
        "path": "frontend/src/components/shell/account-switcher.test.tsx",
        "execution_sha256": "c70945ffdccadef044b54ea72708ca1d65fc44d716393248f9854b1a24fc4984",
        "target_sha256": "c70945ffdccadef044b54ea72708ca1d65fc44d716393248f9854b1a24fc4984",
        "equal": true
      },
      {
        "path": "frontend/src/app/(creator)/accounts/works/page.tsx",
        "execution_sha256": "d7e9c889f514087e16d1bf69a76339399e98198043fe21af51a16b488ffc58ee",
        "target_sha256": "d7e9c889f514087e16d1bf69a76339399e98198043fe21af51a16b488ffc58ee",
        "equal": true
      },
      {
        "path": "frontend/src/app/(creator)/accounts/works/page.test.tsx",
        "execution_sha256": "f78131fe4d42699cdb9d69394827a0feba71d2cc7ae23880722249f318c51250",
        "target_sha256": "f78131fe4d42699cdb9d69394827a0feba71d2cc7ae23880722249f318c51250",
        "equal": true
      },
      {
        "path": "frontend/src/features/platform-account/platform-work-account-navigation.tsx",
        "execution_sha256": "8f7cfc64a29aeb12a3724735e5725a2f006b564e4254220f672da765e533bda7",
        "target_sha256": "8f7cfc64a29aeb12a3724735e5725a2f006b564e4254220f672da765e533bda7",
        "equal": true
      },
      {
        "path": "frontend/src/features/platform-account/platform-work-catalog.tsx",
        "execution_sha256": "9144e625dc06e15e145b99039bc57c2b65d25d9baffad0f231625154739c7b91",
        "target_sha256": "9144e625dc06e15e145b99039bc57c2b65d25d9baffad0f231625154739c7b91",
        "equal": true
      },
      {
        "path": "frontend/src/features/onboarding/onboarding-steps.ts",
        "execution_sha256": "922bcaea2c4118236d2ab33d6842a71b98abf1f0b39a77e3b4863e7e4f4f55bf",
        "target_sha256": "922bcaea2c4118236d2ab33d6842a71b98abf1f0b39a77e3b4863e7e4f4f55bf",
        "equal": true
      },
      {
        "path": "frontend/src/features/onboarding/onboarding-steps.test.ts",
        "execution_sha256": "b5f1e26c24bc26573fe50e0a42adaadce3a4a696669cbd772ba15a8be4829523",
        "target_sha256": "b5f1e26c24bc26573fe50e0a42adaadce3a4a696669cbd772ba15a8be4829523",
        "equal": true
      },
      {
        "path": "frontend/src/features/onboarding/onboarding-card.tsx",
        "execution_sha256": "1587c69764a7c56beee29ea1f49c6786caabe3d472a150516c9fc51a432055d0",
        "target_sha256": "1587c69764a7c56beee29ea1f49c6786caabe3d472a150516c9fc51a432055d0",
        "equal": true
      },
      {
        "path": "frontend/src/features/onboarding/onboarding-card.test.tsx",
        "execution_sha256": "8f2142ef47b49ebd22c0ac9ae7f8595056635c52c2045ab144f04e74a9375f7a",
        "target_sha256": "8f2142ef47b49ebd22c0ac9ae7f8595056635c52c2045ab144f04e74a9375f7a",
        "equal": true
      },
      {
        "path": "frontend/src/features/projects/projects-page.tsx",
        "execution_sha256": "c877c07bd0340f12d16ae284b9c80b32b2baa901cda05ba8b5beb658e95fe492",
        "target_sha256": "c877c07bd0340f12d16ae284b9c80b32b2baa901cda05ba8b5beb658e95fe492",
        "equal": true
      },
      {
        "path": "frontend/src/features/projects/projects-page.test.tsx",
        "execution_sha256": "82414a0b32b836a518907a4e428109b582f6a892cc3b3f1fc78bed380820a2b1",
        "target_sha256": "82414a0b32b836a518907a4e428109b582f6a892cc3b3f1fc78bed380820a2b1",
        "equal": true
      },
      {
        "path": "frontend/src/features/group-workspace/group-overview.tsx",
        "execution_sha256": "0a6507e01f34ca1670bc3447c4e1261bc4852c359b600aa464a9a3ee21e6c9ec",
        "target_sha256": "0a6507e01f34ca1670bc3447c4e1261bc4852c359b600aa464a9a3ee21e6c9ec",
        "equal": true
      },
      {
        "path": "frontend/src/features/group-workspace/group-workspace.test.tsx",
        "execution_sha256": "f14d365daef79d0284930f7819464546e7249793012474c5e1e21d2b5908aa60",
        "target_sha256": "f14d365daef79d0284930f7819464546e7249793012474c5e1e21d2b5908aa60",
        "equal": true
      },
      {
        "path": "frontend/tests/e2e/t1362-collected-work-entry.spec.ts",
        "execution_sha256": "f43b9d5a1f8e2658aaae3e6f24953d79b06b1339d46ccb1da90199cb44bfb06c",
        "target_sha256": "f43b9d5a1f8e2658aaae3e6f24953d79b06b1339d46ccb1da90199cb44bfb06c",
        "equal": true
      },
      {
        "path": "frontend/playwright.t1362.config.ts",
        "execution_sha256": "eea2fb8ac05c293568629508041eea11f1370512c60d739db5b6d3bee3ccfa93",
        "target_sha256": "eea2fb8ac05c293568629508041eea11f1370512c60d739db5b6d3bee3ccfa93",
        "equal": true
      }
    ],
    "boundary": "真实历史输出保原执行ref；当前HEAD为strict目标。逐路径SHA与必要显式消费者映射保留整文件失配事实；新增入口/总览由T1362当前正式链补验，随后taskctl仍执行当前候选wrapper。"
  },
  "run": {
    "verify_key": "t1362-collected-work-entry:e2e",
    "command": "node docs/verification/t1355/control/run-frozen-ui.mjs T-1362",
    "exit_code": 0,
    "output_ref": "docs/verification/t1362/candidate-attempt04/SAFE_SUMMARY.json"
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
        "id": "isolated-persistent-t1362-1",
        "role": "真实私有数据库同ID读回与页面见证",
        "evidence_ref": "docs/verification/t1362/candidate-attempt04/artifacts/t1362-collected-work-entry-T1362-真实已采集作品入口、成员归属、typed指标与人工确认-t1362-minimum/witness.json"
      },
      {
        "id": "isolated-persistent-t1362-2",
        "role": "真实私有数据库同ID读回与页面见证",
        "evidence_ref": "docs/verification/t1362/candidate-attempt04/artifacts/t1362-collected-work-entry-T1362-真实已采集作品入口、成员归属、typed指标与人工确认-t1362-normal/witness.json"
      }
    ],
    "boundary": "代表性事实通过真实服务持久化；无DTO成功替身。平台身份或目录输入为明确合成事实，非真人扫码、非新平台采集。"
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1362/RESULT.md"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1362/visual-independent/REPORT.md"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1362/candidate-attempt04/SAFE_SUMMARY.json"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "独立像素复核和执行者过程证据，不冒用户亲手验收"
    }
  },
  "checks": [
    {
      "id": "collected_work_entry",
      "test_id": "t1362-real-entry-catalog",
      "result": "pass",
      "evidence_ref": "docs/verification/t1362/candidate-attempt04/artifacts/t1362-collected-work-entry-T1362-真实已采集作品入口、成员归属、typed指标与人工确认-t1362-normal/witness.json#completed-source-counts-unchanged"
    },
    {
      "id": "member_scope_and_reentry",
      "test_id": "t1362-member-scope",
      "result": "pass",
      "evidence_ref": "docs/verification/t1362/candidate-attempt04/artifacts/t1362-collected-work-entry-T1362-真实已采集作品入口、成员归属、typed指标与人工确认-t1362-normal/witness.json#valid-empty-group-members"
    },
    {
      "id": "truthful_work_metrics",
      "test_id": "t1362-same-id-work-metrics",
      "result": "pass",
      "evidence_ref": "docs/verification/t1362/candidate-attempt04/artifacts/t1362-collected-work-entry-T1362-真实已采集作品入口、成员归属、typed指标与人工确认-t1362-normal/witness.json#native-chrome-200-ks-seven-zero"
    },
    {
      "id": "manual_review_completion",
      "test_id": "t1362-pure-typed-manual-review",
      "result": "pass",
      "evidence_ref": "docs/verification/t1362/candidate-attempt04/artifacts/t1362-collected-work-entry-T1362-真实已采集作品入口、成员归属、typed指标与人工确认-t1362-normal/witness.json#completed-source-counts-unchanged"
    },
    {
      "id": "overview_typed_coverage",
      "test_id": "t1362-overview-typed",
      "result": "pass",
      "evidence_ref": "docs/verification/t1362/candidate-attempt04/artifacts/t1362-collected-work-entry-T1362-真实已采集作品入口、成员归属、typed指标与人工确认-t1362-normal/witness.json#overview-real-keyboard-filter-back-refresh"
    },
    {
      "id": "responsive_work_entry",
      "test_id": "t1362-entry-responsive",
      "result": "pass",
      "evidence_ref": "docs/verification/t1362/candidate-attempt04/artifacts/t1362-collected-work-entry-T1362-真实已采集作品入口、成员归属、typed指标与人工确认-t1362-normal/witness.json#native-chrome-200-ks-seven-zero"
    }
  ],
  "coverage": [
    {
      "condition": "loading",
      "result": "pass",
      "evidence_ref": "docs/verification/t1362/candidate-attempt04/artifacts/t1362-collected-work-entry-T1362-真实已采集作品入口、成员归属、typed指标与人工确认-t1362-normal/witness.json#real-group-navigation-loading"
    },
    {
      "condition": "empty",
      "result": "pass",
      "evidence_ref": "docs/verification/t1362/candidate-attempt04/artifacts/t1362-collected-work-entry-T1362-真实已采集作品入口、成员归属、typed指标与人工确认-t1362-normal/witness.json#valid-empty-group-members"
    },
    {
      "condition": "error",
      "result": "pass",
      "evidence_ref": "docs/verification/t1362/candidate-attempt04/artifacts/t1362-collected-work-entry-T1362-真实已采集作品入口、成员归属、typed指标与人工确认-t1362-normal/witness.json#explicit-cross-group-read-error-no-fallback"
    },
    {
      "condition": "repeat",
      "result": "pass",
      "evidence_ref": "docs/verification/t1362/candidate-attempt04/artifacts/t1362-collected-work-entry-T1362-真实已采集作品入口、成员归属、typed指标与人工确认-t1362-normal/witness.json#global-switch-preserves-path-clears-old-selection"
    },
    {
      "condition": "keyboard",
      "result": "pass",
      "evidence_ref": "docs/verification/t1362/candidate-attempt04/artifacts/t1362-collected-work-entry-T1362-真实已采集作品入口、成员归属、typed指标与人工确认-t1362-normal/witness.json#native-chrome-200-ks-seven-zero"
    },
    {
      "condition": "back",
      "result": "pass",
      "evidence_ref": "docs/verification/t1362/candidate-attempt04/artifacts/t1362-collected-work-entry-T1362-真实已采集作品入口、成员归属、typed指标与人工确认-t1362-normal/witness.json#overview-real-keyboard-filter-back-refresh"
    },
    {
      "condition": "refresh",
      "result": "pass",
      "evidence_ref": "docs/verification/t1362/candidate-attempt04/artifacts/t1362-collected-work-entry-T1362-真实已采集作品入口、成员归属、typed指标与人工确认-t1362-normal/witness.json#overview-real-keyboard-filter-back-refresh"
    },
    {
      "condition": "zoom",
      "result": "pass",
      "evidence_ref": "docs/verification/t1362/candidate-attempt04/artifacts/t1362-collected-work-entry-T1362-真实已采集作品入口、成员归属、typed指标与人工确认-t1362-normal/witness.json#native-chrome-200-ks-seven-zero"
    }
  ],
  "visible_copy": {
    "artifact_path": "docs/verification/t1362/control/VISIBLE_COPY.json",
    "artifact_sha256": "e1a14618d93e82e7c56bdc4998735debd29361815f597916da31da40c6fa4ce6"
  },
  "tdd_red_ref": "docs/verification/t1362/red/SAFE_SUMMARY.json",
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
