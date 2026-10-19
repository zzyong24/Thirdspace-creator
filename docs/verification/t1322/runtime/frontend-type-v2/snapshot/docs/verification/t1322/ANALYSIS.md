# T1322 只读分析与草案依据

本文件由 `/root/sol_daily_implementation_current`（GPT-6.1 Sol/high）编写。仅源码、已保存公共 DTO、安全日志投影读取；没有测试、HTTP、新模型、数据库/raw log/凭据读取或生产编辑。Root 已确认两源同任务范围；正式实施仍等独立审核、输入锁、packet/lease 与 START。

## 证据强度

T1316 `diagnostics-media/FIRST_FAILURES_SUMMARY.json`：封面 exec_e026d68c-5a5e-4916-b9d3-4383a3e84db0 首 L217，图卡 exec_a337d6ab-f555-44d8-be3a-8a9b7488bfb8 首 L461，均 bindCodexCall / ConflictError / HOST_PORT_REJECTED，原时间 null。投影 prefix 为 103294 bytes / 574 完整行，SHA `4715c338c7cd7d145e257637fce20087152da2182d897591ac97f2a8b6bb0937`。没有具体 patch、callId、中文断言或 payload，不能排除其它 bind 守卫，也不能追认新源码分析就是旧首因。两原公开 execution DTO 不暴露 payload/calls，未以缺字段推断其实际为空。

源码链与固定 source 0e1dc6228f1fa3dc02f2b1c7a1cee77ab18d650a 逐字节相等：

| 文件 | SHA256 |
|---|---|
| execution-model-identity.service.ts | `443f06bff916b871133ea1f41f321f81dcded0d51bdde301c41f0f7118fa2355` |
| execution-codex-call.service.ts | `3afaf6c557d64d79efc070a0ed80a9deca5a90481bf2dac842087584f9c29d82` |
| execution-cover.service.ts | `78f48d52f04a827fbd331e88ff18a2a30ccee37e95136da5296f065c75e26a35` |
| cover-execution-binding.ts | `1af4b33f4790824032f50111a1bd245ed77b2bacbdda6ce98ce06b109246573f` |
| asset-execution-binding.ts | `48227fe1a1610fa0378d868acfaade3c8da212187ab919fcf98d42ae3c782d53` |
| ai-worker/src/execution/cover-worker-run.ts | `1e162c201b8764b29bbb9ed17c2c30e4eb908c04f1febdd7125a999f87c19d6c` |
| ai-worker/src/runtime/codex-provider.ts | `50599c81d3914b5da122aad950cf52464f70d608134c4e59e09ba37eed0fe7ec` |

前五文件位于 backend/src/modules/execution。以上是只读源对应核验，不是 C 已形成正式输入锁/前置测试快照的声明。

## 首文案调用的实际顺序

`cover-worker-run.ts:20–23`：先真实 prepareCoverImage；结果 pending 时 runStructuredNode；节点文案真实完成后再 prepareCoverImage。`durable-generation-model.ts` 为每个原请求预留 `${input.operationKey}/model/N`，真实 start 后以 AsyncLocalStorage 传原 call authority 到 Codex provider。`codex-provider.ts:47` 的 onThread 在 thread/start 后、turn/start 前调用 bindCodexCall，后续 turn/usage/modelFacts 仍属于同 call。

`execution-codex-call.service.ts:13–24` 先按 patch 阶段选择 admission/settlement，核 task attempt/fence、call execution/status；v2 则读取 frozenNonChatModelBindingForCall 的 route.source，非 codex 拒绝“原call未冻结Codex执行权”。图片 mode 才进入 bindAssetExecution 的原任务/准备/digest 检查。

`execution-model-identity.service.ts:166–181`：cover.brief / graphic.card-brief 分支无条件 `coverImagePreparationSchema.parse(saved.value)`。首次文案还没有未来图片准备，这个解析异常在同 helper catch 成 null，阻断后面的合法 structured `/model/N` route 选择。这是清晰可达源码前置矛盾，预期完整主 RED 会在首次文案 bind 捕获；尚未运行，不称已复现。不能改 catch 吞错或让 root 的 Codex 权限替图片授权。

## 第二处图卡凭据门

