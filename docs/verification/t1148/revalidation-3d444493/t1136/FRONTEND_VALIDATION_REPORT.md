# T1136 最终源码当前补验

本次原allowlist真实Chrome三例实际76.411901秒exit0，HEAD 3d4444934a618542747dd9839a299c6d769adad1，原source before/after一致。所有fixture声明保留，成功保存和公开回读实际执行；原SOURCE/报告/事件不改。全量canonical实际40ERROR/exit1，LED052另原公共59PASS，不拼接全绿。源码Chrome不代签原生App、真人扫码/发布或用户体验；根实际查看本次原图后另记，正式taskctl随后实跑。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1136",
  "contract_path": "docs/features/t1136-calendar-dialog-current-integration.md",
  "contract_sha": "4e772799e2fb",
  "commit_sha": "3d4444934a618542747dd9839a299c6d769adad1",
  "observed_at": "2026-10-09T21:12:10.153Z",
  "run": {
    "verify_key": "calendar-dialog-layout:e2e",
    "command": "node docs/verification/t1136/run-layout-journey.mjs",
    "exit_code": 0,
    "output_ref": "docs/verification/t1148/revalidation-3d444493/t1136/journey-readable.log.gz"
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
        "id": "sha256:80a500408c5fc7aaa6b74353d24cd31139f8e92423f8acb129e60be0937ef715",
        "role": "正式计划保存/list回读、刷新/返回、空目标及转组重选；一次409与加载暂缓明确为状态夹具。"
      },
      {
        "id": "sha256:ee29cb7c0d76f09b7e667f97236724eb107a34b10f5221313c564ab998ca82c8",
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
      "evidence_ref": "docs/verification/t1148/revalidation-3d444493/t1136/ROOT_VISUAL_CHECK.json"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1148/revalidation-3d444493/t1136/current-journey.json"
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
      "evidence_ref": "docs/verification/t1148/revalidation-3d444493/t1136/current-journey.json"
    },
    {
      "id": "AC-WRITE-READ",
      "test_id": "TEST-T1136-PUBLIC",
      "result": "pass",
      "evidence_ref": "docs/verification/t1148/revalidation-3d444493/t1136/current-journey.json"
    },
    {
      "id": "AC-TARGET",
      "test_id": "TEST-T1136-PUBLIC",
      "result": "pass",
      "evidence_ref": "docs/verification/t1148/revalidation-3d444493/t1136/current-journey.json"
    },
    {
      "id": "AC-SHARED",
      "test_id": "TEST-T1136-SHARED",
      "result": "pass",
      "evidence_ref": "docs/verification/t1148/revalidation-3d444493/t1136/current-journey.json"
    }
  ],
  "coverage": [
    {
      "condition": "refresh",
      "result": "pass",
      "evidence_ref": "docs/verification/t1148/revalidation-3d444493/t1136/public-write-read-observation.json"
    },
    {
      "condition": "repeat",
      "result": "pass",
      "evidence_ref": "docs/verification/t1148/revalidation-3d444493/t1136/public-write-read-observation.json"
    },
    {
      "condition": "back",
      "result": "pass",
      "evidence_ref": "docs/verification/t1148/revalidation-3d444493/t1136/public-write-read-observation.json"
    }
  ],
  "visible_copy": {
    "artifact_path": "docs/verification/t1148/revalidation-3d444493/t1136/visible-copy.json",
    "artifact_sha256": "f087ce26325218437f96b57275d7d3cf0d9c3a9723b7c9932bdc38d616a8a08b"
  },
  "tdd_red_ref": "docs/verification/t1136/baseline-journey.json及baseline/原图：原字节焦点实际失败；不称四视口几何RED。T1138/T1139分别保测试定位/即时尺寸失败，当前有限观察不删原边界。",
  "open_defects": [],
  "status": "pass"
}
```
