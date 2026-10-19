# T-1276 frontend-validation 报告草案

未执行。contract_sha只是当前合同全文的真实SHA前12位；commit_sha/observed_at/exit_code/output_ref/visible_copy保留空值。verify_key与command是拟登记项，当前未写全局allowlist。该草案应被strict验证器拒绝，不能交taskctl complete。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1276",
  "contract_path": "docs/verification/t1274/closure/t1276-journey-contract.md",
  "contract_sha": "2f1a5aa75bfb",
  "commit_sha": null,
  "observed_at": null,
  "run": {
    "verify_key": "t1276:closure-readonly",
    "command": "node docs/verification/t1274/closure/fresh-readonly.cjs T-1276",
    "exit_code": null,
    "output_ref": null
  },
  "environment": {
    "surface": "browser",
    "runtime": null,
    "viewports": [
      {
        "width": 1366,
        "height": 900,
        "result": "unknown"
      },
      {
        "width": 390,
        "height": 844,
        "result": "unknown"
      }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      {
        "id": "output-5e3e4e95-261",
        "role": "真实模型重排复制后的独立作品"
      },
      {
        "id": "output-8a2fadb0-19",
        "role": "只读原作品及既有成片来源"
      }
    ]
  },
  "levels": {
    "logic": {
      "status": "unknown",
      "evidence_ref": "docs/verification/t1276/RESULT.md"
    },
    "surface": {
      "status": "unknown",
      "evidence_ref": "docs/verification/t1276/RESULT.md"
    },
    "journey": {
      "status": "unknown",
      "evidence_ref": "docs/verification/t1276/RESULT.md"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "docs/verification/t1274/CLOSURE_AUDIT.md"
    }
  },
  "checks": [
    {
      "id": "AC-1276-01",
      "test_id": "CLOSURE-T1276-AC01",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1276/RESULT.md",
      "historical_evidence_refs": [
        "docs/verification/t1276/RESULT.md",
        "docs/verification/t1276/original-source-probe-readback.json",
        "docs/verification/t1276/public-source-preference-freeze.txt",
        "docs/verification/t1276/public-source-group.receipt.json"
      ]
    },
    {
      "id": "AC-1276-02",
      "test_id": "CLOSURE-T1276-AC02",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1276/RESULT.md",
      "historical_evidence_refs": [
        "docs/verification/t1276/RESULT.md",
        "docs/verification/t1276/original-source-probe-readback.json",
        "docs/verification/t1276/public-source-preference-freeze.txt",
        "docs/verification/t1276/public-source-group.receipt.json"
      ]
    },
    {
      "id": "AC-1276-03",
      "test_id": "CLOSURE-T1276-AC03",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1276/RESULT.md",
      "historical_evidence_refs": [
        "docs/verification/t1276/RESULT.md",
        "docs/verification/t1276/original-source-probe-readback.json",
        "docs/verification/t1276/public-source-preference-freeze.txt",
        "docs/verification/t1276/public-source-group.receipt.json"
      ]
    },
    {
      "id": "AC-1276-04",
      "test_id": "CLOSURE-T1276-AC04",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1276/RESULT.md",
      "historical_evidence_refs": [
        "docs/verification/t1276/RESULT.md",
        "docs/verification/t1276/original-source-probe-readback.json",
        "docs/verification/t1276/public-source-preference-freeze.txt",
        "docs/verification/t1276/public-source-group.receipt.json"
      ]
    }
  ],
  "coverage": [
    {
      "condition": "original-request-recovery",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/closure/PLAN.md"
    },
    {
      "condition": "probe-sha",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/closure/PLAN.md"
    },
    {
      "condition": "source-adoption",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/closure/PLAN.md"
    },
    {
      "condition": "same-business-receipt",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/closure/PLAN.md"
    },
    {
      "condition": "wrong-group",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/closure/PLAN.md"
    },
    {
      "condition": "preference-freeze",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/closure/PLAN.md"
    },
    {
      "condition": "desktop",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/closure/PLAN.md"
    },
    {
      "condition": "narrow",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/closure/PLAN.md"
    }
  ],
  "tdd_red_ref": "docs/verification/t1275/e2e-after-release.txt",
  "visible_copy": null,
  "open_defects": [
    "watched_paths含共享dirty；新鲜只读回执尚未执行。原临时根消失，旧原ID恢复只引用当时实际证据，不能伪称当前重演。"
  ],
  "status": "incomplete",
  "verification_scope": "草稿：尚未运行；将新鲜只读观察与历史已发生子证据分开映射，不能自动把历史模型/ASR/故障覆盖绑定为当前HEAD重演。",
  "global_limitations": [
    "全局reconcile29ERROR保留T1204归属，未签全局PASS。",
    "未替换已安装App或发布。"
  ]
}
```
