# T1140 当前主分支素材浏览验收报告

当前main efe9f1ce 的两条真实Chrome旅程79.003秒exit0、0retry，七条受测路径前后SHA一致。经正式上传、保存与回读，两件不同尺寸内置生成示意图片覆盖六窗口；不使用真实身份照片、用户库或模型。根实际查看14张本轮图，图库自然占位不重叠，field低高度完整预览、固定取消/确认、空/错误重读、精确文件选用和刷新/返回均通过。低高窄窗允许按同一正文滚动分别查看缩略图和预览，不声称每个滚动位置同时完整。

只签T1140素材布局与T1145共享图库的列明行为。完整canonical1093.915秒exit1/42ERROR，原39项保留，新增三条旧frontend记录源码漂移已登记T1148并独立核补验路径；27条原静态超时债务仍在，公共消费者实际PASS不代签全扫描。T1144历史成功流程退出超时根因UNKNOWN；本轮正常退出不冒作已定位原因。当前taskctl正式执行尚待本报告后实际发生；不签原生App、新安装、模型、扫码、平台发布或全功能全部可用。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1140",
  "contract_path": "docs/verification/t1140/PAGE_SPEC.md",
  "contract_sha": "813ecf7f4121",
  "commit_sha": "efe9f1ce8a9695354724aad2815cb96304108367",
  "observed_at": "2026-10-09T18:09:56.033Z",
  "run": {
    "verify_key": "picker-low-height:e2e",
    "command": "node docs/verification/t1140/run-picker-journey.mjs",
    "exit_code": 0,
    "output_ref": "docs/verification/t1140/current-journey.log"
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
        "id": "sha256:e48c1d95628b893fd7d3582947fbff5b2aab04e267fad1a40e1ad6f640b8b364",
        "role": "正式dispatch新建中性组/画布并上传内置竖横示意图，六窗口预览与取消正式document/revision均不变，无模型调用"
      },
      {
        "id": "sha256:18b0b0a18bb5ed7f7b9be9328a9d37788b48a7ae58b66d014d07cbde9f108673",
        "role": "另一个正式组/画布选择横图精确assetFileId，save/get后版本2→3、刷新/返回保原文件，六窗口gallery关闭不写；仅一次assets.search503显式读取夹具"
      }
    ]
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1140/final-media-canvas.json；LED047174PASS；T1141当前25service/27component及正式root生成输入回读，不代签模型"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1140/POSTCOMMIT_ROOT_VISUAL_CHECK.json；T1140_T1145_IMPLEMENTATION_REVIEW_INPUT.json；源SHA与独立审核相同，14张本轮原图实际查看"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1140/current-journey.json；postcommit-normal-browser.json"
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
      "evidence_ref": "docs/verification/t1140/layout-observation.json"
    },
    {
      "id": "AC-CANCEL",
      "test_id": "TEST-T1140-LAYOUT",
      "result": "pass",
      "evidence_ref": "docs/verification/t1140/layout-observation.json"
    },
    {
      "id": "AC-EXACT",
      "test_id": "TEST-T1140-PUBLIC",
      "result": "pass",
      "evidence_ref": "docs/verification/t1140/public-write-read-observation.json"
    },
    {
      "id": "AC-SHARED",
      "test_id": "TEST-T1140-PUBLIC",
      "result": "pass",
      "evidence_ref": "docs/verification/t1140/public-write-read-observation.json"
    },
    {
      "id": "AC-STATES",
      "test_id": "TEST-T1140-PUBLIC",
      "result": "pass",
      "evidence_ref": "docs/verification/t1140/public-write-read-observation.json"
    }
  ],
  "coverage": [
    {
      "condition": "refresh",
      "result": "pass",
      "evidence_ref": "docs/verification/t1140/public-write-read-observation.json"
    },
    {
      "condition": "repeat",
      "result": "pass",
      "evidence_ref": "docs/verification/t1140/public-write-read-observation.json"
    },
    {
      "condition": "back",
      "result": "pass",
      "evidence_ref": "docs/verification/t1140/public-write-read-observation.json"
    }
  ],
  "visible_copy": {
    "artifact_path": "docs/verification/t1140/visible-copy.json",
    "artifact_sha256": "6035d33f9d5df1b27a14ff06e18b1e78130f25396431fedd72c11035f35b6fc5"
  },
  "tdd_red_ref": "docs/verification/t1136/screenshots/shared-asset-picker-683.png实际低高度主体空间问题及T1145原重叠截图；实际外层裁切原失败见docs/verification/t1145。T1142/43/46/47是测试观察校准，原失败保留，不冒作产品RED。",
  "open_defects": [],
  "status": "pass"
}
```
