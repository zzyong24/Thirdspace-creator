# T-1062 本地ASR尾部时间码同源研究

```research-first-gate/v2
{
  "schema": "research-first-gate/v2",
  "task_id": "T-1062",
  "research_task_id": "T-1062",
  "status": "validated",
  "problem_statement": "两份真实16k PCM口播的local Whisper word/segment末尾时间码越有效样本；禁止猜点/钳制后仍需完成粗剪实际验收",
  "failure_family": "local-asr-provider-tail-clock",
  "observed_invariant": "真实ASR时间范围必须属于原不可变音频有效样本且源时钟机械映射精确；文本成功不可代签词句或pause_gap可用",
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
        "ref": "ai-worker/src/runtime/asr-provider-timing.ts",
        "claim": "asr-provider-timing.ts第4–6行：真实十进制秒精确映射到样本，不补写或钳制；合同逐项核有效范围"
      },
      {
        "kind": "source-code",
        "ref": "contract/src/internal/asset-asr-timing.ts",
        "claim": "asset-asr-timing.ts第28行：越validSampleCount必须拒绝timing"
      },
      {
        "kind": "approved-spec",
        "ref": "docs/features/t1062-rough-cut-contract.md",
        "claim": "无有效时码保留全文与原片、手工路径，不能猜词句或停顿切点"
      }
    ],
    "local": [
      {
        "kind": "log",
        "path": "docs/verification/t1062/preflight/asr/word-result.json",
        "locator": "rawProviderOutput.chunks",
        "observation": "原PCM228939samples，raw尾17.14s越有效14.3086875s"
      },
      {
        "kind": "log",
        "path": "docs/verification/t1062/preflight/real-asr-alternate-probe.json",
        "locator": "mode_results",
        "observation": "独立PCM306587samples，word19.4s/segment19.56s越有效19.1616875s"
      },
      {
        "kind": "log",
        "path": "orchestrator/research/t1062-asr-timing/real-asr-timing-diagnosis.json",
        "locator": "observations/determinations",
        "observation": "四negative均raw已有越界；样本/clock一致，词级heads启用；依赖frame域候选仍未捕获实际tensor证明"
      }
    ],
    "experiments": [
      {
        "question": "同一真实attention能否区分num_frames帧域错与不可修正provider时间码？",
        "command": "node --max-old-space-size=2048 /tmp/t1062-asr-timing-observation/observe.cjs /tmp/t1062-asr-timing-observation/capture-one；随后两个无模型verify-r2 evidence/timing",
        "environment": "PATH node（原回执未冻结实际Node版本；本次核实为v25.9.0）；esbuild target node24、transformers2.17.2、固定mono16k s16/306587samples、模型原件与独立cache7SHA、fetchdeny、1pipeline/1generate；76,459,164B tensor捕获。",
        "result": "observe0；初版offline2次ESM初始化失败exit1保留；R2仅修标准入口导入顺序，两criterion0。支持窄机械OPT1，segment误差/worker/public/安装仍待验。",
        "artifact_path": "orchestrator/research/t1062-asr-timing/replay-verification.json",
        "artifact_sha256": "08d020ab757ebdbeb86c6e9e68bae46f3c4d5162d62b2675c4338d38fe8a1724"
      }
    ]
  },
  "options": [
    {
      "id": "OPT-1",
      "outcome": "若同源观测证明feature→attention crop域错，用真实模型stride在现有provider适配器精确修正frame输入；原raw/失败保留",
      "tradeoffs": "只允许机械时间单位修正，须独立scope+实际provider/合同/公共链回归",
      "scope": "既有本地ASR映射接口；不升级库、不clamp尾部、不新增第二transcript",
      "falsified_by": "实际tensor域不支持该推导或同tensor正确crop仍越界"
    },
    {
      "id": "OPT-2",
      "outcome": "若无法证明合法机械修正，保留原provider、文本与手工/review_only降级，词句成功仍待验",
      "tradeoffs": "维持合法创作/保存导出可用；不得称ChatCut词级等效或ASR Gate通过",
      "scope": "已批准无时码降级；不新增时间码或放宽验证",
      "falsified_by": "实际范围未通过而界面允许词句采用/停顿采用"
    }
  ],
  "recommendation": "OPT-1",
  "validation": {
    "timebox_minutes": 60,
    "max_experiments": 2,
    "acceptance_criteria": [
      {
        "name": "同源时钟与实际tensor域",
        "target": "固定alternate WAV的hash/rate/count不变，记录实际num_frames、attention维、model encoder stride/tokens；不能由配置猜实际维",
        "measurement": "一次离线模型instrumentation及捕获结果程序验证",
        "observed": "一次真实观测feature3000/encoder1500/cross1500，原1916请求与20ms attention帧域不一致，实际crop958；源与模型hash未变，network0。",
        "verify_key": "t1062-asr-tail-clock-evidence",
        "evidence_path": "orchestrator/research/t1062-asr-timing/observation.json",
        "evidence_sha256": "68e088a43661cc543edba4ed7d685f9e479da04eafd5d1ea1e29a592fbe94dd0"
      },
      {
        "name": "不改原证据的机械提取或安全拒绝",
        "target": "同一captured tensors离线legacy/真实stride crop回放，逐项raw ID/units/order/bounds核验；仍越界就拒绝timing，保留全文/manual并不标词句通过",
        "measurement": "无需model的离线assert及真实合同校验，输出实际positive/negative/unknown",
        "observed": "离线R2两个命令exit0；原timestamp bytes/raw/text完全一致，原timing负保留；真实stride crop65ranges严格通过，末306240≤306587；无clamp。",
        "verify_key": "t1062-asr-tail-clock-timing",
        "evidence_path": "orchestrator/research/t1062-asr-timing/replay-verification.json",
        "evidence_sha256": "08d020ab757ebdbeb86c6e9e68bae46f3c4d5162d62b2675c4338d38fe8a1724"
      }
    ],
    "resume_criteria": "已区分frame域候选并明确纯实现修正或现有合法降级；两criterion当场命令通过，真实ASR正例/公共冻结/原生采用仍分别待验，不以研究resume代签"
  },
  "decision_impacts": [
    "none"
  ],
  "decision_ids": [],
  "bounded_capture_plan": {
    "input": "/tmp/creatoros-t1062-asr-alternate-preflight-20261005/audio.wav",
    "input_sha256": "245b1ad0dec735444d10a741ece8414bca9359da25ba2ed4f0983c92ac55c252",
    "valid_sample_count": 306587,
    "sample_rate": 16000,
    "model_calls": 1,
    "new_decodes": 0,
    "network_calls": 0,
    "full_real_cross_attention_max_bytes": 134217728,
    "max_tokens": 448,
    "max_source_dimension": 1500,
    "no_fake_weights": true,
    "overflow_policy": "Unknown并停止，无重跑/扩捕获",
    "replay_rule": "原config/alignment heads/sequences/layout/dtype完整保留，离线legacy timestamps逐字节等于原捕获；真实frame比例须feature/attention维与原配置双核",
    "prepared_by": "startup_group_scope_audit",
    "execution_authorized": true,
    "authorized_by": "ROOT，用户既有验证授权下的唯一同源观测",
    "commands": [
      "node /tmp/t1062-asr-timing-observation/build.mjs",
      "node --max-old-space-size=2048 /tmp/t1062-asr-timing-observation/observe.cjs /tmp/t1062-asr-timing-observation/capture-one"
    ],
    "prepared_manifest": "/tmp/t1062-asr-timing-observation/prepared-manifest.json",
    "actual_model_calls": 1,
    "actual_capture_bytes": 76459164
  },
  "independent_review": {
    "path": "orchestrator/research/t1062-asr-timing/t1062-asr-timing-independent-review.json",
    "sha256": "902fdc926f42c46906560b0d3ee192e6c0b6550d73dc91280488d00bb70561dd",
    "status": "RESEARCH_CRITERION_PASS_OPT1_ELIGIBLE"
  },
  "runtime_environment_correction": {
    "at": "2026-10-05T05:58:52.914203+00:00",
    "actual_current_exec_path": "/opt/homebrew/bin/node",
    "actual_current_version": "v25.9.0",
    "desktop_required_major": 25,
    "source": "frontend/scripts/desktop/node-runtime.mjs REQUIRED_NODE_MAJOR=25",
    "historical_limit": "研究命令的node通过PATH解析，但原metadata缺execPath/version，不能把build target node24当成历史执行版本。原原件不改写，新实际worker回归将冻结真实版本。"
  }
}
```

已执行唯一同源观测和R2离线重放；独立最终研究评审通过，现场resume exit0，两项无模型criterion再次实跑通过，已由taskctl重新start。产品writer21个WIP完整保留，lease已释放；未替换客户端或读取用户数据库。
