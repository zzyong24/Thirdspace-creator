# T-1106 前端与原任务归属验收

源码修复已提交于4269240b。信源的历史LOGIN_REQUIRED明确显示“上次同步需登录”，主“重试”沿已保存的原采集账号；独立扫码入口仍可用，在途不重复提交。旧任务仅在原账号一直处于初始组且历史证据完整时恢复准入，保留原任务ID与checkpoint；无法证明时保留任务和内容，提示用户核对账号，内部冻结版本术语不再直接显示。

真实Chrome渲染正式组件、hooks、Dialog与正式样式，1366×900及1024×800共10步通过、浏览器错误0；重复点击与刷新保持在途，原任务显式retry不新增入队，取消与Esc返回原扫码按钮。数据来自安装版公共CLI只读证据与用户截图代表投影；操作API、Next导航和模型输出是明确的隔离替身。未运行完整Next/桌面宿主，未认证平台、读取Cookie、修改真实用户数据库或重试安装版原任务。正式backend公开服务入队→claim→原转写/选题runner→项目落库由隔离真实数据库集成另行验证，未知结果不重发。

补充诊断：公开原父项attempt18/maxAttempts3，但预算与期限字段未投影，不等于NULL，不能认定耗尽；公开inspect确认父项无调用账本。未修改产品预算或新增nullable父协议，未重试真实原任务。

范围内验证：后端旧归属20PASS，归属/原队列扩大26PASS；前端相关27PASS、最终两文件闭合23PASS/49项范围外skip；双端类型检查PASS。补充18轮continuous父项原retry→等待→重启→原child单次fixture执行→20轮项目完成，预算/期限/输入/ID保持；是当场支持性回归，原实现本就PASS，没有新RED。归档/执行真实隔离PG三文件59PASS，LED047八文件174PASS；boundary无新增（旧5条）、semantic PASS、orphan 0error。独立SPEC前置评审及最终源码/九张截图复核PASS。实际RED、夹具/环境失败与修复后GREEN均保留，不补拍历史证据。

扩大前端回归的3项失败已在原d35f7d57快照同名同因复现；超时静态检查已有短预算失败，本任务四个产品文件不在失败路径中，动态公共链通过。它们登记T-1106-related-gates并保留在related-baseline.md。open_defects=[]只表示本任务验收范围无剩余阻断，不表示全仓全绿。全局reconcile实际exit1、45项失败/0warning，详情global-gates.md；旧债及LED055首次触发首因未定均登记，LED055不改源码原命令复跑118PASS，原失败未被改写或隐藏。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1106",
  "contract_path": "docs/features/t1106-radar-auth-owner.PAGE_SPEC.md",
  "contract_sha": "b0c540c67136",
  "commit_sha": "e19fd2d26f5a60c1ad0dccf5dfd4630e9f856fad",
  "observed_at": "2026-10-09T05:47:07.063Z",
  "run": {
    "verify_key": "radar-auth-owner:e2e",
    "command": "node docs/verification/t1106/run-journey.mjs",
    "exit_code": 0,
    "output_ref": "docs/verification/t1106/journey-bound.log"
  },
  "environment": {
    "surface": "desktop-web",
    "runtime": "Google Chrome 155.0.8059.39 / macOS",
    "viewports": [
      {
        "width": 1366,
        "height": 900,
        "result": "pass"
      },
      {
        "width": 1024,
        "height": 800,
        "result": "pass"
      }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      {
        "id": "sha256:1a4d00563af87fdf95fc6fea50efbed0893bc85bc78ebcc4fabaf127d2daa56e",
        "role": "安装版公共CLI只读取得的历史信源、原采集账号与原升级任务证据，配合用户截图的代表性标题/作者/指标。状态操作API为隔离替身，不证明当前平台认证或真实任务恢复。"
      }
    ]
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1106/frontend-final-closure.log; docs/verification/t1106/backend-legacy-final.log; docs/verification/t1106/archive-guard-final.log"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1106/screenshots/; docs/verification/t1106/INDEPENDENT_REVIEW.md"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1106/journey-bound.log; docs/verification/t1106/journey-results.json"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "本轮为源码修复；没有用户体验确认、完整桌面宿主/Next路由、真实平台扫码/采集/模型执行或安装版任务恢复。"
    }
  },
  "checks": [
    {
      "id": "AC-RADAR-LOGIN",
      "test_id": "TEST-T1106-RADAR",
      "result": "pass",
      "evidence_ref": "docs/verification/t1106/journey-results.json; docs/verification/t1106/frontend-final-closure.log"
    },
    {
      "id": "AC-RADAR-UPGRADE",
      "test_id": "TEST-T1106-RADAR",
      "result": "pass",
      "evidence_ref": "docs/verification/t1106/backend-legacy-final.log; docs/verification/t1106/journey-results.json"
    }
  ],
  "coverage": [
    {
      "condition": "refresh",
      "result": "pass",
      "evidence_ref": "docs/verification/t1106/journey-results.json"
    },
    {
      "condition": "repeat",
      "result": "pass",
      "evidence_ref": "docs/verification/t1106/journey-results.json"
    },
    {
      "condition": "back",
      "result": "pass",
      "evidence_ref": "docs/verification/t1106/journey-results.json"
    }
  ],
  "visible_copy": {
    "artifact_path": "docs/verification/t1106/actual-visible-copy.json",
    "artifact_sha256": "04d9e4e705e3b37428b7e04a2eba174b3c54acad5e96c327da385fff25b168f2"
  },
  "tdd_red_ref": "docs/verification/t1106/frontend-red.log; docs/verification/t1106/backend-red.log; docs/verification/t1106/backend-foreign-history-red.log; docs/verification/t1106/focus-red/",
  "open_defects": [],
  "status": "pass"
}
```
