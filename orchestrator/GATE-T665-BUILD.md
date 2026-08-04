# T-665 BUILD Gate：内容雷达信源彻底删除

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-665",
  "contract_path": "orchestrator/T665-FRONTEND-JOURNEY.md",
  "contract_sha": "163973c6ddb5",
  "commit_sha": "5fd4979031552f4cc91f59d6539b30d79a601e21",
  "observed_at": "2026-08-03T03:33:57.000Z",
  "run": {
    "verify_key": "recent-data-safety-fixed:e2e",
    "command": "node orchestrator/process/run-recent-data-safety-fixed.mjs",
    "exit_code": 0,
    "output_ref": "Node 24 / Chrome stable：2 passed；真实创建信源、确认删除、刷新消失旅程通过"
  },
  "environment": {
    "surface": "desktop-web",
    "runtime": "Google Chrome stable / Playwright 1.60 / Node 24.14",
    "viewports": [
      { "width": 1440, "height": 900, "result": "pass" },
      { "width": 1024, "height": 720, "result": "pass" }
    ]
  },
  "data": { "mode": "non-fixture", "witnesses": [{ "id": "created-web-source", "role": "real-radar-source" }] },
  "levels": {
    "logic": { "status": "pass", "evidence_ref": "后端事务回归覆盖独占、共享、已转选题和项目引用" },
    "surface": { "status": "pass", "evidence_ref": "删除确认与结果提示在两档窗口可见" },
    "journey": { "status": "pass", "evidence_ref": "真实创建来源 → 删除确认 → 来源消失" },
    "experience": { "status": "not-requested", "evidence_ref": "不冒充用户主观确认" }
  },
  "checks": [
    { "id": "AC-SOURCE-DELETE", "test_id": "E2E-SOURCE-DELETE-01", "result": "pass", "evidence_ref": "二次确认后 permanent 删除成功" },
    { "id": "AC-SOURCE-DISAPPEAR", "test_id": "E2E-SOURCE-DELETE-02", "result": "pass", "evidence_ref": "来源卡刷新后消失，提示真实独占内容计数" }
  ],
  "coverage": [
    { "condition": "created-source", "result": "pass", "evidence_ref": "经真实 operation 创建 web 来源", "reason": "" },
    { "condition": "confirmed-delete", "result": "pass", "evidence_ref": "确认框与危险动作真实可用", "reason": "" },
    { "condition": "refresh-disappear", "result": "pass", "evidence_ref": "router refresh 后来源卡不存在", "reason": "" },
    { "condition": "minimum-window", "result": "pass", "evidence_ref": "1024x720 结果提示仍可见", "reason": "" }
  ],
  "visible_copy": { "artifact_path": "orchestrator/evidence/T-665-visible-copy.json", "artifact_sha256": "195966370ce3ddcb95b1d1f7d0e3bbde346dc8a7980e8e912186a05a58cf1ede" },
  "tdd_red_ref": "旧操作只归档来源并保留历史内容；级联删除契约与回归先红后绿",
  "open_defects": [],
  "status": "pass"
}
```

后端事务额外验证：独占数据删除；共享作品保留；已确认选题与项目引用的快照、转换和作品保留但退出雷达列表；运行中来源拒绝删除。
