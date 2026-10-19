# T-1356 冻结候选前瞻验收

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1356",
  "contract_path": "docs/verification/t1356/control/PAGE_SPEC.md",
  "contract_sha": "ddc443b69620",
  "commit_sha": "721dfacf7b3bcbe82eb9c39b61acf1fb1df367d2",
  "observed_at": "2026-10-18T20:43:08.445Z",
  "execution_source": {
    "commit_sha": "d8ea55831914cbe51afec210b6b3c1c0c8c691f3",
    "validation_target_commit": "721dfacf7b3bcbe82eb9c39b61acf1fb1df367d2",
    "watched_path_proof": [
      {
        "path": "backend/src/application/queries/group-workspace.ts",
        "execution_sha256": "2423d9bedee378f8758498a35c332ac3d9af5f2fba37a1ef7e06467907fc70fa",
        "target_sha256": "2423d9bedee378f8758498a35c332ac3d9af5f2fba37a1ef7e06467907fc70fa",
        "equal": true
      },
      {
        "path": "backend/src/application/queries/dashboard-collected-metrics.ts",
        "execution_sha256": "83ce970818a90a9a84f63dedb6351acb4eb4dadeccb1d857692fd2dc9a5e59d2",
        "target_sha256": "83ce970818a90a9a84f63dedb6351acb4eb4dadeccb1d857692fd2dc9a5e59d2",
        "equal": true
      },
      {
        "path": "backend/src/modules/platform-account/account-group.service.ts",
        "execution_sha256": "f60e1b3de2a87c54e1063e7f939f21a76d929f3ba667e449cd8cfa55b6555f21",
        "target_sha256": "f60e1b3de2a87c54e1063e7f939f21a76d929f3ba667e449cd8cfa55b6555f21",
        "equal": true
      },
      {
        "path": "backend/src/modules/platform-collection/platform-collection.service.ts",
        "execution_sha256": "7c5f24fa46ba40320342210807d0c1bce50ab05d66247da16107dd803fc950e0",
        "target_sha256": "7c5f24fa46ba40320342210807d0c1bce50ab05d66247da16107dd803fc950e0",
        "equal": true
      },
      {
        "path": "contract/src/pages/group-workspace.ts",
        "execution_sha256": "e1ee7b0322b8aa37083e1bf0225398efab73bb0a11d603568566256f89365101",
        "target_sha256": "e1ee7b0322b8aa37083e1bf0225398efab73bb0a11d603568566256f89365101",
        "equal": true
      },
      {
        "path": "frontend/src/server/persistence-client.ts",
        "execution_sha256": "c534a5f251fa3e844a7ee6e106800b39291bab069aa64a2f1c3d3208ffdf5b12",
        "target_sha256": "9b5cd73843b332b31761f6892fd898a8fae98faee2fc608eb837850c556efd6c",
        "equal": false,
        "scope_mapping_ref": "docs/verification/t1362/control/SOURCE_SCOPE_MAPPING_FINAL.json"
      },
      {
        "path": "frontend/src/app/(creator)/page.tsx",
        "execution_sha256": "8d126642f8f986ce549b9a6debefc5ff1ad349b6ef91ba069f36189732609ea4",
        "target_sha256": "8d126642f8f986ce549b9a6debefc5ff1ad349b6ef91ba069f36189732609ea4",
        "equal": true
      },
      {
        "path": "frontend/src/features/dashboard/dashboard-page.tsx",
        "execution_sha256": "6f89f5ac647d6c9baaba0475f6c15396366a1707725dd65210c795287fbbbfbc",
        "target_sha256": "6f89f5ac647d6c9baaba0475f6c15396366a1707725dd65210c795287fbbbfbc",
        "equal": true
      },
      {
        "path": "frontend/src/features/dashboard/dashboard-page.test.tsx",
        "execution_sha256": "41a062947dc125376ed1513b4b9317e88f4fcc1629e7a18114c372a93928c00f",
        "target_sha256": "41a062947dc125376ed1513b4b9317e88f4fcc1629e7a18114c372a93928c00f",
        "equal": true
      },
      {
        "path": "frontend/src/features/dashboard/dashboard-trend-card.tsx",
        "execution_sha256": "4a59455210b0d36d219e72b51ef4b67caa00c0673f7618cbb187b9b1802f977e",
        "target_sha256": "4a59455210b0d36d219e72b51ef4b67caa00c0673f7618cbb187b9b1802f977e",
        "equal": true
      },
      {
        "path": "frontend/src/features/dashboard/dashboard-trend-card.test.tsx",
        "execution_sha256": "879ef48913c83d5c3fba44e25b4e63445b68c75275f28ca1a97654b8f4386e1b",
        "target_sha256": "879ef48913c83d5c3fba44e25b4e63445b68c75275f28ca1a97654b8f4386e1b",
        "equal": true
      },
      {
        "path": "frontend/src/components/analytics/horizontal-bars-chart.tsx",
        "execution_sha256": "287c983f527f9b490ede520b30051d9569c26574bd8bbeafe300e0d5c725e1fb",
        "target_sha256": "287c983f527f9b490ede520b30051d9569c26574bd8bbeafe300e0d5c725e1fb",
        "equal": true
      },
      {
        "path": "frontend/tests/e2e/t1356-collected-metrics.spec.ts",
        "execution_sha256": "1786ae378ae5d1f55ded05610088b57dbca37da5c9e3de26a89897e58dfa52cc",
        "target_sha256": "1786ae378ae5d1f55ded05610088b57dbca37da5c9e3de26a89897e58dfa52cc",
        "equal": true
      },
      {
        "path": "frontend/playwright.t1356.config.ts",
        "execution_sha256": "93d883582dc3388871503ac1387f10336544717c2d2519771e4b61e2c8012359",
        "target_sha256": "93d883582dc3388871503ac1387f10336544717c2d2519771e4b61e2c8012359",
        "equal": true
      }
    ],
    "boundary": "真实历史输出保原执行ref；当前HEAD为strict目标。逐路径SHA与必要显式消费者映射保留整文件失配事实；新增入口/总览由T1362当前正式链补验，随后taskctl仍执行当前候选wrapper。"
  },
  "run": {
    "verify_key": "t1356-collected-dashboard:e2e",
    "command": "node docs/verification/t1355/control/run-frozen-ui.mjs T-1356",
    "exit_code": 0,
    "output_ref": "docs/verification/t1356/candidate-attempt05/SAFE_SUMMARY.json"
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
        "id": "isolated-persistent-t1356-1",
        "role": "真实私有数据库同ID读回与页面见证",
        "evidence_ref": "docs/verification/t1356/candidate-attempt05/artifacts/t1356-collected-metrics-T1-00e84-d采集经真实Next与首页同scope、日期与累计语义-t1356-minimum/witness.json"
      },
      {
        "id": "isolated-persistent-t1356-2",
        "role": "真实私有数据库同ID读回与页面见证",
        "evidence_ref": "docs/verification/t1356/candidate-attempt05/artifacts/t1356-collected-metrics-T1-00e84-d采集经真实Next与首页同scope、日期与累计语义-t1356-normal/witness.json"
      }
    ],
    "boundary": "代表性事实通过真实服务持久化；无DTO成功替身。平台身份或目录输入为明确合成事实，非真人扫码、非新平台采集。"
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1356/backend/REPORT.md"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1356/visual-independent/VISUAL_REVIEW.md"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1356/candidate-attempt05/SAFE_SUMMARY.json"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "独立像素复核和执行者过程证据，不冒用户亲手验收"
    }
  },
  "checks": [
    {
      "id": "typed_metrics_same_scope",
      "test_id": "t1356-existing-collected",
      "result": "pass",
      "evidence_ref": "docs/verification/t1356/candidate-attempt05/artifacts/t1356-collected-metrics-T1-00e84-d采集经真实Next与首页同scope、日期与累计语义-t1356-normal/witness.json#completed-readonly-source-counts"
    },
    {
      "id": "truthful_metric_semantics",
      "test_id": "t1356-metric-semantics",
      "result": "pass",
      "evidence_ref": "docs/verification/t1356/candidate-attempt05/artifacts/t1356-collected-metrics-T1-00e84-d采集经真实Next与首页同scope、日期与累计语义-t1356-normal/witness.json#real-summary-sql-failure-retains-legacy-and-six-cards"
    },
    {
      "id": "frozen_group_attribution",
      "test_id": "t1356-frozen-attribution",
      "result": "pass",
      "evidence_ref": "docs/verification/t1356/candidate-attempt05/artifacts/t1356-collected-metrics-T1-00e84-d采集经真实Next与首页同scope、日期与累计语义-t1356-normal/witness.json#late-original-a-cannot-replace-b"
    },
    {
      "id": "error_and_other_cards",
      "test_id": "t1356-local-error",
      "result": "pass",
      "evidence_ref": "docs/verification/t1356/candidate-attempt05/artifacts/t1356-collected-metrics-T1-00e84-d采集经真实Next与首页同scope、日期与累计语义-t1356-normal/witness.json#completed-readonly-source-counts"
    },
    {
      "id": "filters_and_navigation",
      "test_id": "t1356-filters",
      "result": "pass",
      "evidence_ref": "docs/verification/t1356/candidate-attempt05/artifacts/t1356-collected-metrics-T1-00e84-d采集经真实Next与首页同scope、日期与累计语义-t1356-normal/witness.json#native-chrome-200-real-filter"
    },
    {
      "id": "responsive_caption",
      "test_id": "t1356-responsive",
      "result": "pass",
      "evidence_ref": "docs/verification/t1356/candidate-attempt05/artifacts/t1356-collected-metrics-T1-00e84-d采集经真实Next与首页同scope、日期与累计语义-t1356-normal/witness.json#native-chrome-200-real-filter"
    }
  ],
  "coverage": [
    {
      "condition": "back",
      "result": "pass",
      "evidence_ref": "docs/verification/t1356/candidate-attempt05/artifacts/t1356-collected-metrics-T1-00e84-d采集经真实Next与首页同scope、日期与累计语义-t1356-normal/witness.json#account-filter-real-back-refresh"
    },
    {
      "condition": "refresh",
      "result": "pass",
      "evidence_ref": "docs/verification/t1356/candidate-attempt05/artifacts/t1356-collected-metrics-T1-00e84-d采集经真实Next与首页同scope、日期与累计语义-t1356-normal/witness.json#same-scope-sql-restored-123"
    },
    {
      "condition": "repeat",
      "result": "pass",
      "evidence_ref": "docs/verification/t1356/candidate-attempt05/artifacts/t1356-collected-metrics-T1-00e84-d采集经真实Next与首页同scope、日期与累计语义-t1356-normal/witness.json#late-original-a-cannot-replace-b"
    },
    {
      "condition": "keyboard",
      "result": "pass",
      "evidence_ref": "docs/verification/t1356/candidate-attempt05/artifacts/t1356-collected-metrics-T1-00e84-d采集经真实Next与首页同scope、日期与累计语义-t1356-normal/witness.json#native-chrome-200-real-filter"
    },
    {
      "condition": "empty",
      "result": "pass",
      "evidence_ref": "docs/verification/t1356/candidate-attempt05/artifacts/t1356-collected-metrics-T1-00e84-d采集经真实Next与首页同scope、日期与累计语义-t1356-normal/witness.json#ks-outside-publication-window"
    },
    {
      "condition": "error",
      "result": "pass",
      "evidence_ref": "docs/verification/t1356/candidate-attempt05/artifacts/t1356-collected-metrics-T1-00e84-d采集经真实Next与首页同scope、日期与累计语义-t1356-normal/witness.json#real-summary-sql-failure-retains-legacy-and-six-cards"
    },
    {
      "condition": "loading",
      "result": "pass",
      "evidence_ref": "docs/verification/t1356/candidate-attempt05/artifacts/t1356-collected-metrics-T1-00e84-d采集经真实Next与首页同scope、日期与累计语义-t1356-normal/witness.json#group-switch-pending-old-scope-hidden"
    },
    {
      "condition": "zoom",
      "result": "pass",
      "evidence_ref": "docs/verification/t1356/candidate-attempt05/artifacts/t1356-collected-metrics-T1-00e84-d采集经真实Next与首页同scope、日期与累计语义-t1356-normal/witness.json#native-chrome-200-real-filter"
    }
  ],
  "visible_copy": {
    "artifact_path": "docs/verification/t1356/control/VISIBLE_COPY.json",
    "artifact_sha256": "560c89332f4eddd812306ac32d92b2ae358d5787cdf626492edeadf71b1fd9e5"
  },
  "tdd_red_ref": "docs/verification/t1356/backend/public-red-attempt01.log",
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
