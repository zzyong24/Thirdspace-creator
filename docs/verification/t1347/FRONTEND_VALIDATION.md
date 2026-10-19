# T1347 最终候选真实日报与键盘验收

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1347",
  "contract_path": "docs/verification/t1347/control/PAGE_SPEC.md",
  "contract_sha": "c3c19cf2e236",
  "commit_sha": "3b0f1471de3bf2f4de371849e29112a35a7ab4b3",
  "observed_at": "2026-10-18T14:45:20.800789+00:00",
  "run": {
    "verify_key": "t1347-native-trend:e2e",
    "command": "node docs/verification/t1345/control/run-frozen-ui.mjs T-1347",
    "exit_code": 0,
    "output_ref": "docs/verification/t1347/candidate-attempt05/wrapper.log"
  },
  "environment": {
    "surface": "browser",
    "runtime": "Google Chrome / macOS，干净managed候选3b0f1471d，私有PGlite持久日报，真实HTTP与原生Chrome200%",
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
      }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      {
        "id": "t1347-daily",
        "role": "真实私有数据库完整每日输入组，真实auth/me与groups列表先核身份"
      },
      {
        "id": "t1347-single",
        "role": "真实零与其他日未知"
      },
      {
        "id": "t1347-sparse",
        "role": "有缺口的真实每日值"
      },
      {
        "id": "t1347-official",
        "role": "公众号不可猜总计渠道"
      },
      {
        "id": "t1347-multi-a",
        "role": "实际键盘选中后URL/publicRead同ID"
      }
    ]
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1347/RESULT.md"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1347/independent-visual/FINAL_REVIEW.md（fcd相同产品像素独评）；docs/verification/t1347/candidate-attempt05/formal-ui-artifacts（3b关键daily/single/dark已实际看）"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "docs/verification/t1347/candidate-attempt05/wrapper.log"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "执行与独评不冒用户本人体验认可；新App另验。"
    }
  },
  "checks": [
    {
      "id": "SCOPE",
      "test_id": "t1347-scope",
      "result": "pass",
      "evidence_ref": "docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1024/witness.json；docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1366/witness.json"
    },
    {
      "id": "SINGLE_CARD",
      "test_id": "t1347-single-card",
      "result": "pass",
      "evidence_ref": "docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1024/witness.json；docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1366/witness.json"
    },
    {
      "id": "METRIC_TRUTH",
      "test_id": "t1347-metric-truth",
      "result": "pass",
      "evidence_ref": "docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1024/witness.json；docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1366/witness.json"
    },
    {
      "id": "OTHER_CARDS",
      "test_id": "t1347-other-cards",
      "result": "pass",
      "evidence_ref": "docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1024/witness.json；docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1366/witness.json"
    },
    {
      "id": "STALE_SCOPE",
      "test_id": "t1347-stale-scope",
      "result": "pass",
      "evidence_ref": "docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1024/witness.json；docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1366/witness.json"
    },
    {
      "id": "FILTER",
      "test_id": "t1347-filter",
      "result": "pass",
      "evidence_ref": "docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1024/witness.json；docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1366/witness.json"
    },
    {
      "id": "HOVER_DATE",
      "test_id": "t1347-hover-date",
      "result": "pass",
      "evidence_ref": "docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1024/witness.json；docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1366/witness.json"
    },
    {
      "id": "THEME_ZOOM",
      "test_id": "t1347-theme-zoom",
      "result": "pass",
      "evidence_ref": "docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1024/witness.json；docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1366/witness.json"
    }
  ],
  "visible_copy": {
    "artifact_path": "docs/verification/t1347/control/VISIBLE_COPY.json",
    "artifact_sha256": "1f8164f61adc87492cc857975563774275a4b40ce9af6a031d390ba88c841cc9"
  },
  "tdd_red_ref": "docs/verification/t1347/red-backend.txt；docs/verification/t1347/red-frontend.txt；docs/verification/t1347/red-independent-endpoint.txt",
  "open_defects": [],
  "status": "pass",
  "limitations": [
    "8族为候选自身真实identity/service写入私有PGlite的代表性合成事实，页面与端点读取真实持久数据；不mock成功HTTP，不冒真人采集或供应商日报。",
    "本次真实键盘focus/Enter/Home/焦点断言/ArrowDown/焦点断言/Enter后，页面选择、URL与真实publicRead均为multi-a；fcd attempt04鼠标被误标keyboard原证据已降格，不能据旧标签签PASS。",
    "独立39图视觉来自fcd；root核fcd至3b仅测试/风险文书，无生产字节变动。本次3b实际重看1024完整日曲线、小0单点和暗色入图，像素承继仅限相同产品。",
    "客户端abort不冒服务端SQL强取消；延迟真实响应期间其它卡与切组完成，迟到后仍新scope。日志保Next aborted/ECONNRESET/uncaughtException，不称全程无异常。",
    "原attempt01代理前置、02真实identity种子失败、03动画/窄屏欠证、04欠真实keyboard均保留；本轮2PASS不覆盖旧失败或缺证。",
    "自然日仅可信单账号日报；多平台/多账号不可相加，公众号总计不可证诚实空态；累计比较只最近最多5条、真实0与未知分开。",
    "全局开工旧债与本批新增宽路径收据失配T1353分列，不宣称全局reconcile全绿、Tauri原椭圆根因或新App已验证。"
  ],
  "coverage": [
    {
      "condition": "loading",
      "result": "pass",
      "evidence_ref": "docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1024/witness.json；docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1366/witness.json"
    },
    {
      "condition": "error",
      "result": "pass",
      "evidence_ref": "docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1024/witness.json；docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1366/witness.json"
    },
    {
      "condition": "empty",
      "result": "pass",
      "evidence_ref": "docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1024/witness.json；docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1366/witness.json"
    },
    {
      "condition": "back",
      "result": "pass",
      "evidence_ref": "docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1024/witness.json；docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1366/witness.json"
    },
    {
      "condition": "refresh",
      "result": "pass",
      "evidence_ref": "docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1024/witness.json；docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1366/witness.json"
    },
    {
      "condition": "repeat",
      "result": "pass",
      "evidence_ref": "docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1024/witness.json；docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1366/witness.json"
    },
    {
      "condition": "keyboard",
      "result": "pass",
      "evidence_ref": "docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1024/witness.json；docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1366/witness.json"
    },
    {
      "condition": "zoom",
      "result": "pass",
      "evidence_ref": "docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1024/witness.json；docs/verification/t1347/candidate-attempt05/formal-ui-artifacts/ui-public-probe-T1347公开首页与原生日数据-1366/witness.json"
    }
  ]
}
```
