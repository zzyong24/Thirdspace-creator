# T-1044 本机模型工具模式阻断

```research-first-gate/v2
{
  "schema": "research-first-gate/v2",
  "task_id": "T-1044",
  "research_task_id": "T-1044",
  "status": "researching",
  "problem_statement": "真实本机模型在已批准的 code_mode_host=false 下拒绝调用已注册 dynamicTools；模型工具模式优先于 features.code_mode=false。",
  "failure_family": "codex-native-dynamic-tool-disabled",
  "observed_invariant": "本地 Codex 必须能够沿任务受控工具读取与产候选；禁止把仅有正文回执称为工具集成通过。",
  "trigger_kinds": [
    "external-capability-unknown"
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
        "ref": "docs/features/t1044-local-codex-workbench-integration.md",
        "claim": "FR-1044-6 当前明确关闭 code_mode/code_mode_host，工具仅走任务授权 dynamicTools。"
      },
      {
        "kind": "source-code",
        "ref": "https://github.com/openai/codex/blob/rust-v0.159.3/codex-rs/core/src/tools/mod.rs#L68-L88",
        "claim": "requested_tool_mode 优先取 model_info.tool_mode；CodeModeOnly 不走 Direct 降级。"
      },
      {
        "kind": "source-code",
        "ref": "https://github.com/openai/codex/blob/rust-v0.159.3/codex-rs/code-mode/src/remote_session.rs#L80-L93",
        "claim": "DisabledCodeModeSessionProvider 返回 code-mode host is disabled。"
      }
    ],
    "local": [
      {
        "kind": "test",
        "path": "docs/research/evidence/t1044/native-dynamic-real-probe.log",
        "locator": "count=0",
        "observation": "当前官方0.159.3/本机登录和模型：单一只读验收工具无调用，正文报告code-mode host禁用。"
      },
      {
        "kind": "public-api",
        "path": "docs/research/evidence/t1044/native-ui-messages.json",
        "locator": "chat:ai-msg-873c2aca-94",
        "observation": "真实业务回合回复读取未完成，无工具卡；succeeded仅代表模型终态。"
      }
    ],
    "experiments": [
      {
        "question": "是否只是CreatorOS业务工具过滤导致读取无法执行？",
        "command": "pnpm --filter @creatoros/backend exec tsx /tmp/t1044-dynamic-probe.mts",
        "environment": "官方锁版/本机模型，独立单工具read_probe，environments=[]，既有关闭参数；未开放业务写入",
        "result": "业务owner之外同样count=0，返回code-mode host is disabled，排除owner筛选为此阻断原因。",
        "artifact_path": "docs/research/evidence/t1044/native-dynamic-real-probe.log",
        "artifact_sha256": "b3411b4811292e076efd9500998fa1d52603baedeceebab15bb9c21875b7b100"
      }
    ]
  },
  "options": [
    {
      "id": "OPT-1",
      "outcome": "保持host关闭，先核实本机模型是否能使用Direct工具模式；不能则诚实不可用。",
      "tradeoffs": "不修改全局配置，不静默换模型；当前实测模型无法读项目。",
      "scope": "保持现有合同。",
      "falsified_by": "供应商公开支持同模型安全Direct模式且实测工具可调用。"
    },
    {
      "id": "OPT-2",
      "outcome": "经用户确认和独立复审后，允许随包锁版code-mode host仅在无执行环境的线程内编排已授权dynamicTools。",
      "tradeoffs": "新增模型代码编排runtime，必须核实文件/网络/命令无旁路，取消进程树与平台包/许可闭包；验证前不可称安全完成。",
      "scope": "仅CreatorOS任务进程覆盖参数，保留所有MCP/apps/plugins/hooks/native shell等关闭及owner采纳边界。",
      "falsified_by": "存在任何不经受控工具的宿主数据I/O，或配套锁版host不完整。"
    }
  ],
  "recommendation": "OPT-2",
  "validation": {
    "timebox_minutes": 40,
    "max_experiments": 2,
    "acceptance_criteria": [],
    "resume_criteria": "用户确认DEC、供应商能力与无旁路证据、独立复审和可执行验证通过后恢复，不把仅注册工具当作调用成功。"
  },
  "decision_impacts": [
    "security",
    "contract"
  ],
  "decision_ids": [
    "DEC-T1044-02"
  ]
}
```
