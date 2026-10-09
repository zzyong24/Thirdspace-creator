# T1149 当前主分支画幅功能浏览器验收报告

当前源commit aa7de1e91183ec0236a82cd954a4f4bf9bb1aeb1；原Chrome两例实际PASS、0retry，75.625041秒exit0，七受测源码前后一致。根此前实际查看八图的受测字节与当前提交完全一致，保原视觉记录并用source绑定证明复用；不是改写原head。原生option已知禁用、两模式入口引用保留、原成功save/get/reload/back/repeat及错误后输入保持皆按真实公共链验证；能力及一次503失败明确为fixture，成功写未替换。

仅签本SPEC列明行为。原两键盘探针exit1，不签键盘；原静态27处失败、旧四任务收据重验及完整canonical待闭合。T1155范围外开发服务连接中断仍UNKNOWN，正常功能退出不代签已修；本报告open_defects只指T1149列明行为，不宣称系统全绿。未签新包、原生App、模型、扫码或真实平台。报告生成的首次本地HEAD断言手工字符串末位误写，实际exit1且未写报告，随后改用git真实HEAD并校核；不将该失败记成产品RED。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1149",
  "contract_path": "docs/verification/t1149/PAGE_SPEC.md",
  "contract_sha": "cb2906ee1ba4",
  "commit_sha": "aa7de1e91183ec0236a82cd954a4f4bf9bb1aeb1",
  "observed_at": "2026-10-09T19:10:27.075Z",
  "run": {
    "verify_key": "cover-group-aspect:e2e",
    "command": "node docs/verification/t1149/run-aspect-journey.mjs",
    "exit_code": 0,
    "output_ref": "docs/verification/t1149/current-journey.log"
  },
  "environment": {
    "surface": "browser",
    "runtime": "macOS / Google Chrome channel=chrome，fresh PGlite及auth隔离；能力与一次503声明fixture，成功写/回读真实公共链",
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
      }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      {
        "id": "sha256:6717e27e13901af99c97b8a46541fc04d33c4f6a29c37b9e9726827987b5f20b",
        "role": "真实组/项目/画布/上传/模板ID，画幅两次修改原revision递增，静态/组外/原引用保持、刷新返回重复一致"
      },
      {
        "id": "sha256:a6302712d2bfaef2dae9c93eac2d7dfe3ba9e7fcb8e2070be7314f6bf4065b78",
        "role": "两模式入口原引用保持、原生option禁用；一次503失败原输入留存，实际成功重试与正式get一致"
      }
    ]
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "48组件/25服务/174 LED047/当前type0/正式T1141 root回读；模型未调用"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "CURRENT_ROOT_VISUAL_CHECK.json与POSTCOMMIT_VISUAL_SOURCE_BINDING.json：根实际八图，受测字节完全相同，局部自检非独立视觉"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "current-journey.json；postcommit-normal-browser.json，原两例实际0retry/exit0"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "本SPEC仅源码Chrome；整个客户端安装验收仍待新包，不代签用户功能体验"
    }
  },
  "checks": [
    {
      "id": "AC-ASPECT",
      "test_id": "TEST-T1149-ASPECT",
      "result": "pass",
      "evidence_ref": "aspect-public-observation.json"
    },
    {
      "id": "AC-CAPABILITY",
      "test_id": "TEST-T1149-CAPABILITY",
      "result": "pass",
      "evidence_ref": "capability-public-observation.json；当前组件能力边界"
    },
    {
      "id": "AC-AVAILABILITY",
      "test_id": "TEST-T1149-CAPABILITY",
      "result": "pass",
      "evidence_ref": "当前48组件混合合法页/在途/未知能力，正式T1141 root；非真实模型"
    },
    {
      "id": "AC-COPY",
      "test_id": "TEST-T1149-ASPECT",
      "result": "pass",
      "evidence_ref": "visible-copy.json与实际八图用途/底稿裁切"
    }
  ],
  "coverage": [
    {
      "condition": "refresh",
      "result": "pass",
      "evidence_ref": "aspect-public-observation.json与capability-public-observation.json"
    },
    {
      "condition": "repeat",
      "result": "pass",
      "evidence_ref": "aspect-public-observation.json与capability-public-observation.json"
    },
    {
      "condition": "back",
      "result": "pass",
      "evidence_ref": "aspect-public-observation.json与capability-public-observation.json"
    }
  ],
  "visible_copy": {
    "artifact_path": "docs/verification/t1149/visible-copy.json",
    "artifact_sha256": "7ffad994286b3899f28b1c9e572de6eef7607e5eba43889d631d772c2f085c2d"
  },
  "tdd_red_ref": "t1149-target-calibrated-current-red.json与原日志gzip（六行为RED，非fixture失败）",
  "open_defects": [],
  "status": "pass"
}
```
