# T1250 公共Rust夹具观察候选（未应用、未执行）

范围仅原3个`cfg(test)`夹具。生产IPC、公开schema、持久任务deadline、owner/PID、请求ID、原操作和全部回执断言均不变。候选diff仅插入测试专用`CREATOROS_TEST_WORKBENCH_FIXTURE_WAIT_MS`解析，在绑定host之前拒绝非UTF8/非u64/小于120000毫秒或不能checked-add的值；ready写出后冻结一次done观察，RPC/字节/心跳不续期。无env时journal原90000升至120000，files保120000，browser保180000；原ignored不移除，不声称其正文已验。

|真实消费者|ready到done之间实际工作|原观察|候选默认|工具须绑定的观察值|
|---|---|---:|---:|---|
|`ipc.rs external_node_file_journal_fixture`←`workbench-file-recovery.test.ts`真实公共journal用例|Node读ready→fixture原写和暂停→CLI reconcile→自动扫描排队→两次predispatch原CAS/冲突→写done。随后重复CLI请求/原resume/文件检查发生在done之后。异常finally先close CLI再写done。|90s|120s|至少新副本完整有效body预算＋异常路径done前CLI close/FS余量；原60000 child kill/body、10000 ready/scan消费者须另按工具批准校准，Rust只改观察不能使它们合法。|
|`ipc.rs external_node_files_host_fixture`←`workbench-native-host.test.ts`真实Mac用例|Node读ready→createDb→原跨task/group/fence文件读写→两版artifact/blob→PDF/PDF/PNG→私有模型协议Worker→原模型产物PDF→artifact旧版本拒绝→command start＋最多100次status及read→写带原owner/task/html的done。异常finally先closeDb，再abort:true done。|120s|120s|至少新副本完整有效body预算＋异常路径DB close/FS余量；100次status完整正RPC串行/3次模型调用/4次render应由真实工具逐consumer派生，不把原短body当充足证明。|
|`browser_ipc.rs external_node_host_fixture`←`workbench-browser-host.test.ts`各真实case|每次真实host收到ready后保持至该host finish写done；期间Node原profile/lease多请求、Chrome启动/导航/提取、跨账号/旧attempt/取消/legacy handoff或中断。中断fixture只有done真实到达才走原exit；不改EOF或lease事实。|180s|180s|每case各host观察至少该case完整有效body＋before-done host dispose/finish及FS余量；多个host不复用原deadline，每host只冻结本次fixture。|

工具派生原则：`fixtureWaitMs >= effectiveCaseBodyMs + maxCleanupBeforeDoneMs + finalDoneWriteMs + settlementMarginMs`，若其真实合法串行上限大于effectiveCaseBodyMs，先校准副本body为覆盖全部RPC/render/model/status/排队/启动及余量的数，再派生fixture观察值。`maxCleanupBeforeDoneMs`必须来自真实CLI/DB/host清理消费者，不能填未约束的Infinity。传入值固定、有限、>=120000ms；工具需严格核安全整数/覆盖不等式并SHA绑定case→观察映射。当前peer工具尚未prepare，故没有冒写实际derived数字、没有开启新Cargo或公共链。

预算只延长测试夹具保持可被原Node owner调用的观察，不授予任何生产新操作，不恢复已失效租约，不延业务任务期限。旧11PASS/1ignored binary保持原SHA；新源应用后必须新的binding/精确工具独评和重新编译，不能拿旧11签新字节。
