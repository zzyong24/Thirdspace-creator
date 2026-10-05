# SPEC Review — current

- Task: T-1057
- Verdict: CONCERNS
- Round: 1/3 (initial)
- Spec receipt: 2de0599221fb
- Review receipt: bd24aad65a0b

## 当前有效问题

| ID | 严重度 | 需求锚点 | 失败模式 | 来源 |
|---|---|---|---|---|
| REV-001 | major | FR-1057-4 | 底层命令范围仍待用户答复，且入口矩阵尚未落到每个确定性命令的调用 owner 和同步返回语义。现有素材写入/上传完成的 putObject/headObject 会运行 ffprobe，缺失或失败安全返回 null；手工保存由原服务/CAS 执行。若实现者把这些入口统一挂到 Codex 模型登录、生成 admission、未验证 profile 或统一候选采用门下，会把原来可完成的上传、元信息读取或保存升级为整单失败。FR-1057-5 对创作候选和确定性文件处理也尚未说明各自原有保存后置条件。 | baseline |
| REV-002 | major | FR-1057-5 | 当前只有 permissionProfile 名称要求，未确定锁版 profile 的宿主构造/注入、真实生效读回、任务目录与必要运行库/权重的读写根、命令网络策略和线程/独立命令的参数差异。第二次探针在旧权限参数校验处被拒绝，未执行命令。锁版 command env 为合并服务器环境，不能凭传入少量键保证裁剪；现 Codex 宿主环境允许 OPENAI_API_KEY/CODEX_HOME。若复用此环境给新原生命令，FR-1057-5 的凭据与跨目录隔离无法据现证据成立；若一概拒绝所有依赖根，又会破坏 ffmpeg/Whisper/渲染合法调用。这里是未验证合同缺口，不声称已经发生泄漏。 | baseline |
| REV-003 | major | FR-1057-2 | 合同未区分任务创建时请求/配置身份与 thread/start 返回的实际 model/modelProvider，也未定义 model catalog/视觉/CodeModeOnly 能力及供应商授权的 admission 判据、配置漂移后的拒绝/保持规则。官方 thread/start 可指定 provider、允许模型回退并返回实际身份，模型分级授权仍由服务器负责；当前 NativeTurnResult 和 externalChatReceipt 没有 model/provider 字段，旧 API identity 还强制依赖 workerModelSpec。仅把 actualEngine 写 codex 或把配置名称当实际身份无法满足冻结及两类媒体配置的前提，恢复时也不能证明继续同一执行身份。 | baseline |
| REV-004 | major | FR-1057-6 | FR-1057-6 描述 unknown 原则，但没有把新非聊天模型任务与独立 command 映射到原 call 的唯一状态转换及结算后置条件。已有 external-chat owner 绑定 conversation/sourceMessage，不能当通用任务服务；其原成功结算必须确认子工具无 unknown。独立命令的 processId 是客户端预先提供、连接级标识，不存在可跨连接读取的历史 turn。发送后丢入场/完成回执、子工具 unknown、取消未确认、原租约失效及断连后的迟到输出，若未定义写前记录和唯一提交条件，可能被当作尚未执行重放，或只凭 turn completed/exitCode=0错误提交领域结果。 | baseline |

已销账：—

