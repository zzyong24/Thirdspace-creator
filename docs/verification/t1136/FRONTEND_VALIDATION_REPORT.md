# T1136 当前前端验收报告

当前main 393ce00a 的三条真实Chrome旅程82.565秒exit0、0retry；四视口排期边界与回焦、公共保存/list回读、reload/返回、转组重选、空目标、一次失败保留输入，以及反馈/参考选择器操作通过。共享素材取消正式回读document和revision均完全相同；左右预览图实际已加载。只有一次409失败和一次暂缓原读取是显式状态夹具，成功写回未替换。原审核/诊断实际时间顺序、失败及来源SHA保留。

本报告只签T1136两处产品改动与所列操作范围。既有低高度素材主体预览空间问题已登记T1140；原27静态超时欠债完整相同，当前公共消费者实际PASS但组合exit1。独立最终实施复核、完整全局回归、taskctl正式再执行仍未完成；不签模型/真实扫码/平台发布、安装或全功能全部可用。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1136",
  "contract_path": "docs/features/t1136-calendar-dialog-current-integration.md",
  "contract_sha": "4e772799e2fb",
  "commit_sha": "393ce00a0e03db4f80bdfda3102b0c990b93bf82",
  "observed_at": "2026-10-09T16:08:05.828Z",
  "run": {
    "verify_key": "calendar-dialog-layout:e2e",
    "command": "node docs/verification/t1136/run-layout-journey.mjs",
    "exit_code": 0,
    "output_ref": "docs/verification/t1136/current-journey.log"
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
        "id": "sha256:c9ea27f9a2fec37fbf47538ee3e37139f9df212eef83affbf3b9a4c686c4e458",
        "role": "代表性长名组/账号/项目经真实正式dispatch创建并保存同一计划、list回读/刷新/目标转组；不连接实际社交平台"
      },
      {
        "id": "sha256:8b621b79bbc8926aabe563decec51200d42a61965988c868582eaf77c935fbc5",
        "role": "正式上传静态预览图并在真实画布参考选择器浏览；完整document与revision取消前后一致，无模型调用"
      }
    ]
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1136/focused-ui.json；calendar-backend.json；led047.json"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1136/ROOT_VISUAL_CHECK.json；仅本轮两处修复与共享边界操作，既有低高度预览优化另登记T1140"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1136/current-journey.json"
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
      "evidence_ref": "docs/verification/t1136/current-journey.json"
    },
    {
      "id": "AC-WRITE-READ",
      "test_id": "TEST-T1136-PUBLIC",
      "result": "pass",
      "evidence_ref": "docs/verification/t1136/current-journey.json"
    },
    {
      "id": "AC-TARGET",
      "test_id": "TEST-T1136-PUBLIC",
      "result": "pass",
      "evidence_ref": "docs/verification/t1136/current-journey.json"
    },
    {
      "id": "AC-SHARED",
      "test_id": "TEST-T1136-SHARED",
      "result": "pass",
      "evidence_ref": "docs/verification/t1136/current-journey.json"
    }
  ],
  "coverage": [
    {
      "condition": "refresh",
      "result": "pass",
      "evidence_ref": "docs/verification/t1136/public-write-read-observation.json"
    },
    {
      "condition": "repeat",
      "result": "pass",
      "evidence_ref": "docs/verification/t1136/public-write-read-observation.json"
    },
    {
      "condition": "back",
      "result": "pass",
      "evidence_ref": "docs/verification/t1136/public-write-read-observation.json"
    }
  ],
  "visible_copy": {
    "artifact_path": "docs/verification/t1136/visible-copy.json",
    "artifact_sha256": "a3fb8e72553ee8848a6966c0d2befa9f0dc791dbec7255e6f195f33c98f07efc"
  },
  "tdd_red_ref": "docs/verification/t1136/baseline-journey.json及baseline/原图：原字节焦点实际失败；不称四视口几何RED。T1138/T1139分别保测试定位/即时尺寸失败，当前有限观察不删原边界。",
  "open_defects": [],
  "status": "pass"
}
```
