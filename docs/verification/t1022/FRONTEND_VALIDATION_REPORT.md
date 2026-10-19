# T-1022 正式浏览器验证

2026-10-05。下列浏览器执行通过，只覆盖已声明的账号组管理、共享项目与切组隔离旅程。运行在8788隔离服务，使用页面真实创建的代表性组/项目；没有写SQL代替保存，没有扫码登录或外部发布。

18个可见文案检查点覆盖1366×900与1024×768。每个窗口都实际制造公开服务版本冲突，保留输入；组名通过页面保存后reload读取并恢复原名；从主组项目进入副组时旧详情显示明确空态；返回与刷新仍只见副项目；无账号组可直接打开项目弹层，Esc关闭并返回焦点；平台筛选保留组创作项目。

证据结构校验 `validate` 已通过8项postconditions；追加 `--execute` 才检查当前提交绑定，其实际退出1。

**正式 receipt 尚未通过**：实现与旅程文件仍在混合工作树，HEAD没有承载当前代码，watched_paths不能绑定。任务已通过taskctl登记验收阻塞，仍待验；不缩小监视路径、不把手动浏览器运行写成已提交代码的PASS。数值图样本另有受控chart-fixture，不计入此non-fixture旅程。真实平台采集/发布、安装版和原生200%仍无完成证据。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1022",
  "commit_sha": "ebd63d9891d162b1bd8bf518bc1b9f573fa9146f",
  "contract_sha": "d0cb8a19e96b",
  "observed_at": "2026-10-04T18:52:33.301Z",
  "run": {
    "verify_key": "account-group-workspace:e2e",
    "command": "node docs/verification/t1022/run-journey.mjs",
    "exit_code": 0,
    "output_ref": "docs/verification/t1022/logs/journey-final-runtime.log"
  },
  "environment": {
    "surface": "browser",
    "runtime": "Ego Chromium + Next.js，隔离本地服务8788",
    "viewports": [
      {
        "width": 1366,
        "height": 900,
        "result": "pass"
      },
      {
        "width": 1024,
        "height": 768,
        "result": "pass"
      }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      {
        "id": "grp-8d773d5d-39",
        "role": "source-workspace"
      },
      {
        "id": "grp-d7b00638-247",
        "role": "other-workspace"
      },
      {
        "id": "project-d7b00638-13",
        "role": "created-project"
      }
    ]
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1022/logs/collapsed-and-event-green.log"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1022/visible-copy-current.json"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1022/logs/journey-final-runtime.log"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "docs/verification/t1022/visual-review-current.md；独立视觉检查已完成，生产版用户体验确认尚未发生，不用测试冒充"
    }
  },
  "checks": [
    {
      "id": "collection",
      "test_id": "group-control-project-collection",
      "result": "pass",
      "evidence_ref": "docs/verification/t1022/visible-copy-current.json"
    },
    {
      "id": "selection",
      "test_id": "selected-project-visible-or-empty",
      "result": "pass",
      "evidence_ref": "docs/verification/t1022/visible-copy-current.json"
    },
    {
      "id": "detail",
      "test_id": "project-detail-current-group-or-empty",
      "result": "pass",
      "evidence_ref": "docs/verification/t1022/visible-copy-current.json"
    },
    {
      "id": "ownership",
      "test_id": "switch-group-old-detail-denied",
      "result": "pass",
      "evidence_ref": "docs/verification/t1022/visible-copy-current.json"
    },
    {
      "id": "empty",
      "test_id": "zero-account-create-modal-focus",
      "result": "pass",
      "evidence_ref": "docs/verification/t1022/visible-copy-current.json"
    },
    {
      "id": "write-read",
      "test_id": "group-rename-save-reload",
      "result": "pass",
      "evidence_ref": "docs/verification/t1022/visible-copy-current.json"
    },
    {
      "id": "conflict",
      "test_id": "real-version-conflict-keeps-input",
      "result": "pass",
      "evidence_ref": "docs/verification/t1022/visible-copy-current.json"
    },
    {
      "id": "shared-context",
      "test_id": "platform-filter-keeps-creation-context",
      "result": "pass",
      "evidence_ref": "docs/verification/t1022/visible-copy-current.json"
    }
  ],
  "coverage": [
    {
      "condition": "empty",
      "result": "pass",
      "evidence_ref": "docs/verification/t1022/visible-copy-current.json"
    },
    {
      "condition": "error",
      "result": "pass",
      "evidence_ref": "docs/verification/t1022/visible-copy-current.json"
    },
    {
      "condition": "back",
      "result": "pass",
      "evidence_ref": "docs/verification/t1022/visible-copy-current.json"
    },
    {
      "condition": "refresh",
      "result": "pass",
      "evidence_ref": "docs/verification/t1022/visible-copy-current.json"
    },
    {
      "condition": "repeat",
      "result": "pass",
      "evidence_ref": "docs/verification/t1022/visible-copy-current.json"
    }
  ],
  "tdd_red_ref": "docs/verification/t1022/logs/journey-current-red.log",
  "open_defects": [],
  "visible_copy": {
    "artifact_path": "docs/verification/t1022/visible-copy-current.json",
    "artifact_sha256": "5efa76e23f1e074e2986302f637e0240e6f714a872f1c62fd3be0dea449c2403"
  },
  "contract_path": "docs/features/t1022-account-group-workspace/PAGE_SPEC.md",
  "status": "pass"
}
```
