# T1155 浏览器导航连接中断研究卡

当前只暂停本问题的生产试改/扩大绕路/重复全量实验；T1149已确认功能及来源整合可独立推进。当前两次原必需公共旅程均在开始前接入只读uncaughtExceptionMonitor并当场负观察；不把此前未监控的三次运行补拍成研究实验。两次预算已用尽，原问题仍未知。

```research-first-gate/v2
{
  "schema": "research-first-gate/v2",
  "task_id": "T-1155",
  "research_task_id": "T-1155",
  "status": "researching",
  "problem_statement": "多个本任务原浏览器日志有aborted/ECONNRESET/uncaughtException，原功能可正常退出，合并stdout/stderr缺请求时序和有效栈，不能解释实际触发链及安装影响。",
  "failure_family": "navigation-abort-unhandled-server-log",
  "observed_invariant": "正常页面切换取消请求不应成为影响本地服务可用性的未处理异常；本例是否实际违反尚待归因，不能忽略日志。",
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
        "ref": "frontend/src/app/api/v1/dispatch/route.ts",
        "claim": "当前POST解析body已有catch；不能仅根据aborted就归因JSON未catch。"
      },
      {
        "kind": "source-code",
        "ref": "frontend/src/app/api/v1/blob/[...key]/route.ts",
        "claim": "当前GET读文件字节后返回NextResponse；日志未给请求栈，不能猜是此文件流泄漏。"
      }
    ],
    "local": [
      {
        "kind": "log",
        "path": "docs/verification/t1149/current-journey.log.original.gz",
        "locator": "gzip解压原件含16处uncaughtException",
        "observation": "两条功能PASS、runner正常0与连接日志同时存在，均保原件。"
      },
      {
        "kind": "runtime",
        "path": "docs/verification/t1149/t1156-current-public-browser.json",
        "locator": "actual finished receipt 2026-10-09T19:05:53.058450+00:00",
        "observation": "78.616238秒exit0；非原生App/模型/真实平台验证。"
      }
    ],
    "experiments": [
      {
        "id": "EXP-1",
        "question": "T1136原必需公共旅程中能否捕获前述未处理连接异常的有效栈？",
        "command": "NODE_OPTIONS='--require [PRIVATE]/t1155-uncaught-monitor.cjs' node docs/verification/t1136/run-layout-journey.mjs",
        "environment": "main aa7de1e9，fresh隔离PGlite/auth与Chrome，原业务成功写回真实；只读Node monitor，非用户库或App",
        "result": "原required旅程exit0/80.053499秒，uncaughtException 0，Error: aborted 1；monitor文件未生成，无有效栈。原异常族在此路径未复现，根因仍UNKNOWN，不签已修。",
        "artifact_path": "docs/verification/t1155/negative-observation-1.json",
        "artifact_sha256": "80304e3a4ac3c5323be5e628077019403bfe6fc2c5a76a8fc155b7e2de20e511"
      },
      {
        "id": "EXP-2",
        "question": "T1101原必需公共旅程中能否捕获前述未处理连接异常的有效栈？",
        "command": "NODE_OPTIONS='--require [PRIVATE]/t1155-uncaught-monitor.cjs' node docs/verification/t1101/run-journey.mjs",
        "environment": "main aa7de1e9，fresh隔离PGlite/auth与Chrome，原业务成功写回真实；只读Node monitor，非用户库或App",
        "result": "原required旅程exit0/79.600219秒，uncaughtException 0，Error: aborted 1；monitor文件未生成，无有效栈。原异常族在此路径未复现，根因仍UNKNOWN，不签已修。",
        "artifact_path": "docs/verification/t1155/negative-observation-2.json",
        "artifact_sha256": "087f638c12a7f550f44b5edd7fa825aaa540976d871d543d1c066866ea040786"
      }
    ]
  },
  "options": [
    {
      "id": "OPT-1",
      "outcome": "最小原请求时序和有效栈取证后，在确认发生的取消边界修复",
      "tradeoffs": "需要只保存脱敏method/path/operation ID和栈，不记录body/签名/session",
      "scope": "一次隔离最小导航取消，不重跑整系统，不改归属或业务失败路径",
      "falsified_by": "取消请求与异常无关联或栈确认是其它任务消费者。"
    },
    {
      "id": "OPT-2",
      "outcome": "证据若确认仅特定开发服务生命周期，修复对应测试宿主/开发运行路径",
      "tradeoffs": "必须证明实际安装运行不复现，不能屏蔽异常或以退出0代签",
      "scope": "限真实被证实的开发/测试路径；不改vendor",
      "falsified_by": "原生产/安装服务同机制出现或影响实际保存/回读。"
    }
  ],
  "recommendation": "两次有界只读monitor观察已用尽，未取得原异常族栈；保持researching及实现暂停。仅利用后续本来必需验证的原日志和只读真实消费者进一步核对，不新增第三次实验或盲重跑，不注册抑制handler。",
  "validation": {
    "timebox_minutes": 120,
    "max_experiments": 2,
    "acceptance_criteria": [
      {
        "name": "真实请求与有效栈归因",
        "target": "唯一原请求/时点和实际源栈绑定，不读私密正文",
        "measurement": "隔离最小取消取证并核真实消费者",
        "observed": "UNKNOWN；现有合并日志只有ignore-listed frames",
        "verify_key": "t1155-abort-attribution",
        "evidence_path": "docs/verification/t1149/t1156-current-public-browser.json",
        "evidence_sha256": "9665fccda137ff91280262d1a5a4b818a39d46640157f518352bd4b3c973bf1c"
      },
      {
        "name": "取消与后续公共可用性",
        "target": "有界取消后正式save/get仍成功，服务正常关闭且无未处理异常",
        "measurement": "原因确认后原公共链最小回归；验收命令再正式登记执行",
        "observed": "原两例已0，但16处未处理日志仍在，未通过此标准",
        "verify_key": "t1155-abort-availability",
        "evidence_path": "docs/verification/t1149/t1156-current-public-browser.json",
        "evidence_sha256": "9665fccda137ff91280262d1a5a4b818a39d46640157f518352bd4b3c973bf1c"
      }
    ],
    "resume_criteria": "真实机制、两项当場测量、有效hash和真实research_verify_commands通过，纯实现边界不变后恢复；未知期间不猜产品修复。"
  },
  "decision_impacts": [
    "none"
  ],
  "decision_ids": []
}
```

已证明日志存在与功能正常退出同时发生；请求根因、安装影响和取消边界尚UNKNOWN。不改vendor、不屏蔽错误、不强制退出。验收verify key暂未装配，保持researching而非假validated。

两次monitor负观察的原receipt及日志摘要见docs/verification/t1155；无请求栈不代表错误已修，不扩大预算。
