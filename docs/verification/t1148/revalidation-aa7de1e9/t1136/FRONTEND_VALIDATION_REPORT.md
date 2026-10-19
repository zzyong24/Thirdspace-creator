# T1136 当前源码重新验证

T1148已正式失效旧验收。本次实际原allowlist Chrome 79.921885秒exit0、0retry，当前HEAD aa7de1e91183ec0236a82cd954a4f4bf9bb1aeb1，受测源码前后完全一致；根实际看图12张，限定本合同操作。旧已接受报告与其可见文案保留原字节，本报告使用本次独立目录，不改旧head。

全局上一轮42项失败及27处静态超时债务仍保留，完整新canonical与安装版尚待验证；T1144原清理超时与T1155连接中断根因UNKNOWN。正常退出不代签已修。模拟错误响应完整声明；真实成功写回未替换。此为当前源码正式补验候选，taskctl真实执行后才恢复验收；不签模型、扫码、原生App或用户人工体验。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1136",
  "contract_path": "docs/features/t1136-calendar-dialog-current-integration.md",
  "contract_sha": "4e772799e2fb",
  "commit_sha": "aa7de1e91183ec0236a82cd954a4f4bf9bb1aeb1",
  "observed_at": "2026-10-09T19:12:53.407Z",
  "run": {
    "verify_key": "calendar-dialog-layout:e2e",
    "command": "node docs/verification/t1136/run-layout-journey.mjs",
    "exit_code": 0,
    "output_ref": "docs/verification/t1148/revalidation-aa7de1e9/t1136/journey-readable.log"
  },
  "environment": {
    "surface": "browser",
    "runtime": "macOS / 当前本机Google Chrome channel=chrome，fresh PGlite与auth隔离；非原生App",
    "viewports": [
      {
        "width": 1366,
        "height": 900,
        "result": "pass"
      },
      {
        "width": 900,
        "height": 900,
        "result": "pass"
      },
      {
        "width": 390,
        "height": 900,
        "result": "pass"
      },
      {
        "width": 683,
        "height": 450,
        "result": "pass"
      }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      {
        "id": "sha256:bcb2afc9b5f235ff09102eb0b336d1e57a1ba20027da9e21c05e5f095e50de3f",
        "role": "正式计划保存/list回读、刷新/返回、空目标及转组重选；一次409与加载暂缓明确为状态夹具。"
      },
      {
        "id": "sha256:2ee2eafa619f55e403b729b7eafacc8d83c1930cedd75c7b6428962fa4a7d6d4",
        "role": "正式参考素材预览、取消完整文档和revision一致；共享反馈只本地操作，未发送。"
      }
    ]
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "T1149当前48组件、174 LED047、typecheck0；原本任务聚焦结果仅在产品字节未变部分复用，公共变化路径以下本轮真Chrome覆盖。"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1148/revalidation-aa7de1e9/t1136/ROOT_VISUAL_CHECK.json"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1148/revalidation-aa7de1e9/t1136/current-journey.json"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "本轮源码浏览器自动走查，未取得当前新安装包用户人工验收"
    }
  },
  "checks": [
    {
      "id": "AC-LAYOUT",
      "test_id": "TEST-T1136-LAYOUT",
      "result": "pass",
      "evidence_ref": "docs/verification/t1148/revalidation-aa7de1e9/t1136/current-journey.json"
    },
    {
      "id": "AC-WRITE-READ",
      "test_id": "TEST-T1136-PUBLIC",
      "result": "pass",
      "evidence_ref": "docs/verification/t1148/revalidation-aa7de1e9/t1136/current-journey.json"
    },
    {
      "id": "AC-TARGET",
      "test_id": "TEST-T1136-PUBLIC",
      "result": "pass",
      "evidence_ref": "docs/verification/t1148/revalidation-aa7de1e9/t1136/current-journey.json"
    },
    {
      "id": "AC-SHARED",
      "test_id": "TEST-T1136-SHARED",
      "result": "pass",
      "evidence_ref": "docs/verification/t1148/revalidation-aa7de1e9/t1136/current-journey.json"
    }
  ],
  "coverage": [
    {
      "condition": "refresh",
      "result": "pass",
      "evidence_ref": "docs/verification/t1148/revalidation-aa7de1e9/t1136/public-write-read-observation.json"
    },
    {
      "condition": "repeat",
      "result": "pass",
      "evidence_ref": "docs/verification/t1148/revalidation-aa7de1e9/t1136/public-write-read-observation.json"
    },
    {
      "condition": "back",
      "result": "pass",
      "evidence_ref": "docs/verification/t1148/revalidation-aa7de1e9/t1136/public-write-read-observation.json"
    }
  ],
  "visible_copy": {
    "artifact_path": "docs/verification/t1148/revalidation-aa7de1e9/t1136/visible-copy.json",
    "artifact_sha256": "08f6e88af4d85ff94504a93f40d9d74ca59781ac4a1b64b053f3521b09d74dd5"
  },
  "tdd_red_ref": "docs/verification/t1136/baseline-journey.json及baseline/原图：原字节焦点实际失败；不称四视口几何RED。T1138/T1139分别保测试定位/即时尺寸失败，当前有限观察不删原边界。",
  "open_defects": [],
  "status": "pass"
}
```
