# T-1057 · Codex 原生权限合同版本差异

```research-first-gate/v2
{
  "schema": "research-first-gate/v2",
  "task_id": "T-1057",
  "research_task_id": "T-1057",
  "status": "researching",
  "problem_statement": "官方网页展示的受限读取 SandboxPolicy 被随包 0.159.3 command/exec 拒绝，必须核对锁版 permissionProfile 后才能开放原生命令；现有 CodeModeOnly 工具也仍有既有 T1044 未关闭阻断。",
  "failure_family": "codex-native-permission-contract-drift",
  "observed_invariant": "本地 Codex 执行须同时保证真实执行与任务目录访问隔离，不能把私有 cwd 或网页参数冒充生效权限。",
  "trigger_kinds": [
    "external-capability-unknown",
    "high-impact-uncertainty"
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
        "ref": "https://learn.chatgpt.com/docs/app-server",
        "claim": "页面展示 command/exec、sandboxPolicy 与 readOnlyAccess，但须核对运行版本兼容。"
      },
      {
        "kind": "source-code",
        "ref": "https://github.com/openai/codex/blob/01fc69f4026735edfdf6789820549727a4867b11/codex-rs/app-server-protocol/src/protocol/v2/command_exec.rs",
        "claim": "锁版 command/exec 支持命名 permissionProfile，不能与 sandboxPolicy 共用；processId 仅连接级。"
      },
      {
        "kind": "approved-spec",
        "ref": "orchestrator/SYSTEM_ARCHITECTURE.md",
        "claim": "Worker 受控执行，不直接写库，保存经 backend ownership/CAS 服务。"
      }
    ],
    "local": [
      {
        "kind": "code",
        "path": "ai-worker/src/execution/codex-app-server.ts",
        "locator": "codexThreadParameters/DISABLED_FEATURES",
        "observation": "read-only + environments=[]，shell/unified_exec/code-mode/view_image 被关闭。"
      },
      {
        "kind": "runtime",
        "path": "docs/verification/t1057/command-probe-result.json",
        "locator": "error",
        "observation": "命令执行前拒绝 workspaceWrite.readOnlyAccess，并明确要求 permissionProfile。"
      },
      {
        "kind": "test",
        "path": "docs/research/t1044-native-dynamic-tool-disabled.md",
        "locator": "researching",
        "observation": "T1044 真实模型 CodeModeOnly host禁用时工具调用 count=0 的既有门尚未关闭；本轮未复跑。"
      }
    ],
    "experiments": [
      {
        "question": "随包运行时能否在隔离目录按网页参数执行脚本并拒绝越界读取？",
        "command": "node docs/verification/t1057/command-probe.mjs（初版）",
        "environment": "macOS arm64 0.159.3，fake HOME/CODEX_HOME，不使用认证、不发送模型请求",
        "result": "RPC timeout；fake CODEX_HOME 未预建且未捕获进程退出，机制未确认",
        "artifact_path": "docs/verification/t1057/command-probe-first-result.json",
        "artifact_sha256": "1d7f3373d3c7b7de63ad710d57db5fa51b6854b6e0c456fdbed5cd36e419fcf0"
      },
      {
        "question": "预建隔离目录并捕获退出后，网页权限参数是否在锁版实际生效？",
        "command": "node docs/verification/t1057/command-probe.mjs",
        "environment": "同版本平台，私有任务目录和非敏感目录外 sentinel，fake auth，无模型 turn",
        "result": "初始化完成；command/exec 因废弃 readOnlyAccess 参数被拒绝。脚本及越界读取均未执行，无权限成功证据",
        "artifact_path": "docs/verification/t1057/command-probe-result.json",
        "artifact_sha256": "49dead3db9589026205d7d9e73becef6c4cfff8582789e8cdf39891e9260c0dd"
      }
    ]
  },
  "options": [
    {
      "id": "OPT-1",
      "outcome": "直接按网页参数扩大 native shell 权限",
      "tradeoffs": "最短代码但锁版已拒绝，不可实施；不能退到 full-access 绕过隔离",
      "scope": "原生执行参数",
      "falsified_by": "当前隔离探针已确认不兼容"
    },
    {
      "id": "OPT-2",
      "outcome": "保持当前生产边界，只读核对锁版命名 profile / code-mode host /平台权限；完整具体合同经用户决策与独立评审后实施",
      "tradeoffs": "需要统一路由与真实平台验证；暂不声称全部执行已经完成",
      "scope": "T1057 新合同，先解释模型分类和真实缺口；不重放既有模型/命令",
      "falsified_by": "锁版/目标平台不存在可保持原合法创作任务的受限执行机制"
    }
  ],
  "recommendation": "OPT-2",
  "validation": {
    "timebox_minutes": 40,
    "max_experiments": 2,
    "acceptance_criteria": [
      {
        "name": "允许目录内真实脚本执行",
        "target": "命名权限 profile 下 exitCode=0，实际输出真实可读",
        "measurement": "随包锁版 command/exec 真正执行无副作用验证脚本并读回",
        "observed": "未通过；第二次在命令执行前被拒绝",
        "verify_key": "t1057-command-allowed（验证机制确定后登记，不执行假校验）",
        "evidence_path": "docs/verification/t1057/command-probe-result.json",
        "evidence_sha256": "49dead3db9589026205d7d9e73becef6c4cfff8582789e8cdf39891e9260c0dd"
      },
      {
        "name": "越界读取确定性拒绝",
        "target": "目录外 sentinel 不可读取，执行失败退出码实际返回",
        "measurement": "同一真实命名 profile 的非敏感 sentinel 读取对照",
        "observed": "未验证；命令均未执行，不能把输入拒绝当成目录隔离",
        "verify_key": "t1057-command-restricted（验证机制确定后登记，不执行假校验）",
        "evidence_path": "docs/verification/t1057/command-probe-result.json",
        "evidence_sha256": "49dead3db9589026205d7d9e73becef6c4cfff8582789e8cdf39891e9260c0dd"
      }
    ],
    "resume_criteria": "两次实验已用完，不重复全量或追加 workaround。采用保持生产边界的可逆默认，继续只读取证；所提底层命令范围、锁版权限合同、T1044 code-mode 工具阻断及平台验收路径闭合后记录 DEC 与独立复审，再登记可执行验证键并按研究门恢复。"
  },
  "decision_impacts": [
    "contract",
    "security",
    "release-criteria"
  ],
  "decision_ids": [
    "DEC-T1057-01"
  ]
}
```

两次实验没有成功执行命令。本轮保留生产边界；用户要求的全链路统一尚未实现。