`persistence-client.ts:6307,6454–6456` 的真实 coverBusiness 即 createExecutionCoverService；cover.generate 与 graphic.card.generate 均委派它 resolveCredential。`asset-worker-run.ts:35` 图片阶段先 resolveAssetCredential，真实 asset ports 再调用上述 resolver。`execution-cover.service.ts:136–142` 只允许 business.taskType 为 cover.generate；这会排除本来由 `bindCoverExecution` 明确支持的 graphic.card.generate/graphic.card-brief 配对。

因此只改 identity helper 不足以签图卡完整链。Root 已确认同 T1322 两源范围：先两族完整文案 RED，第一窄修后沿原协议自然捕图卡凭据后门 RED，第二源当时仍原 SHA；禁止为了预证手填 coverImage、跳过真实文案结算或 stub 凭据服务。再窄修 resolver，完整两阶段与用户采纳读回 GREEN。若实际后门未发生，按真实结果修正假设，不人为造错。

resolver 应用真实当前 scope、原 AI/execution owner/任务类型/skill/capability/业务 digest/sourceDigest 证明这两种配对。不是全局 taskType 放宽；不同 task、跨 owner、错误准备仍拒。图片 source 解析仍由原 resolveImageSpec 与 execution-asset-ports 的冻结 route/credential identity 守卫完成，不在文案读取图片凭据，不改 frontend 装配。

## 其它 bind 拒绝条件仍须区分

- lease 层：失效 attempt/fence、admission 状态/owner/lease/deadline、真实 workspace/member 变化；settlement 不因此新开动作。
- call：非同 execution、非 started/unknown/settled，v2 冻结 route 未配置或身份不符。
- 图片：无真实 owned business/输入配对、无 sourceDigest/准备、图片 operationKey/inputDigest/reference 或 provider 身份不符。
- binding：usage 缺原 turn、usage 倒退/改已结算量；modelFacts/nativeResult 缺原 thread/turn；同 call 已保存的 thread/turn/facts/nativeResult 被改变；绑定数量上限。

旧 safe log 没有 patch 阶段，不能从 bindCodexCall 字样确定是哪一项。新透明观察保原 invoke/throw、记录固定断言白名单与 repo 栈以及原 call/冻结身份结构，足以把上述边界区分，0 真实供应商即可先证代码机制。

## 最小完整诊断与实施读写范围

生产只两源；新 frontend 完整组合测试及现有两个精确 backend 回归作为候选 test W，详见 SPEC，待 C 锁定。真实 public compositeTransport 创建两个独立合法新样本：cover.generate 与 creativeResults image_card→graphic.card.generate；真实 prepare/host/immutable worker/Skill/ledger/completion 不替换。仅合成官方 Codex native CLI JSON-RPC 和安装/可用性边界，空 CODEX_HOME，不访问用户登录。图像只给明确标注受控 PNG，以实际生产 decode/store/asset/file/候选/采纳链验证，不能称真实模型画质。

首 RED 必须冻结两源原件、所有实际首次消费的 prepare/应用 adapter/dispatcher、真实 snapshot/template/schema、model identity/ledger/lease、Codex provider/native/image/asset worker、原生 CLI fixture/worker binding/test/config/runner 完整字节。第二轮冻结第一修源及仍原件的第二源，错误分开保留；最终绿绑定完整源。旧任务与旧候选服务绝不接入，禁止原通用 exec 全局 mock/直接种 settled 回执/重新 build worker。

预算、正例、错误身份/owner/digest/route、image.generate/edit 引用、普通/旧兼容、幂等/UNKNOWN、完整用户确认读回、Gates、资源清理与交接按 SPEC。独立外层保串行两阶段总余量；恢复观察用原绝对截止，不再靠人下一轮醒来结束。出现第三处必要产品 delta 停该分支报 Root，不偷扩两源。

## 当前交付边界

本文及 SPEC 是作者草案，不自签审核、不填生产 START 或 Gate 结果；真实 RED/GREEN 尚未发生。Root 是本 SPEC 独立审核者，C 后续正式化锁与 packet。本任务之后还需新不可变包真实 Codex/图片功能验收；受控完整链不代签供应商可用性或旧 2613/5713 首因。
