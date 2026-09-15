# 页面卡顿有界诊断

实测与范围已明确；修复效果尚待实施验证。

```research-first-gate/v2
{
  "schema": "research-first-gate/v2",
  "task_id": "T-987",
  "research_task_id": "T-987",
  "status": "validated",
  "problem_statement": "重复页面卡顿反馈，需区分数据库读取、缓存覆盖和浏览器负载后再改代码",
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
        "ref": "frontend/src/lib/page-read-cache.server.ts",
        "claim": "有界展示缓存已有版本核对及写入失效，发布汇总未使用"
      },
      {
        "kind": "source-code",
        "ref": "backend/src/modules/analytics/analytics.repository.ts",
        "claim": "趋势仅在取全部快照后按日期截断"
      }
    ],
    "local": [
      {
        "kind": "installed-runtime-probe",
        "path": "docs/research/t987/baseline.json",
        "locator": "routeMeasurementsMs / diagnosis",
        "observation": "两轮SSR及公共CLI读取成功；独立源码检查确认重复历史读取与缓存缺口，未验证原生点击"
      }
    ],
    "experiments": [
      {
        "question": "是否简单查询本身需要数秒，还是页面组装与读取放大需要分开修复？",
        "command": "已运行 urllib.request 显式当前账号读取 /automations /publishing 两轮；creatoros scheduledJobs.list三轮；两名只读Agent交叉源码检查",
        "environment": "macOS安装版13fe7de6同一账号",
        "result": "自动化33–84ms，发布122–276ms；未复现服务端半天无响应，但确认四个放大点。原生WebView未测，不下结论",
        "artifact_path": "docs/research/t987/baseline.json",
        "artifact_sha256": "e9e2574421f469aeabd8af1c2da1840ed64ef56c95e17d92319c1db044d671f2"
      }
    ]
  },
  "options": [
    {
      "id": "blanket-cache",
      "outcome": "全页面延长TTL",
      "tradeoffs": "可能遮盖运行状态，未消除首次历史读取",
      "scope": "全局页面",
      "falsified_by": "明确缓存未覆盖和全历史扫描证据，拒绝此方案"
    },
    {
      "id": "bounded-projection",
      "outcome": "有界趋势查询与发布汇总缓存，实时日历/任务，减少无用传输",
      "tradeoffs": "保留缓存未命中时读取，需要新旧结果/隔离测试",
      "scope": "自动化及发布中心现有查询和展示缝",
      "falsified_by": "若稀疏日期结果改变或新写入不可见，停止该实现"
    }
  ],
  "recommendation": "bounded-projection",
  "validation": {
    "timebox_minutes": 30,
    "max_experiments": 1,
    "acceptance_criteria": [
      {
        "name": "诊断量化",
        "target": "同号安装版两页至少两次读取，明确非原生耗时",
        "measurement": "HTTP与公共CLI",
        "observed": "两轮成功并保存边界",
        "verify_key": "t987-baseline-timing",
        "evidence_path": "docs/research/t987/baseline.json",
        "evidence_sha256": "e9e2574421f469aeabd8af1c2da1840ed64ef56c95e17d92319c1db044d671f2"
      },
      {
        "name": "修复边界",
        "target": "至少两个可定位放大点及实时性约束",
        "measurement": "独立源码审查+SPEC",
        "observed": "四项放大点，日历/时区保持实时，不改调度/契约",
        "verify_key": "t987-baseline-scope",
        "evidence_path": "docs/research/t987/baseline.json",
        "evidence_sha256": "e9e2574421f469aeabd8af1c2da1840ed64ef56c95e17d92319c1db044d671f2"
      }
    ],
    "resume_criteria": "诊断完成后按已复核范围实施，再跑真实SQL/缓存/页面回归；不得把本卡当成修复通过"
  },
  "decision_impacts": [
    "none"
  ]
}
```
