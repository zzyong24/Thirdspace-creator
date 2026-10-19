# T-1361 冻结候选前瞻验收

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1361",
  "contract_path": "docs/verification/t1361/control/PAGE_SPEC.md",
  "contract_sha": "0a7c3ba7cb43",
  "commit_sha": "721dfacf7b3bcbe82eb9c39b61acf1fb1df367d2",
  "observed_at": "2026-10-18T20:55:51.140Z",
  "execution_source": {
    "commit_sha": "721dfacf7b3bcbe82eb9c39b61acf1fb1df367d2",
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
        "path": "frontend/src/components/shell/workspace-initialization.tsx",
        "execution_sha256": "8faac4038fb82d5ddcf172e05d36cf7c47c1b11cf7817806620ba31076451db0",
        "target_sha256": "8faac4038fb82d5ddcf172e05d36cf7c47c1b11cf7817806620ba31076451db0",
        "equal": true
      },
      {
        "path": "frontend/src/components/shell/workspace-initialization.test.tsx",
        "execution_sha256": "2ed3f2eb1d5f7144287e4a92f3d9accf9a0ef6f8e424ddcc48179bd7bfd2e62b",
        "target_sha256": "2ed3f2eb1d5f7144287e4a92f3d9accf9a0ef6f8e424ddcc48179bd7bfd2e62b",
        "equal": true
      },
      {
        "path": "frontend/tests/e2e/t1361-pending-filter-workspace-refresh.spec.ts",
        "execution_sha256": "fe5e96ed491b1bfb2047d6d85ea0c61d1a3316866f57b0e57d772dbec9d3503d",
        "target_sha256": "fe5e96ed491b1bfb2047d6d85ea0c61d1a3316866f57b0e57d772dbec9d3503d",
        "equal": true
      },
      {
        "path": "frontend/playwright.t1361.config.ts",
        "execution_sha256": "d802b91b9a87d1ff6c9f94d9bc4af600dd622db269f6a08da3eb23d6fa2df3c2",
        "target_sha256": "d802b91b9a87d1ff6c9f94d9bc4af600dd622db269f6a08da3eb23d6fa2df3c2",
        "equal": true
      }
    ],
    "boundary": "真实历史输出保原执行ref；当前HEAD为strict目标。逐路径SHA与必要显式消费者映射保留整文件失配事实；新增入口/总览由T1362当前正式链补验，随后taskctl仍执行当前候选wrapper。"
  },
  "run": {
    "verify_key": "t1361-pending-navigation:e2e",
    "command": "node docs/verification/t1355/control/run-frozen-ui.mjs T-1361",
    "exit_code": 0,
    "output_ref": "docs/verification/t1361/candidate-final-attempt05/SAFE_SUMMARY.json"
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
        "id": "isolated-persistent-t1361-1",
        "role": "真实私有数据库同ID读回与页面见证",
        "evidence_ref": "docs/verification/t1361/candidate-final-attempt05/artifacts/t1361-pending-filter-works-cdfaf-sh-待完成筛选与切组使用真实Next收尾并排除旧响应-t1361-minimum/witness.json"
      },
      {
        "id": "isolated-persistent-t1361-2",
        "role": "真实私有数据库同ID读回与页面见证",
        "evidence_ref": "docs/verification/t1361/candidate-final-attempt05/artifacts/t1361-pending-filter-works-cdfaf-sh-待完成筛选与切组使用真实Next收尾并排除旧响应-t1361-normal/witness.json"
      }
    ],
    "boundary": "代表性事实通过真实服务持久化；无DTO成功替身。平台身份或目录输入为明确合成事实，非真人扫码、非新平台采集。"
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1361/workspace-analysis/IMPLEMENTATION_RESULT.md"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1361/visual-final-source-mapping/REPORT.md"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1361/candidate-final-attempt05/SAFE_SUMMARY.json"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "独立像素复核和执行者过程证据，不冒用户亲手验收"
    }
  },
  "checks": [
    {
      "id": "latest_group_after_old_terminal",
      "test_id": "t1361-real-next-final-scope",
      "result": "pass",
      "evidence_ref": "docs/verification/t1361/candidate-final-attempt05/artifacts/t1361-pending-filter-works-cdfaf-sh-待完成筛选与切组使用真实Next收尾并排除旧响应-t1361-normal/witness.json#rapid-a-b-final"
    },
    {
      "id": "single_navigation_owner",
      "test_id": "t1361-navigation-owner",
      "result": "pass",
      "evidence_ref": "docs/verification/t1361/candidate-final-attempt05/artifacts/t1361-pending-filter-works-cdfaf-sh-待完成筛选与切组使用真实Next收尾并排除旧响应-t1361-normal/witness.json#already-committed-filter-switch"
    },
    {
      "id": "old_scope_hidden_and_exclusive",
      "test_id": "t1361-old-scope-exclusion",
      "result": "pass",
      "evidence_ref": "docs/verification/t1361/candidate-final-attempt05/artifacts/t1361-pending-filter-works-cdfaf-sh-待完成筛选与切组使用真实Next收尾并排除旧响应-t1361-normal/witness.json#same-clean-url-b-final-after-old-a"
    },
    {
      "id": "public_reentry_and_same_scope",
      "test_id": "t1361-real-reentry",
      "result": "pass",
      "evidence_ref": "docs/verification/t1361/candidate-final-attempt05/artifacts/t1361-pending-filter-works-cdfaf-sh-待完成筛选与切组使用真实Next收尾并排除旧响应-t1361-normal/witness.json#readonly-counts-unchanged"
    }
  ],
  "coverage": [
    {
      "condition": "loading",
      "result": "pass",
      "evidence_ref": "docs/verification/t1361/candidate-final-attempt05/artifacts/t1361-pending-filter-works-cdfaf-sh-待完成筛选与切组使用真实Next收尾并排除旧响应-t1361-normal/witness.json#same-clean-url-b-pending"
    },
    {
      "condition": "repeat",
      "result": "pass",
      "evidence_ref": "docs/verification/t1361/candidate-final-attempt05/artifacts/t1361-pending-filter-works-cdfaf-sh-待完成筛选与切组使用真实Next收尾并排除旧响应-t1361-normal/witness.json#same-group-selection"
    },
    {
      "condition": "keyboard",
      "result": "pass",
      "evidence_ref": "docs/verification/t1361/candidate-final-attempt05/artifacts/t1361-pending-filter-works-cdfaf-sh-待完成筛选与切组使用真实Next收尾并排除旧响应-t1361-normal/witness.json#same-group-selection"
    },
    {
      "condition": "back",
      "result": "pass",
      "evidence_ref": "docs/verification/t1361/candidate-final-attempt05/artifacts/t1361-pending-filter-works-cdfaf-sh-待完成筛选与切组使用真实Next收尾并排除旧响应-t1361-normal/witness.json#actual-back-and-refresh"
    },
    {
      "condition": "refresh",
      "result": "pass",
      "evidence_ref": "docs/verification/t1361/candidate-final-attempt05/artifacts/t1361-pending-filter-works-cdfaf-sh-待完成筛选与切组使用真实Next收尾并排除旧响应-t1361-normal/witness.json#actual-back-and-refresh"
    },
    {
      "condition": "empty",
      "result": "pass",
      "evidence_ref": "docs/verification/t1361/candidate-final-attempt05/artifacts/t1361-pending-filter-works-cdfaf-sh-待完成筛选与切组使用真实Next收尾并排除旧响应-t1361-normal/witness.json#empty-group-real-entry"
    }
  ],
  "visible_copy": {
    "artifact_path": "docs/verification/t1361/control/VISIBLE_COPY.json",
    "artifact_sha256": "6bd78c9da5e6bc108d71f1444b0b8d1cbd631451afdb51594d6abb9e8578da92"
  },
  "tdd_red_ref": "docs/verification/t1361/workspace-analysis/diagnostic01/SAFE_SUMMARY.json",
  "open_defects": [],
  "status": "pass",
  "scope_notes": [
    "历史执行ref、当前strict目标与visual报告中的原像素ref分别保留，不将旧run重命名为当前执行；当前新增作品入口/总览见T1362正式04与独立图审。",
    "原公众号1726首因UNKNOWN；受控导航恢复不代签真人微信扫码。",
    "视频号原REPORT_LINK_MISSING未定位菜单，未重发；首页已知缺消费者修复不冒所有平台采集恢复。",
    "200%全局充值入口轻度遮按钮空白区，Root认定非本任务阻断，未改全局计费入口。",
    "当前安装App仍3b，未将本源验收写为已安装。",
    "最终721全局reconcile自然44ERROR/0WARN，32+7+2+3分层，新增切组宽收据失配登记T1360；当前报告不签全局通过。证据：docs/verification/t1362/control/RECONCILE_FINAL_SCOPE_CLASSIFICATION.json。",
    "minimum原NB-01组名tooltip局部压第一指标数值，当前四帧独审保留，不称全部数值可见或全页无遮挡；最终业务真实值由同ID读回与断言分证。"
  ]
}
```
