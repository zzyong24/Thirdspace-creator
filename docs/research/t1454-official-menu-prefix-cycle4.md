# 实际官方菜单prefix与旧fixture不一致

前轮恢复仍失败，不续改归属。T1456新的已授权只读两图提供了直接跳转证据；本卡只恢复已证菜单协议兼容。旧研究卡不覆盖、不伪造成功。

```research-first-gate/v2
{
  "schema": "research-first-gate/v2",
  "task_id": "T-1454",
  "research_task_id": "T-1454",
  "status": "validated",
  "failure_family": "authenticated-report-navigation-unreachable",
  "trigger_kinds": [
    "unsuccessful-intervention-churn"
  ],
  "problem_statement": "新一次授权取证证明身份有效、post灰屏后四秒退回首页；官方wrapper明确注入finder-ui-desktop，而生产menu仅weui-desktop，导致真正菜单不可达。纠正已证选择器缺陷，不放宽归属。",
  "observed_invariant": "当前身份下的可见报表须有实际runtime对象关联且完整数据核验，不凭同文字或测试成功宣布平台成功。",
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
        "ref": "https://res.wx.qq.com/t/wx_fed/finder/helper/finder-helper-web/res/static/js/chunk-common.ec025662.js",
        "claim": "module70072向官方组件注入prefixCls=finder-ui-desktop；module31094注册FinderMpNavigation触发该注入。"
      }
    ],
    "local": [
      {
        "kind": "source-code",
        "path": "ai-worker/src/runtime/platform/wechat-dom-witness.ts",
        "locator": "navigateChannelsMenu",
        "observation": "只有weui-desktop固定类，因此对实际Finder包装菜单返回false。"
      },
      {
        "kind": "runtime",
        "path": "docs/verification/t1456/approved-safe-summary.json",
        "locator": "cli-inv-54aeba62-92",
        "observation": "identityMatched且post首帧灰屏、home末帧正常，授权消耗后恢复普通启动。"
      }
    ],
    "experiments": [
      {
        "question": "实际官方组件是否使用生产硬编码的旧prefix？",
        "command": "urllib仅取官方公开hash命名bundle，对比旧公开asset并检查module70072；不带cookie、不执行JS",
        "environment": "本机只读公开静态资源",
        "result": "不是；新旧asset哈希完全相同，provider是finder-ui-desktop，生产只匹配weui-desktop，既有fixture误用旧默认值。",
        "artifact_path": "docs/verification/t1454/prefix-public-source.json",
        "artifact_sha256": "2e5901e9ebe2ddc20649eb28f20188b605c42be658c6afb4ef909e95749a5010"
      }
    ]
  },
  "validation": {
    "timebox_minutes": 120,
    "max_experiments": 2,
    "acceptance_criteria": [
      {
        "name": "真实跳转回退被定向取证核实",
        "target": "同账号post进入后回home且非隔离",
        "measurement": "现场证据核验命令及SHA",
        "observed": "同账号post进入后回home且非隔离",
        "verify_key": "t1454-entry-return-evidence",
        "evidence_path": "docs/verification/t1456/approved-safe-summary.json",
        "evidence_sha256": "ec1fc8c83d6a770053a3e3fa591019803fe1a2bcd345028832bb7b250740713d"
      },
      {
        "name": "官方prefix与生产选择器缺陷被静态区分",
        "target": "官方finder-ui-desktop且生产旧weui-desktop",
        "measurement": "现场证据核验命令及SHA",
        "observed": "官方finder-ui-desktop且生产旧weui-desktop",
        "verify_key": "t1454-official-menu-prefix",
        "evidence_path": "docs/verification/t1454/prefix-public-source.json",
        "evidence_sha256": "2e5901e9ebe2ddc20649eb28f20188b605c42be658c6afb4ef909e95749a5010"
      }
    ],
    "resume_criteria": "只兼容两个已证官方组件prefix，并保持唯一可见owner精确标题和子项关联、旧固定goto、安全归属与数据预算不变。真实Chromium新增实际prefix完整三报表RED/GREEN；一次安装版正常同步回读。如失败停止本轮继续猜测。"
  },
  "decision_impacts": [
    "none"
  ],
  "decision_ids": [],
  "options": [
    {
      "id": "OPT-1",
      "outcome": "扩大运行时/Shadow归属条件",
      "tradeoffs": "与已证不同组件相矛盾且不能让菜单选择器命中",
      "scope": "拒绝",
      "falsified_by": "实际同一实例且菜单已执行；当前无此证据。"
    },
    {
      "id": "OPT-2",
      "outcome": "保留旧prefix并新增官方Finder prefix，在同一menu根中核验精确子项；不按任意文本/图标点击",
      "tradeoffs": "修复已证入口缺陷，但同步是否恢复必须真机证明",
      "scope": "最小可逆固定UI协议兼容",
      "falsified_by": "新增真实prefix完整三报表仍失败或旧合法/拒绝族退化；真机仍失败则不宣布修复。"
    }
  ],
  "recommendation": "OPT-2"
}
```
