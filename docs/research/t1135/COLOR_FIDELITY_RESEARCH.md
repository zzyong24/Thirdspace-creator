# T1135 · 中性主轨导出压暗的研究卡

研究门登记晚于三组既已执行诊断，这是过程缺口，不能补拍前置PASS、声称只发生两次实验或借新卡重置实验预算。以下披露全部既有诊断；未来新增实验预算为0。只读分析继续，产品修改和完整重跑暂停。

```research-first-gate/v2
{
  "schema": "research-first-gate/v2",
  "task_id": "T-1135",
  "research_task_id": "T-1135",
  "status": "researching",
  "problem_statement": "正式成片和当前完整私有执行复现无调色工程系统压暗。孤立输入和PNG编码不能复现；捕帧或实际编码输入机制尚不明确。",
  "failure_family": "neutral-video-composition-color-fidelity",
  "observed_invariant": "无用户调色或可选图层的主轨导出应保持原画面可辨识的颜色。",
  "trigger_kinds": [
    "external-capability-unknown",
    "violated-invariant"
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
        "kind": "official-doc",
        "ref": "https://www.ffmpeg.org/ffmpeg-filters.html",
        "claim": "标签与像素转换不同，标签差异不能单独确定根因。"
      },
      {
        "kind": "source-code",
        "ref": "backend/src/modules/execution/video-render/executor.ts",
        "claim": "准备输入后由HyperFrames唯一视频编码，最终视频stream copy。"
      }
    ],
    "local": [
      {
        "kind": "log",
        "path": "docs/verification/t1135/installed-neutral-media-verification.json",
        "locator": "245帧及三处原对应画面",
        "observation": "安装成片正式exact-file解码0，背景17/36/57变为0/19/44。"
      },
      {
        "kind": "test",
        "path": "docs/verification/t1135/private-current-render-stage-colors.json",
        "locator": "三阶段",
        "observation": "研究卡之前第三组完整私有执行已经结束：prepared15/35/56，raw与final3/22/43；原App任务未重发，未改App/库/模型。"
      }
    ],
    "experiments": [
      {
        "question": "孤立输入处理能否解释色差",
        "command": "真实argv见isolated-color-stage-counterevidence.json",
        "environment": "固定源文件/0700私有目录",
        "result": "两变体15/36/56，未复现原系统压暗",
        "artifact_path": "docs/verification/t1135/isolated-color-stage-counterevidence.json",
        "artifact_sha256": "5443e2b94ee9182642c7b7d5aa07418b8359997ce4bde3e538551e82113dfbee"
      },
      {
        "question": "孤立PNG软件编码能否解释色差",
        "command": "真实argv及调用错误保留encoder-mechanical-commands/readback.json",
        "environment": "固定PNG/0700私有目录/libx264",
        "result": "三变体均17/36/57，未复现；先前无效duration和YUV crop错误保留，不算产品RED",
        "artifact_path": "docs/verification/t1135/encoder-mechanical-readback.json",
        "artifact_sha256": "d0e8cc7a8aacb8393f06a76715beb725dfa1e0eab4c61f0b5f051819beff6d23"
      }
    ]
  },
  "options": [
    {
      "id": "OPT-INPUT",
      "outcome": "调整输入归一",
      "tradeoffs": "目前孤立反证不支持，暂不实施",
      "scope": "executor输入准备",
      "falsified_by": "单独输入接近原色，完整合成压暗"
    },
    {
      "id": "OPT-CAPTURE",
      "outcome": "核对实际帧注入/捕获/编码输入衔接后修复",
      "tradeoffs": "需要明确根因，不靠加亮常量补偿",
      "scope": "现有渲染捕帧与编码衔接",
      "falsified_by": "捕获像素与prepared一致，只在编码后偏暗"
    }
  ],
  "recommendation": "OPT-CAPTURE",
  "validation": {
    "timebox_minutes": 120,
    "max_experiments": 2,
    "acceptance_criteria": [
      {
        "name": "阶段事实绑定",
        "target": "同一sourceSHA、中间/最终实测与真实退出码",
        "measurement": "已有收据及只读现存文件核验，不新增完整运行",
        "observed": "prepared15/35/56，raw/final3/22/43；根因未闭合",
        "verify_key": "t1135-color-stage-binding",
        "evidence_path": "docs/verification/t1135/private-current-render-stage-colors.json",
        "evidence_sha256": "aac53b45a796f6e4e3b28e73c43c21c8c3d32ecb21786711a153b35fdd1d3a65"
      },
      {
        "name": "原任务边界",
        "target": "无App任务重发/库/模型写入",
        "measurement": "私有taskID与内存ports，原App未调用",
        "observed": "私有完整执行56.46秒exit0，尚非安装修复",
        "verify_key": "t1135-color-diagnostic-boundary",
        "evidence_path": "docs/verification/t1135/private-current-render-command.json",
        "evidence_sha256": "38393c49f1208f8a945ddb588f33ac85401d583702f732c8854416873a94450e"
      }
    ],
    "resume_criteria": "只读机制闭合、精确修复SPEC独评和真实research消费者验证；现在不新增实验/完整重跑"
  },
  "decision_impacts": [
    "none"
  ],
  "decision_ids": [],
  "preGateExecutionDisclosure": {
    "gateOpenedLate": true,
    "independentDiagnosticGroupsAlreadyExecuted": 3,
    "thirdGroup": "完整私有执行15:22:16开始、15:23:12结束，在研究卡建立前实际发生；阶段证据在local登记；不声称前置GatePASS",
    "remainingNewExperimentsAllowed": 0,
    "formalResumeNotYetAdmissible": true
  }
}
```

大白话：完整合成阶段开始变暗，还需要核对实际取帧/显示和编码输入；目前不能直接加亮背景或更改原素材。

```mermaid
flowchart LR
 A[原色17/36/57] --> B[prepared15/35/56]
 B --> C[HyperFrames捕帧及编码3/22/43]
 C --> D[视频无损整理3/22/43]
```
