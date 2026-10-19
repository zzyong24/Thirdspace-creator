# T-1057 独立合同候选评审

## 结论

当前不能进入生产实现，不给出通过结论。继续保持合同候选及待审、待验。T-1057 研究门已暂停；两次实验额度已用完，底层命令范围问题尚未得到直接用户答复。DEC-T1057-01 的候选登记不构成范围或权限批准。完善措辞不能替代缺少的真实权限与公共调用链证据。

本次仅只读检查 SPEC、research、两份 probe JSON、当前产品源代码及固定 commit 的公开源代码。本代理没有运行模型、命令探针、测试或浏览器，也没有修改生产代码与控制面。只写本报告和同目录 JSON。

## 已核实的事实

- “两个模型”是附加图片、视频两类能力的条件性推论。只有全部文本/视觉入口真实迁移后，才能宣传不再需要 CreatorOS 文本配置；当前仍仅 chat.run 走 Codex。
- 入口矩阵确实识别 API identity、agentic Pi、知识同步宿主调用、视频逐 Skill、独立 flywheel/intelligence、daily preflight 及聊天子任务等不同冻结/执行路径。仅改 modelFor 无法完成迁移。
- 随包版本 0.159.3；固定官方 commit 01fc69f4026735edfdf6789820549727a4867b11。网页参数与锁版实际 RPC 不一致。
- 两次 probe 均 checks=[]、passed=false。第一次超时；第二次在旧权限参数校验处被拒绝，未执行测试脚本。没有允许目录成功、越界拒绝或退出码证据。
- command/exec 是独立 argv 执行，不创建 thread/turn；processId 是客户端提供的连接级标识，取消与恢复不得套用 thread/read。
- 当前 Codex 宿主禁用原生 shell/code-mode/环境，控制面未开放此轮生产实现。
- 新方向若由受控 Worker/宿主承担执行，仍经原 backend owner、execution_tasks、service ports、候选采纳与 CAS 保存，符合物理边界方向；不需要另建任务权、前端 SDK 或凭据 owner。

## 未闭合事项

### REV-001：命令范围与旧上传保存语义

底层范围仍未确认。需逐项锁定命令入口、owner、触发条件、同步/后台返回、执行通道及保存语义。现 localfs-object-storage 的 put/headObject 会跑 ffprobe，失败原本退为真实 null；不能因新增 Codex 登录/profile 门把合法上传反杀。确定性工具处理和创作候选需分别保持原保存语义，手工保存不应附加模型门。

### REV-002：锁版权限和命令环境

permissionProfile 还不是经验证的权限合同。需明确构造与注入、真实生效读回、任务根和受信依赖根、网络策略、线程与独立命令不同参数，以及符号链接和回收校验。官方 command env 是合并，现宿主还允许 OPENAI_API_KEY/CODEX_HOME；需要分离模型认证环境和命令子环境。没有真实目录隔离证据，不能按名称或私有 cwd 声称隔离已完成。本轮不继续第三次探针。

### REV-003：Codex 身份与授权

区分创建时请求/配置身份和 thread/start 返回实际 model/modelProvider；明确 provider 回退、公开授权、视觉及 CodeModeOnly 工具能力、配置漂移和历史恢复身份。当前原生回执没有 model/provider，不能把 actualEngine=codex 当成完成身份冻结。缺失 usage 诚实 null，不伪造 API 规格。真实模型/工具证据仍待获得。

### REV-004：独立调用的未知结果状态机

非聊天任务不能借外部聊天的 conversation/sourceMessage owner。为模型与 command 两类分别定义原 call 的预约、发送、入场、拒绝、unknown、取消、结算及提交表。发送前记录摘要及客户端 processId；模型历史对账仍要求子工具回执确认。command 断连不能用 processId 伪造恢复。完整文本或退出 0 不能绕过原 owner、租约/fence、归属、摘要及 CAS。

## 建议的准入顺序

1. 等待原范围问题的直接用户答复，锁定底层命令清单及已有合法任务的不变后置条件。
2. 在当前暂停边界内继续只读核对锁版权限机制，形成明确合同与 DEC 候选；不以文字补充销账真实能力缺口。
3. 闭合无凭据路由/身份、授权、父子继承及两类调用状态机，独立复审。
4. 研究恢复及实际能力验证取得授权后，再按研究门恢复协议获得允许目录成功、越界拒绝、取消/未知结果和平台边界证据。
5. 上述准入通过后才扩生产 write_set；按已确认完整范围实现并完成原公共调用链、模型/视觉/媒体及全部命令验收，保留旧任务、上传、保存与降级能力。

本报告不把现有调研、fixture 或失败探针记为功能、视觉或模型验收通过。

