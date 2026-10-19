# T1321 提前独立设计初审

本轮为 Root 授权的提前设计只读复核，结论：未发现阻断方案的实质问题。不是对尚未冻结执行来源、MODULE_SCOPE/INPUT_LOCK/packet 的正式通过收据，不授权执行或生产修改；C 仍需在相关修复稳定后锁定实际输入并由审核流程记录。

读取 SPEC SHA256 `57c8d4d5214bb847f2251ac0b73306e326814bff48f975e13742d66af12914e8`；ANALYSIS SHA256 `1becf4945fbd831f1186cdcca1928e4ccafb8ab3ec77f6b900651227ed087a17`。独立核对真实 `/api/chat` POST、model-worker-dispatcher / worker-supervisor、external-task-tool、external-chat-worker-run / codex-native-turn / codex-app-server-protocol 的实际分层，以及 schema/owner resolver 来源。没有以原模型自述或没有成功 part 推定原参数错。

方案闭合了诊断所需的真实路线：新隔离库公开创建输入→原按钮话术与保存版本 target→真实 POST/loopback/session/context→原 durable prepare/submit/dispatcher/native worker→原工具resolver/真实invoke。观察仅透明原样传递与原异常再抛，成功/失败即时安全落盘；相同ref的原resolver对象与冻结定义/owner/version对照后，才对原参数作第二次纯safeParse。由此可区分 schema门、其它业务门、根本没有目标工具尝试，不用替换工具或旁路准入改变被诊断行为。

只允许一次新root提交，复用原task观察、原截止与生产内部策略；不重发旧U14或新task，不调提示追绿。认证/状态/credential resolver保持真实官方宿主，不复制auth.json/Keychain或伪造local状态；无认证就BLOCKED。owned DB实际driver/path与execution/codex-status worker、CLI/runtime/loader必须先锁；现候选/用户库/两controller保持隔离。官方运行自然缓存边界已经说明，未不实承诺认证目录零派生。

实际参数拒绝可能发生在external_tool落账前，故不能只看公开parts/账本有没有卡；本方案最早invoke观察与同源schema观测能补该证据，仍须按真实首断言决定，不预认任何根因。SSE和backend/native时间分别保来源，不冒完整FEEDBACK/模型决策因果。原旧失败与缺失SSE保留；本轮成功也仅记未复现。

后续执行仍须核：所有真正消费入口/不可变worker/状态宿主完整bytes与SHA、精确W、有限预算、原异常白名单及未知错误只hash、实际清理PID与安全证据。若合法装配拿不到同一个resolver或真实身份，按规格BLOCKED，不准为诊断扩产品端口。本轮没有执行HTTP/测试/模型，没有新生产W。
