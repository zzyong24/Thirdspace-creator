# T-1070：原画布已显示后候选首帧泄漏的有界研究

问题只有一个：为什么真实同页首帧是0，而独立渲染是1秒？原工程保持revision4，不重发AI、不CAS。

```research-first-gate/v2
{
  "schema": "research-first-gate/v2",
  "task_id": "T-1070",
  "research_task_id": "T-1070",
  "status": "validated",
  "problem_statement": "新bundle独立六族render正常，但实际React同页热过原片画布后cut1候选首帧仍source0。已通过CDP核执行bundle58f42真实，非旧缓存；需一个区分warm并发decoder/其他render缓存的原始最小探针，不继续猜改。",
  "failure_family": "native-warm-preview-first-frame",
  "observed_invariant": "裁掉开头1秒的5秒候选，首帧应source1.000/frame24，不能泄漏source0/frame0。",
  "trigger_kinds": [
    "unsuccessful-intervention-churn"
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
        "kind": "approved-spec",
        "ref": "docs/features/t1070-director-script-workflow.md",
        "claim": "preview frozen候选真实MP4，不改原工程；裁剪的帧必须对应实际source时间。"
      },
      {
        "kind": "source-code",
        "ref": "frontend/public/reference-editors/sources/opencut-classic/native-from-t1046.patch",
        "claim": "原video service在同服务上提供getFrame，存在主画布与candidate并行缓存消费者。"
      }
    ],
    "local": [
      {
        "kind": "runtime",
        "path": "docs/verification/t1070/native-browser-frame-closure-executed-native-evidence.json",
        "locator": "executed CDP native script3230 sha256",
        "observation": "6735098bytes/58f42实际执行，且isFrameValid patch存在。"
      }
    ],
    "experiments": [
      {
        "question": "decoder给出错误首帧，还是同Canvas身份GPU缓存遗漏已变像素？",
        "command": "仅隔离logging副本native mounted原画布frame0，随后原public preview-scene trim1；记录decoded timestamp/Canvas像素/GPUupload事件；warm-instrumented-result.json",
        "environment": "BASE/t1070-native-candidate私有browser/neutral6sAV；不AI，不owner写，不改生产bundle。",
        "result": "frame time1/timestamp1/canvasId2/pixels2956356774已新画面，GPUcache identityHit=true且lastUploadedPixels1473438556仍frame0；next1.041换Canvas5才上传。",
        "artifact_path": "docs/verification/t1070/native-warm-root-cause.json",
        "artifact_sha256": "ced96f01939fabd9557bc2d3e270f849b2ba38450b29f3f651303f7c3eb42862"
      }
    ]
  },
  "options": [
    {
      "id": "OPT-1",
      "outcome": "保原共享decoder，修具体warm并发帧读时序",
      "tradeoffs": "需源事件/实际同页状态证明，不引入runtime",
      "scope": "原已准入native video service与build闭包",
      "falsified_by": "warm同页trace证明decoder给的是frame24且下游画布缓存仍frame0。"
    },
    {
      "id": "OPT-2",
      "outcome": "修preview/export原renderer具体第一次绘制缓存",
      "tradeoffs": "只改已确认实际消费者，不泛清媒体缓存",
      "scope": "同原renderer消费者；新源成员必须再精确准入",
      "falsified_by": "trace证明renderer第一次就收到frame0，错误在上游decoder。"
    }
  ],
  "recommendation": "OPT-2",
  "validation": {
    "timebox_minutes": 120,
    "max_experiments": 2,
    "acceptance_criteria": [
      {
        "name": "实际decoder返回目标帧",
        "target": "time1时timestamp1、像素与0秒不同",
        "measurement": "具体原时序trace n3/16",
        "observed": "timestamp0→1且pixels1473438556→2956356774，同Canvas2",
        "verify_key": "t1070-warm-decoder",
        "evidence_path": "docs/verification/t1070/native-warm-root-cause.json",
        "evidence_sha256": "ced96f01939fabd9557bc2d3e270f849b2ba38450b29f3f651303f7c3eb42862"
      },
      {
        "name": "实际GPU缓存解释错首帧",
        "target": "同Canvas源像素变化但oldidentity缓存不上传",
        "measurement": "原trace n6/18/19/24/25",
        "observed": "n18 identityHit true、上传像素仍1473438556；下一新Canvas5 identityHit false并upload",
        "verify_key": "t1070-warm-gpu-cache",
        "evidence_path": "docs/verification/t1070/native-warm-root-cause.json",
        "evidence_sha256": "ced96f01939fabd9557bc2d3e270f849b2ba38450b29f3f651303f7c3eb42862"
      }
    ],
    "resume_criteria": "源因已具体证明，采用必要7archive源成员真实timestamp内部版本传播；范围独评GO后按taskctl start原任务，进入原TDD/构建/同页验收；不改变行为/owner/公共合同。"
  },
  "decision_impacts": [
    "none"
  ],
  "decision_ids": [
    "DEC-T1070-NATIVE-PIXEL-VERSION"
  ],
  "authority_note": "按用户AGENTS状态只用taskctl block/start，不让research工具另写状态；本卡为同T1070故障证据，不另建任务/范围/产品决定。"
}
```

本研究validated仅表示错帧机制已证明，非修复/验收PASS。状态全由用户要求的taskctl管理，不用其他工具改看板。
