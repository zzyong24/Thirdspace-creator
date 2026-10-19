# T1140 当前源码重新验证

T1148已正式失效旧验收。本次实际原allowlist Chrome 77.946326秒exit0、0retry，当前HEAD aa7de1e91183ec0236a82cd954a4f4bf9bb1aeb1，受测源码前后完全一致；根实际看图14张，限定本合同操作。旧已接受报告与其可见文案保留原字节，本报告使用本次独立目录，不改旧head。

全局上一轮42项失败及27处静态超时债务仍保留，完整新canonical与安装版尚待验证；T1144原清理超时与T1155连接中断根因UNKNOWN。正常退出不代签已修。模拟错误响应完整声明；真实成功写回未替换。此为当前源码正式补验候选，taskctl真实执行后才恢复验收；不签模型、扫码、原生App或用户人工体验。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1140",
  "contract_path": "docs/verification/t1140/PAGE_SPEC.md",
  "contract_sha": "813ecf7f4121",
  "commit_sha": "aa7de1e91183ec0236a82cd954a4f4bf9bb1aeb1",
  "observed_at": "2026-10-09T19:16:49.066Z",
  "run": {
    "verify_key": "picker-low-height:e2e",
    "command": "node docs/verification/t1140/run-picker-journey.mjs",
    "exit_code": 0,
    "output_ref": "docs/verification/t1148/revalidation-aa7de1e9/t1140/journey-readable.log"
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
        "width": 1024,
        "height": 680,
        "result": "pass"
      },
      {
        "width": 683,
        "height": 450,
        "result": "pass"
      },
      {
        "width": 390,
        "height": 900,
        "result": "pass"
      },
      {
        "width": 390,
        "height": 450,
        "result": "pass"
      },
      {
        "width": 512,
        "height": 340,
        "result": "pass"
      }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      {
        "id": "sha256:ff8868dd8cd1f434ebb8363e9dc8062120ed3272c3fafa8ee0c0587518917513",
        "role": "正式上传内置横竖示意图、新建中性组/画布、精确文件保存/get/reload/back；一次搜索503明确为错误夹具。"
      },
      {
        "id": "sha256:e95e48cd20796f6ea746137fa21988577c9c878b8e4f40a3cde6ebb465d31d8d",
        "role": "六窗口原边界/取消/正文滚动观察；非用户库或原生屏幕测试。"
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
      "evidence_ref": "docs/verification/t1148/revalidation-aa7de1e9/t1140/ROOT_VISUAL_CHECK.json"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1148/revalidation-aa7de1e9/t1140/current-journey.json"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "当前仅源码真实Chrome，未取得当前新安装包用户人工验收"
    }
  },
  "checks": [
    {
      "id": "AC-LAYOUT",
      "test_id": "TEST-T1140-LAYOUT",
      "result": "pass",
      "evidence_ref": "docs/verification/t1148/revalidation-aa7de1e9/t1140/current-journey.json"
    },
    {
      "id": "AC-CANCEL",
      "test_id": "TEST-T1140-LAYOUT",
      "result": "pass",
      "evidence_ref": "docs/verification/t1148/revalidation-aa7de1e9/t1140/current-journey.json"
    },
    {
      "id": "AC-EXACT",
      "test_id": "TEST-T1140-PUBLIC",
      "result": "pass",
      "evidence_ref": "docs/verification/t1148/revalidation-aa7de1e9/t1140/current-journey.json"
    },
    {
      "id": "AC-SHARED",
      "test_id": "TEST-T1140-PUBLIC",
      "result": "pass",
      "evidence_ref": "docs/verification/t1148/revalidation-aa7de1e9/t1140/current-journey.json"
    },
    {
      "id": "AC-STATES",
      "test_id": "TEST-T1140-PUBLIC",
      "result": "pass",
      "evidence_ref": "docs/verification/t1148/revalidation-aa7de1e9/t1140/current-journey.json"
    }
  ],
  "coverage": [
    {
      "condition": "refresh",
      "result": "pass",
      "evidence_ref": "docs/verification/t1148/revalidation-aa7de1e9/t1140/public-write-read-observation.json"
    },
    {
      "condition": "repeat",
      "result": "pass",
      "evidence_ref": "docs/verification/t1148/revalidation-aa7de1e9/t1140/public-write-read-observation.json"
    },
    {
      "condition": "back",
      "result": "pass",
      "evidence_ref": "docs/verification/t1148/revalidation-aa7de1e9/t1140/public-write-read-observation.json"
    }
  ],
  "visible_copy": {
    "artifact_path": "docs/verification/t1148/revalidation-aa7de1e9/t1140/visible-copy.json",
    "artifact_sha256": "ac60d36084d431b9af96a021600a1ba7bdd8ed65cc09af37fd7413f906aaa9ed"
  },
  "tdd_red_ref": "docs/verification/t1136/screenshots/shared-asset-picker-683.png实际低高度主体空间问题及T1145原重叠截图；实际外层裁切原失败见docs/verification/t1145。T1142/43/46/47是测试观察校准，原失败保留，不冒作产品RED。",
  "open_defects": [],
  "status": "pass"
}
```
