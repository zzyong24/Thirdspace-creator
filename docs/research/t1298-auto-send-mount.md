# T1298 首次挂载自动发送研究

```research-first-gate/v2
{
  "schema": "research-first-gate/v2",
  "task_id": "T-1298",
  "research_task_id": "T-1298",
  "status": "validated",
  "problem_statement": "1280首次挂载对话栏携带autoSend，prepare返回后无POST；去除HMR仍复现。",
  "failure_family": "initial-auto-send-lost",
  "observed_invariant": "显式重组点击应保存准备后提交恰好一轮；真实卸载/切作用域不得提交旧请求。",
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
        "ref": "frontend/node_modules/react-dom/cjs/react-dom-client.development.js",
        "claim": "doubleInvokeEffectsOnFiber先恢复layout，再恢复passive effect。"
      }
    ],
    "local": [
      {
        "kind": "code",
        "path": "frontend/src/features/copilot/ai-copilot-content.tsx",
        "locator": "recoveryMounted / ownsSubmissionAttempt",
        "observation": "mounted在passive恢复，invalid-attempt清理在layout先执行。"
      },
      {
        "kind": "runtime",
        "path": "docs/verification/t1298/browser/runs/prepared-9067fc9d55a9de34/observation-stop.json",
        "locator": "图文首次挂载",
        "observation": "无增量HMR仍未提交，无进行中的模型任务。"
      }
    ],
    "experiments": [
      {
        "question": "被动mounted与layout身份守卫顺序是否吞初挂请求；改为layout是否保真实卸载",
        "command": "pnpm -C frontend exec vitest run src/features/copilot/t1298-lifecycle-research.test.tsx --retry=0",
        "environment": "本项目React/ReactDOM+jsdom StrictMode最小生命周期实验",
        "result": "旧顺序发送0次，layout对齐发送1次；两种真实卸载均0次，4例通过。",
        "artifact_path": "docs/verification/t1298/logs/lifecycle-research.log",
        "artifact_sha256": "986b58d5ef07388243ec5700f49dadfd466d45d3dea268c6ab6c08ed0341b5ef"
      },
      {
        "question": "真实Composer是否复现同一缺陷",
        "command": "pnpm -C frontend exec vitest run src/features/copilot/ai-copilot-content.test.tsx -t \"T1298 初挂StrictMode\" --retry=0",
        "environment": "实际Composer+延迟prepare，SDK发送spy",
        "result": "应发1次实际0次红测；真实卸载不发送通过。",
        "artifact_path": "docs/verification/t1298/logs/copilot-mount-red.log",
        "artifact_sha256": "1124c2c3a05bcd07757e82b01f3d38b02a9404aa30963167f747ed57218b17d0"
      }
    ]
  },
  "options": [
    {
      "id": "OPT-1",
      "outcome": "将mounted生命周期对齐layout，保留全部身份守卫",
      "tradeoffs": "改一处effect调度并验证真实卸载",
      "scope": "既有Copilot内部生命周期，不改契约/数据归属/IA",
      "falsified_by": "StrictMode重放仍丢请求或真实卸载会发送"
    },
    {
      "id": "OPT-2",
      "outcome": "继续调整HMR或放宽owns检查",
      "tradeoffs": "前者已被复验反证；后者会降低安全边界",
      "scope": "不采用",
      "falsified_by": "隔离HMR实际已仍复现"
    }
  ],
  "recommendation": "OPT-1",
  "validation": {
    "timebox_minutes": 60,
    "max_experiments": 2,
    "acceptance_criteria": [
      {
        "name": "StrictMode生命周期区分",
        "target": "旧passive=0次；对齐layout=1次",
        "measurement": "真实React重放并释放延迟prepare",
        "observed": "两例均符合，修复机制有证据",
        "verify_key": "t1298-lifecycle",
        "evidence_path": "docs/verification/t1298/logs/lifecycle-research.log",
        "evidence_sha256": "986b58d5ef07388243ec5700f49dadfd466d45d3dea268c6ab6c08ed0341b5ef"
      },
      {
        "name": "真实卸载保护",
        "target": "卸载后均不发送",
        "measurement": "真实React卸载再释放prepare",
        "observed": "2例均0次",
        "verify_key": "t1298-lifecycle",
        "evidence_path": "docs/verification/t1298/logs/lifecycle-research.log",
        "evidence_sha256": "986b58d5ef07388243ec5700f49dadfd466d45d3dea268c6ab6c08ed0341b5ef"
      }
    ],
    "resume_criteria": "最小React实验同时证明重放代次与真实卸载边界，独立代码审核，随后实际Composer红绿和公共旅程。"
  },
  "decision_impacts": [
    "none"
  ],
  "decision_ids": []
}
```

范围为既有Copilot生命周期一行修复；新产品/数据/服务/IA决策均无。公共真实旅程仍待修复后验收，研究通过不代替产品通过。
