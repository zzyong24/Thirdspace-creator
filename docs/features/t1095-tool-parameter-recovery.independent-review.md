# T1095 独立 SPEC 首轮评审

评审时间：2026-10-09（Asia/Shanghai）。结论：**PASS，首轮无 finding**。本报告只评审规格的完整性、可实现性和可验收性，不代表实现、真实 Pi、安装版或完整 Gate 已通过。

## 绑定

- SPEC `docs/features/t1095-tool-parameter-recovery.md`：`60bd188863487324376d549398431db06eb74e7a989d5d486fe08a58f5ec8634`
- 模块配置 `orchestrator/process/modules.config.json`：`894ae93da937f613b34f634768da68b978ba937fafc8e3d1ec29daa92bcad8ba`
- 产品宪法 `docs/产品定位.md`：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`
- 系统架构 `orchestrator/SYSTEM_ARCHITECTURE.md`：`eb1826d4c09054df622d9718c38ca372bd19833e72bd1a752757631a5747c1df`
- 当前 `agentic-tool-binding.ts`：`aa396ac9b8eec023124da7c78cb7e4d78ef86534dae8701c693f41e1a7f2ccde`
- 当前 `chat-turn-submission.service.ts`：`2dfe0b81703688458fdd93c61f43e635204b0b00fb3cc8305746931377cca64d`
- 私有根因报告 `RAW_PARAMETER_DIAGNOSIS.md`：`3c854dc6d2594cb106105ae71d619a8d1c3377f6895cf22cad5f9ff4d560ad48`
- Git 基线：`ff9ae4a2bf98b21b308889ffedeea23e112639fe`

## 结论依据

根因与方案匹配。现有代码只把 Zod issue 压缩成路径和错误码，无法告诉模型“父字段必填但允许字面 null、空对象缺少必填子字段”。私有证据只证明已结算调用为 `{}`、缺字段、缺字段，SPEC 没有把它夸大为供应商原始 wire 删除 null，也没有改 Pi codec 或参数合同。

版本隔离可实现。`executionTasks.payload` 同时包含 `modelInput` 和新增外层标记；binding 已接收完整 task，因此能直接核对标记，不需要把能力塞进公共 wire 或改写冻结 `modelInput`。已有绑定由 submission 的 `existing()` 直接返回，不重新装配；旧任务缺少标记时按原路径生成原 recovery 和 inputDigest。新标记只改变新任务非法参数的确定性 validation outcome，符合新任务冻结语义。

解释器边界明确。说明来源限定为冻结 `modelInput.tools[].parameters`、实际已结算 JSON input 和原 Zod issue path；只遍历 properties、items、anyOf、oneOf，并限制深度、分支、条数和文本长度。它只报告声明类型、nullable、必填性、缺少的对象子字段和收到的 JSON 类型，不生成值、不挑选联合分支、不展示正文、ID 或完整参数。不能确定时回退原错误说明，实时 Zod 校验仍是唯一授权门。

摘要和回执兼容要求完整。SPEC 明确 reserve、start、execute、settle、forCall 必须从同一冻结事实重复得到同一文案，并保留原 model call、tool call、definition version、effect、input 及 validation outcome 的摘要关系。重复同参仍受原有限终态收口；修正参数必须形成真实的新调用。JSON 损坏、Pi length 截断、unknown、取消、期限和归属路径均不借此放宽。

测试范围能够证明用户结果。机械矩阵覆盖 `{}`、缺失、合法 null、合法对象、非 nullable null、数字字符串、嵌套数组、联合分支和不支持 schema 的降级。公共集成测试必须经原 submit、真实 Worker、模型与工具 ledger、严格宿主和 completion 链，让错误实际进入下一轮模型输入并在同一 task/execution 产生未采纳候选；helper 单测或供应商模拟自述不能代签。安装验收另要求新意图、真实 Pi、保留原 task200，失败时如实记录。

写集与架构相符。三个产品路径仅涉及提交冻结、通用 binding 和纯机械 helper；没有新增公共 API、数据库、权限、候选采纳、模型选择或 UI。模块配置包含三个对应测试路径、原 completion/host/plan 回归、backend/worker 类型、边界门、超时门和 reconcile。未发现需要扩大产品写集的确定性依赖。

## 证据边界

本轮没有运行测试、模型、CLI、数据库、浏览器、构建或安装；没有读取用户凭据或修改旧任务。私有报告没有供应商 HTTP/SSE 原字节，因此实现后仍须用真实公共链与新安装 Pi 验收，不能把 fixture 遵循或静态 schema 解释写成真实模型已修复。

建议 root 使用当前 JSON 作为 `reviewctl record T-1095` 的 initial 输入；`review-mode` 应按实际委派事实记录，不能仅因使用独立子会话就冒称跨模型。