```spec-review-state
{
  "schema": "spec-review-state/v2",
  "task_id": "T-1057",
  "cycle": 1,
  "round": 1,
  "max_rounds": 3,
  "review_kind": "initial",
  "verdict": "CONCERNS",
  "summary": "合同候选尚不能进入生产实现。全入口矩阵、两类媒体模型的条件性推论及失败证据记录清楚，物理边界方向无新增冲突；但底层命令范围与旧上传保存可用性、锁版权限及命令环境、Codex 模型身份与授权、非聊天/独立命令的未知结果结算尚未闭合。两次探针均 checks=[]、passed=false，不能证明允许目录执行或越界拒绝。本轮实验额度已用完、研究门已暂停；增补措辞不能替代真实权限与全链验证，不给出通过结论。",
  "spec_path": "docs/features/t1057-codex-execution-routing.md",
  "spec_sha256": "2de0599221fb47c8aaf74f437c1fc0ba7e8af460557df171e79d17ffcaeb480b",
  "constitution_path": "orchestrator/SYSTEM_ARCHITECTURE.md",
  "constitution_sha256": "3efbb0394b8bcc9eb3c9ad7e8c9364df51e336006b862e02ac71fd6c9327971e",
  "review_path": "docs/features/t1057-codex-execution-routing.review.md",
  "review_mode": "independent",
  "model": "inherited-root",
  "policy": "convergent-review/v2",
  "cycle_authorization": null,
  "latest_event_hash": "4e2fd09aa16b60847301cd48b9293989c9af63ee95ac2d3656cbdc1e150177aa",
  "open_findings": [
    {
      "id": "REV-001",
      "status": "open",
      "severity": "major",
      "category": "scope",
      "requirement_anchor": {
        "id": "FR-1057-4",
        "quote": "建议范围包括创作代码，以及 ffmpeg、Whisper 解码/转写、下载、探针与渲染等任务命令；这一底层范围已向用户提出具体澄清，答复未到前不把建议记为确认。"
      },
      "acceptance_anchor": {
        "id": "FR-1057-7",
        "quote": "候选审读/采用、来源冻结、CAS、budget、lease/fence 和原公共调用链读回；禁止新增质量门把原合法输出整单反杀。"
      },
      "where": "docs/features/t1057-codex-execution-routing.md:57-69、79-85；backend/src/modules/assets/localfs-object-storage.ts:91-115、203-211、257-301；assets.service.ts:650-691",
      "failure_mode": "底层命令范围仍待用户答复，且入口矩阵尚未落到每个确定性命令的调用 owner 和同步返回语义。现有素材写入/上传完成的 putObject/headObject 会运行 ffprobe，缺失或失败安全返回 null；手工保存由原服务/CAS 执行。若实现者把这些入口统一挂到 Codex 模型登录、生成 admission、未验证 profile 或统一候选采用门下，会把原来可完成的上传、元信息读取或保存升级为整单失败。FR-1057-5 对创作候选和确定性文件处理也尚未说明各自原有保存后置条件。",
      "evidence_kind": "deterministic-check",
      "evidence_ref": "SPEC FR-1057-4 明示底层范围未确认；backend/src/modules/assets/localfs-object-storage.ts probeMedia 错误返回 EMPTY_PROBE，putObject/headObject 调用；assets.service.ts completeUpload 同步 headObject 后原事务完成。",
      "risk_class": "confirmed-requirement",
      "disposition": "escalate",
      "remedy_type": "clarify",
      "scope_effect": "none",
      "origin": "baseline",
      "origin_ref": "T-1057 initial independent contract review",
      "suggestion": "待原异步范围问题得到直接用户答复后，锁定逐命令的入口、owner、触发条件、原同步/后台返回、执行通道与产物保存语义。明确模型 turn 的登录 admission 与不请求模型的 command 通道分别判定；元信息探针不可用仍保持真实 null 和原合法上传，手工服务保存不附加 Codex 登录或模型门。对已确认需迁移的命令，不以普通 spawn 冒称 Codex，也不自动换 Pi；确定性派生产物继续经原 owner 保持幂等及安全降级。范围澄清前保持生产 write_set 不开放。",
      "resolution_evidence": "",
      "parent_id": "",
      "threat_model_id": ""
    },
    {
      "id": "REV-002",
      "status": "open",
      "severity": "major",
      "category": "completeness",
      "requirement_anchor": {
        "id": "FR-1057-5",
        "quote": "文件系统策略必须由锁版 `permissionProfile` 的真实受限读写机制落实；私有 cwd 或 workspace-write 名称本身不能替代访问隔离。"
      },
      "acceptance_anchor": {
        "id": "FR-1057-7",
        "quote": "每个业务脚本/命令的实际 Codex 回执；允许目录输出、越界拒绝、网络策略、取消、unknown 不重放。"
      },
      "where": "docs/features/t1057-codex-execution-routing.md:64-67；docs/verification/t1057/command-probe-result.json；ai-worker/src/execution/codex-app-server.ts:52-55；官方锁版 command_exec.rs CommandExecParams.env/permission_profile",
      "failure_mode": "当前只有 permissionProfile 名称要求，未确定锁版 profile 的宿主构造/注入、真实生效读回、任务目录与必要运行库/权重的读写根、命令网络策略和线程/独立命令的参数差异。第二次探针在旧权限参数校验处被拒绝，未执行命令。锁版 command env 为合并服务器环境，不能凭传入少量键保证裁剪；现 Codex 宿主环境允许 OPENAI_API_KEY/CODEX_HOME。若复用此环境给新原生命令，FR-1057-5 的凭据与跨目录隔离无法据现证据成立；若一概拒绝所有依赖根，又会破坏 ffmpeg/Whisper/渲染合法调用。这里是未验证合同缺口，不声称已经发生泄漏。",
      "evidence_kind": "runtime-observation",
      "evidence_ref": "command-probe-first-result.json: PROBE_RPC_TIMEOUT、checks=[]、passed=false；command-probe-result.json: workspaceWrite.readOnlyAccess no longer supported、checks=[]、passed=false；官方 commit 01fc69f4026735edfdf6789820549727a4867b11 command_exec.rs: env overrides merged into server-computed environment、permissionProfile 与 sandboxPolicy 互斥；codexRuntimeEnvironment 和 localCodexWorkerEnv 允许 OPENAI_API_KEY/CODEX_HOME。",
      "risk_class": "confirmed-requirement",
      "disposition": "mitigate",
      "remedy_type": "constraint",
      "scope_effect": "none",
      "origin": "baseline",
      "origin_ref": "T-1057 two bounded command probes and pinned protocol source",
      "suggestion": "先通过只读锁版源码核对，形成精确 profile/参数合同及宿主配置投影：模型运行时认证环境与命令子环境分离，命令按真实继承规则显式裁剪敏感键；任务根与受信依赖根分别定义，不开放账号对象库、Codex 认证目录或任意用户 cwd。列明 thread permissions 与 command permissionProfile、网络姿态、路径/符号链接与产物回收验证。研究门暂停且两次额度用完时不继续探针；实际平台上的允许目录成功和越界拒绝证据仍是恢复研究及实现准入的未满足条件，文案补齐不能销账。",
      "resolution_evidence": "",
      "parent_id": "",
      "threat_model_id": ""
    },
    {
      "id": "REV-003",
      "status": "open",
      "severity": "major",
      "category": "data-integrity",
      "requirement_anchor": {
        "id": "FR-1057-2",
        "quote": "冻结执行引擎、协议/runtime 版本、能力类别、用户/账号/来源、权限策略版本，以及真实运行模型身份。模型由 Codex 自身登录和配置提供；返回的实际模型身份必须进入回执。"
      },
      "acceptance_anchor": {
        "id": "FR-1057-7",
        "quote": "图片理解与 schema 输出真实生效；CodeModeOnly 的任务工具真实被调用，不能只验证注册。"
      },
      "where": "docs/features/t1057-codex-execution-routing.md:45-55、67、72；ai-worker/src/execution/codex-native-turn.ts NativeTurnResult；contract/src/internal/execution-worker.ts externalChatReceiptSchema；官方锁版 thread.rs ThreadStartParams/ThreadStartResponse",
      "failure_mode": "合同未区分任务创建时请求/配置身份与 thread/start 返回的实际 model/modelProvider，也未定义 model catalog/视觉/CodeModeOnly 能力及供应商授权的 admission 判据、配置漂移后的拒绝/保持规则。官方 thread/start 可指定 provider、允许模型回退并返回实际身份，模型分级授权仍由服务器负责；当前 NativeTurnResult 和 externalChatReceipt 没有 model/provider 字段，旧 API identity 还强制依赖 workerModelSpec。仅把 actualEngine 写 codex 或把配置名称当实际身份无法满足冻结及两类媒体配置的前提，恢复时也不能证明继续同一执行身份。",
      "evidence_kind": "deterministic-check",
      "evidence_ref": "ai-worker/src/execution/codex-native-turn.ts 只取 thread.id、turn.id/text/usage；contract/src/internal/execution-worker.ts externalChatReceiptSchema 无实际 model/provider；execution-model-identity.service.ts 使用 workerModelSpecSchema 与 baseUrlDigest；官方锁版 thread.rs 返回 model/model_provider/active_permission_profile，并有 allow_provider_model_fallback 字段；turn.rs 明示模型分级授权由服务器拥有。",
      "risk_class": "confirmed-requirement",
      "disposition": "mitigate",
      "remedy_type": "clarify",
      "scope_effect": "none",
      "origin": "baseline",
      "origin_ref": "T-1057 route/identity contract and pinned model protocol review",
      "suggestion": "定义不含凭据的 Codex 路由/身份投影和入场顺序：预约前冻结请求来源与期望能力，turn 发送前核对公开状态、thread/start 实际 model/provider、授权与实际权限；明确配置请求与实际身份不可混写，不擅自打开 provider 模型回退。记录双方身份与能力事实，处理配置漂移、auth mode/不可用、缺视觉或必需工具、模型等级受限的真实错误；预算/usage 缺失保留 null，不伪造 API 规格。后续回执及历史对账绑定原身份和账号/租约。仅已有方向文字或 registered tools 不视为真实模型/工具证据。",
      "resolution_evidence": "",
      "parent_id": "",
      "threat_model_id": ""
    },
    {
      "id": "REV-004",
      "status": "open",
      "severity": "major",
      "category": "completeness",
      "requirement_anchor": {
        "id": "FR-1057-6",
        "quote": "连接失联或结果回执未确认时保留 unknown，不能自动重放有副作用命令。"
      },
      "acceptance_anchor": {
        "id": "FR-1057-7",
        "quote": "候选审读/采用、来源冻结、CAS、budget、lease/fence 和原公共调用链读回；禁止新增质量门把原合法输出整单反杀。"
      },
      "where": "docs/features/t1057-codex-execution-routing.md:53、71-74；docs/features/t1044-local-codex-workbench-integration.md:34-42；backend/src/modules/ai/external-chat-turn.service.ts:111-119、127-144；官方锁版 command_exec.rs process_id",
      "failure_mode": "FR-1057-6 描述 unknown 原则，但没有把新非聊天模型任务与独立 command 映射到原 call 的唯一状态转换及结算后置条件。已有 external-chat owner 绑定 conversation/sourceMessage，不能当通用任务服务；其原成功结算必须确认子工具无 unknown。独立命令的 processId 是客户端预先提供、连接级标识，不存在可跨连接读取的历史 turn。发送后丢入场/完成回执、子工具 unknown、取消未确认、原租约失效及断连后的迟到输出，若未定义写前记录和唯一提交条件，可能被当作尚未执行重放，或只凭 turn completed/exitCode=0错误提交领域结果。",
      "evidence_kind": "deterministic-check",
      "evidence_ref": "external-chat-turn.service.ts settle 要求所有子工具 settled/rejected，commit 校验真实工具/候选及原来源；T-1044 已有 reserved/started/unknown 恢复表；官方 command_exec.rs 的 process_id 为 client-supplied connection-scoped，遗漏时内部 ID 不暴露，follow-up terminate/write 要求预先提供 ID。",
      "risk_class": "confirmed-requirement",
      "disposition": "mitigate",
      "remedy_type": "constraint",
      "scope_effect": "none",
      "origin": "baseline",
      "origin_ref": "T-1057 independent model/command recovery review",
      "suggestion": "为新非聊天 Codex 与独立 command 分别写清沿原 execution_calls 的状态表和受控 service ports：请求发送前持久预约/摘要与客户端 processId，区分确定未发送、已发丢回执、真实拒绝、终态可结算及 unknown；恢复模型只对账原 thread/turn，不绕过子工具结算。command 断连后不把 processId 当历史句柄；保留未知并说明人工核验/明确另起任务边界。原取消、lease/fence、输出归属/摘要及原 owner/CAS 核验完成后才提交，成功退出或完整文本本身不等于业务成功；迟到回执不能跨新租约覆盖。",
      "resolution_evidence": "",
      "parent_id": "",
      "threat_model_id": ""
    }
  ],
  "resolved_findings": [],
  "receipt": "bd24aad65a0b"
}
```
