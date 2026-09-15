# 首页连点有界诊断

```research-first-gate/v2
{
  "schema": "research-first-gate/v2",
  "task_id": "T-988",
  "research_task_id": "T-988",
  "status": "validated",
  "problem_statement": "安装版首页重复点击实际产生多个导航请求和串行查询放大",
  "failure_family": "page-navigation-read-amplification",
  "observed_invariant": "返回展示页不应无界读取历史数据，缓存不得遮盖新写入和运行状态",
  "trigger_kinds": [
    "repeated-failure-family"
  ],
  "paused_actions": [
    "further-production-changes",
    "broadened-workaround",
    "repeated-full-system-runs",
    "irreversible-operations"
  ],
  "evidence": {
    "authoritative": [
      {
        "kind": "source-code",
        "ref": "frontend/src/components/shell/sidebar.tsx",
        "claim": "只有useLinkStatus展示状态，没有同目标在途去重"
      },
      {
        "kind": "source-code",
        "ref": "backend/src/application/queries/dashboard.ts",
        "claim": "先解析100条标题再筛选5条，且首页动态待办不能整体缓存"
      }
    ],
    "local": [
      {
        "kind": "browser-navigation-probe",
        "path": "docs/research/t988/baseline.json",
        "locator": "browser",
        "observation": "同号5连点产生5次RSC，完整指标出现约4027ms；非原生WebView"
      }
    ],
    "experiments": [
      {
        "question": "连点是否真的重复请求？",
        "command": "ego-browser TaskSpace35/p1，5次实际DOM click并观察fetch与总览指标",
        "environment": "af62ddda installed macOS server / ego-browser Chromium frontend; not native WKWebView",
        "result": "是，5次RSC且耗时逐步放大",
        "artifact_path": "docs/research/t988/baseline.json",
        "artifact_sha256": "c91c29eb2fb76c49d6514adeb46aa50c49503e44ce87d72b7f116327bffbf34d"
      }
    ]
  },
  "options": [
    {
      "id": "fixed-delay",
      "outcome": "每次点击延迟固定时间",
      "tradeoffs": "增加首点等待且未消除查询放大",
      "scope": "主导航",
      "falsified_by": "实际重复RSC与标题查询放大已复现，不采用"
    },
    {
      "id": "coalesce-and-bound",
      "outcome": "合并同目标在途导航，先筛选再解析标题，缓存可失效的指标数据",
      "tradeoffs": "动态待办和排期仍实时，保留正常切页和失败重试",
      "scope": "首页读取、主导航、用户文案",
      "falsified_by": "账号串号、旧待办不刷新、不同导航被吞、失败锁死即不验收"
    }
  ],
  "recommendation": "coalesce-and-bound",
  "validation": {
    "timebox_minutes": 30,
    "max_experiments": 1,
    "acceptance_criteria": [
      {
        "name": "诊断证据",
        "target": "真实浏览器连点请求和首页数据完成",
        "measurement": "fetch计数+DOM总览指标",
        "observed": "5个RSC/4027ms，真实总播放量等指标",
        "verify_key": "t988-baseline",
        "evidence_path": "docs/research/t988/baseline.json",
        "evidence_sha256": "c91c29eb2fb76c49d6514adeb46aa50c49503e44ce87d72b7f116327bffbf34d"
      },
      {
        "name": "独立源码审查",
        "target": "确认多余标题读取和不能整页缓存的实时性约束",
        "measurement": "dashboard.ts/sidebar.tsx/只读Agent交叉审查",
        "observed": "100条先解析再选5条、useLinkStatus只展示，排期任务必须实时",
        "verify_key": "t988-baseline",
        "evidence_path": "docs/research/t988/baseline.json",
        "evidence_sha256": "c91c29eb2fb76c49d6514adeb46aa50c49503e44ce87d72b7f116327bffbf34d"
      }
    ],
    "resume_criteria": "按具体缝修复后验收，诊断不代表修复通过"
  },
  "decision_impacts": [
    "none"
  ]
}
```
