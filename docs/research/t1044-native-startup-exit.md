# T-1044 本地 Codex 启动退出取证

```research-first-gate/v2
{
  "schema": "research-first-gate/v2",
  "task_id": "T-1044",
  "research_task_id": "T-1044",
  "status": "validated",
  "problem_statement": "Codex override 的左侧键不解析 TOML 引号，带引号的 probe 成为另一个无 transport 服务；改为根 mcp_servers 的 TOML inline table，值中的原名保留且安全合并。",
  "failure_family": "codex-native-startup-exit",
  "observed_invariant": "锁版本地运行时必须完成真实 initialize/config 预检后才可称可用。",
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
        "kind": "approved-spec",
        "ref": "docs/features/t1044-local-codex-workbench-integration.md",
        "claim": "发现和启动必须同真值，隔离不可用不伪称实连。"
      },
      {
        "kind": "source-code",
        "ref": "https://github.com/openai/codex/blob/rust-v0.159.3/codex-rs/utils/cli/src/config_override.rs",
        "claim": "parse_overrides 仅原样传递左侧 key，右侧 parse_toml_value 能解析 inline table。"
      }
    ],
    "local": [
      {
        "kind": "test",
        "path": "docs/research/evidence/t1044/native-isolated-probe-home.log",
        "locator": "CODEX_PROCESS_EXITED",
        "observation": "隔离假配置下启动退出，未发送模型请求。"
      }
    ],
    "experiments": [
      {
        "question": "二进制/基础参数是否拒绝握手？",
        "command": "隔离 fake home 官方 app-server initialize 最小 Python 探针",
        "environment": "临时 fake home，不读取用户认证，不发送 turn/start",
        "result": "exitCode=0、两条握手帧；基础启动不是原因。",
        "artifact_path": "docs/research/evidence/t1044/native-startup-diagnostic.json",
        "artifact_sha256": "8d6b2af16154ea1e425e4d614694cecafd07e3a2a4173c31ec4c395cd198bddc"
      },
      {
        "question": "引用服务名的 key 编码与 inline-table value 编码是否导致不同启动结果？",
        "command": "pnpm --dir frontend exec tsx 临时 protocol 拷贝 probe.ts / probe-fixed.ts（同一编码差分实验）",
        "environment": "临时 fake home 与已知三种假 MCP 名；所有诊断仅来自无凭据夹具",
        "result": "带引号 key invalid transport；inline table 完成 initialize/config/account/thread/MCP 校验，全部 disabled，无模型 turn。",
        "artifact_path": "docs/research/evidence/t1044/native-startup-encoding-fixed.log",
        "artifact_sha256": "a5f67e9e4a825faccbcc5e9ae5221dbe03359d61d35083cbc6e400dc08461ace"
      }
    ]
  },
  "options": [
    {
      "id": "OPT-1",
      "outcome": "保持原参数与隔离要求，读假环境的进程诊断定位启动机制。",
      "tradeoffs": "只做一次最小探针。",
      "scope": "原生启动，不改产品合同。",
      "falsified_by": "原生启动无法支持已批准接口。"
    },
    {
      "id": "OPT-2",
      "outcome": "根 mcp_servers TOML inline table 按实际原名仅覆盖 enabled=false，再读配置和运行时状态确认。",
      "tradeoffs": "依据具体诊断修正后重测。",
      "scope": "不退回旧不安全ACP或扩大权限。",
      "falsified_by": "真实配置/线程复核仍存在非 disabled MCP。"
    }
  ],
  "recommendation": "OPT-2",
  "validation": {
    "timebox_minutes": 20,
    "max_experiments": 2,
    "acceptance_criteria": [
      {
        "name": "实际启动原因",
        "target": "真实故障机制已定位到错误 override key",
        "measurement": "假环境进程原始诊断及基础握手对照",
        "observed": "invalid transport in mcp_servers.\"probe\"；基础握手成功",
        "verify_key": "t1044-native-diagnostic",
        "evidence_path": "docs/research/evidence/t1044/native-startup-mechanism.log",
        "evidence_sha256": "27f4635b108a8411feca8bb43c9e2093e455405c85fec8223ff830a1e63e39f0"
      },
      {
        "name": "编码机制复证",
        "target": "官方运行时接受 inline table 并禁用三种名称 MCP；未发送模型回合",
        "measurement": "同一隔离编码差分探针与公开 thread/start 现场复现",
        "observed": "allMcpDisabled=true，modelTurnSent=false，authenticated=false",
        "verify_key": "t1044-native-isolated",
        "evidence_path": "docs/research/evidence/t1044/native-startup-encoding-fixed.log",
        "evidence_sha256": "a5f67e9e4a825faccbcc5e9ae5221dbe03359d61d35083cbc6e400dc08461ace"
      }
    ],
    "resume_criteria": "确定性原因及两项现场校验通过后恢复。"
  },
  "decision_impacts": [
    "none"
  ],
  "decision_ids": []
}
```

最小编码差分已验证；产品宿主修改后的测试及真实模型回合仍待执行，不把取证等同完整交付。
