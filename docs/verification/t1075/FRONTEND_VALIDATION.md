# T-1075 资料书架前端真实旅程验收

用户已选择01资料书架。固定提交通过两视口真实读写；后台数据来自每次新建的隔离数据库和本地媒体目录，无fixture响应或预制成功结果。表单/公开API写入后重新读取同一ID及完整版本正文，实际上传和下载原文件，再由真实项目读取引用。未操作生产资料或安装版，未调用模型验证PDF/DOCX提取。MD文件导入已实际验证。

主从、空态、慢响应、读取断网恢复、写成功后读失败只重读、同步提交互斥、历史导航清空错误目标、切组立即卸载草稿、跨组/未知软引用拒绝、重复项目引用及207/102大集合均有实际后置断言。390额外检查目录折叠和完整长标题；200%是独立走查的等效布局模拟，未冒称真实桌面缩放按钮。

可见文案原始证据复制为不可变的bound文件；正式完成命令再运行同一旅程时另写常规输出，不覆盖该次既有证据。完整原始运行输出见journey-final.log；后续完成命令由taskctl写实际执行与代码绑定审计。

当场红测有真实日志。首次页面故障注入定位错误、一次运行中的HMR、一次浏览器路由解除竞态均保留为调试失败，没有转写成产品验收通过。菜单移动后仍开着遮住编辑是实际浏览器发现，截图/错误上下文及随后固定版GREEN保留。未补拍历史评审或红测。

全局工程对账退出1：35项错误（原34项逐条相同，额外LED-055汇总失败）。同一源码的LED-055分开重跑全部通过，原失败仍保留、原因未定位并登记T-1018；本任务读写/UI门通过，不能据此写全局全绿。详见reconcile-comparison.json和led055-isolated.log。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1075",
  "commit_sha": "a030dab73ba94e688bce0928afa3e5c9d47406d1",
  "contract_sha": "9e4b70f5e19e",
  "contract_path": "docs/features/t1075-knowledge-redesign/PAGE_SPEC.md",
  "observed_at": "2026-10-09T15:41:28.192Z",
  "run": {
    "verify_key": "knowledge-library:e2e",
    "command": "node docs/verification/t1075/run-journey.mjs",
    "exit_code": 0,
    "output_ref": "docs/verification/t1075/journey-final.log"
  },
  "environment": {
    "surface": "browser",
    "runtime": "Playwright Chromium 1.60.0 / Next.js 16.2.9；隔离临时PGlite及本地媒体目录，真实RPC及原文件PUT/GET",
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
        "id": "knowledge-f6a8775c-22",
        "role": "primary-knowledge"
      },
      {
        "id": "knowledge-f6a8775c-62",
        "role": "secondary-knowledge"
      },
      {
        "id": "knowledge-f6a8775c-1224",
        "role": "primary-knowledge"
      },
      {
        "id": "knowledge-f6a8775c-1264",
        "role": "secondary-knowledge"
      }
    ]
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1075/frontend-final.log（31项）及backend-green.log（44项）"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1075/long-title-1366.png、long-title-1024.png、extreme-390.png、visual-review-round3.md"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1075/journey-final.log：两视口完整真实旅程；207份资料和102条引用"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "用户选择01；docs/verification/t1075/task-walk.md为独立机器走查，不冒称人类操作确认"
    }
  },
  "checks": [
    {
      "id": "collection",
      "test_id": "library-journey",
      "result": "pass",
      "evidence_ref": "frontend/tests/e2e/knowledge-library.spec.ts；docs/verification/t1075/journey-final.log"
    },
    {
      "id": "selection",
      "test_id": "library-journey",
      "result": "pass",
      "evidence_ref": "frontend/tests/e2e/knowledge-library.spec.ts；docs/verification/t1075/journey-final.log"
    },
    {
      "id": "detail",
      "test_id": "library-journey",
      "result": "pass",
      "evidence_ref": "frontend/tests/e2e/knowledge-library.spec.ts；docs/verification/t1075/journey-final.log"
    },
    {
      "id": "empty-next",
      "test_id": "library-journey",
      "result": "pass",
      "evidence_ref": "frontend/tests/e2e/knowledge-library.spec.ts；docs/verification/t1075/journey-final.log"
    },
    {
      "id": "write-read",
      "test_id": "library-journey",
      "result": "pass",
      "evidence_ref": "frontend/tests/e2e/knowledge-library.spec.ts；docs/verification/t1075/journey-final.log"
    },
    {
      "id": "organize",
      "test_id": "library-journey",
      "result": "pass",
      "evidence_ref": "frontend/tests/e2e/knowledge-library.spec.ts；docs/verification/t1075/journey-final.log"
    },
    {
      "id": "import",
      "test_id": "library-journey",
      "result": "pass",
      "evidence_ref": "frontend/tests/e2e/knowledge-library.spec.ts；docs/verification/t1075/journey-final.log"
    },
    {
      "id": "reference",
      "test_id": "library-journey",
      "result": "pass",
      "evidence_ref": "frontend/tests/e2e/knowledge-library.spec.ts；docs/verification/t1075/journey-final.log"
    },
    {
      "id": "navigation",
      "test_id": "library-journey",
      "result": "pass",
      "evidence_ref": "frontend/tests/e2e/knowledge-library.spec.ts；docs/verification/t1075/journey-final.log"
    }
  ],
  "coverage": [
    {
      "condition": "loading",
      "result": "pass",
      "evidence_ref": "docs/verification/t1075/journey-final.log；实际延迟/断网/返回/重载/重复引用及保存读回恢复"
    },
    {
      "condition": "empty",
      "result": "pass",
      "evidence_ref": "docs/verification/t1075/journey-final.log；实际延迟/断网/返回/重载/重复引用及保存读回恢复"
    },
    {
      "condition": "error",
      "result": "pass",
      "evidence_ref": "docs/verification/t1075/journey-final.log；实际延迟/断网/返回/重载/重复引用及保存读回恢复"
    },
    {
      "condition": "back",
      "result": "pass",
      "evidence_ref": "docs/verification/t1075/journey-final.log；实际延迟/断网/返回/重载/重复引用及保存读回恢复"
    },
    {
      "condition": "refresh",
      "result": "pass",
      "evidence_ref": "docs/verification/t1075/journey-final.log；实际延迟/断网/返回/重载/重复引用及保存读回恢复"
    },
    {
      "condition": "repeat",
      "result": "pass",
      "evidence_ref": "docs/verification/t1075/journey-final.log；实际延迟/断网/返回/重载/重复引用及保存读回恢复"
    }
  ],
  "tdd_red_ref": "docs/verification/t1075/journey-move-red-context.md（当场菜单遮挡后续编辑，随后修复）；tdd-frontend-red.log、tdd-ammo-red.log、tdd-backend-red.log（实现前聚焦红测）。journey-move-red.log剩余运行被中断，不算整轮PASS。",
  "open_defects": [],
  "visible_copy": {
    "artifact_path": "docs/verification/t1075/visible-copy-bound.json",
    "artifact_sha256": "d700acc14af4fd39a97cf486c3d8f4ed44b17484c0ff5103911eebbecb396dd0"
  },
  "status": "pass"
}
```
