# T1191 / T1187 独立实施复核（逻辑范围）

结论：**精确逻辑源码及已完成组件回归局部 PASS；任务与完整 Gate 未完成。** 未发现当前第1–6项的新增确定性产品缺陷。此次评审只绑定产品 `346cf00843c6f2283ba244c85d8dd41e5e9118645e856df12e9100ce1eda21d0`、测试 `e6163928151eb6cb23b364571131b709d680337c06a510b69047cc72b1d301f8`，HEAD `b34447aaf7836e7798d4bd37c262eff2357aaf7d`。规范为正式第2轮 `746ced072262c34db65dcfecf8934e574b5c67c4bf39467054417d36356ce9cf`（实际record0/REV:d0aa2310a77a）。评审期间SPEC新增第7条，当前SHA `38bfa86de9ab922f6058bf7d66fd56ca14c4fe8a947268641e36930b0a63e8f9`；第7条、最终UI与包验收另审，不能用本报告补签。

## 业务与恢复边界

- 当前attempt记录原text/request/attachmentIds、建立时liveSession/epoch和明确preparationFailure。owns同时核mounted、当前ref、当前session、未变epoch与真实conversationStorageOwner；显示、继续、await prepare后提交、错误/输入/附件与not-submitted回写守此边界。切组/scope清旧入口，新会话清attempt/receipt并沿原epoch递增；不取消原后台持久任务。延迟resolve三类切换及同session新epoch迟到reject均有零旧提交、保新输入/错误与submit恢复可用断言。
- 仅明确preparationFailure且未开始fetch的当前attempt重做原准备；无此标记的SDK断流保持原regenerate路径，不靠异常文字、已有消息或替身伪造networkStarted。引擎真实available/checking决定当前文案与禁用状态；就绪不自动发送，由用户继续。原/settings?highlight=assistant-engine消费者未改。严格与无编辑器路径均有真实SDK零提交→一次原话提交覆盖。
- 准备失败优先于并存旧SDK error，用户卡使用固定安全文案。恢复只重武装attempt原附件快照；原picker清空/旧finally不会清新attempt，真实SDK body明确保原附件、不采用后来picker附件。严格target仍由原Provider准备并守注册/generation/dirty/120000ms，未把UI标记当保存成功。产品不新增写库或采纳路径。
- 已fetch的冻结receipt缺source时，空回读仍保只读“核对原请求”，有conversationId才可操作；不regenerate、不prepare、不造source/任务。明确source仍核原user ID/正文/附件及receipt/messages/session/epoch后恢复冻结target/engine/body。原sourceEngines、任务控制/owner与服务端guard未改。
- pending入口和已排队自动timer均先拒抢合法准备、后决定预算；仍是原三次与1/2/4秒间隔。纯WeakSet清理的render通知只要求mounted+同session，允许新epoch清掉disabled显示；业务错误/输入/附件/creation回写仍要求owns。测试保存pending横跨原timer8秒后，零恢复/零耗次；结束后保原三次，额外等待不续发。
- T1187四处currentTaskId:null与一处acquire空release保持审定隔离范围。此替身不冒充真实持久回执/观察释放验证；最终真实control、session、server consumer及原interactions四文件83例是独立实执行证据。原20例全部保留，新增11例为31；旧手动期待按现行自动恢复观察，原target/source/text/附件/engine/prepare次数和零非法提交断言保留，无新增skip、重试放宽或预算调整。

两个完整HEAD diff已读并在READ_SET绑定SHA。control/live-session/Provider、设置消费者、原interactions、两个扩大后端测试、reconcile配置及timeout契约当前与HEAD逐字一致。其它任务的既有未提交测试/控制文档不冒作本任务写集。

## 当场证据

以下receipt所记logSha256均与实际gzip解压日志重算一致；私有原件存在时与仓库归档逐字一致，路径、独立receipt SHA、压缩SHA、解压SHA、argv和真实时间逐项在READ_SET。

|实际命令范围|真实结果|
|---|---|
|正式澄清record|exit0，cycle1 round2 PASS/REV:d0aa2310a77a|
|澄清当场RED|31例：29PASS/2FAIL，exit1，7.705877秒|
|最终同名完整组件|31PASS，exit0，7.763030秒|
|原LED020完整串行|后274PASS、前95PASS，exit0|
|原LED047 8文件|174PASS，exit0|
|原LED059串行|后20PASS、前67PASS，exit0|
|真实control/session/server consumer/interactions 4文件|83PASS，exit0|
|严格准备/创建/card 7文件|46PASS，exit0|
|双端type，boundary/semantic/orphan/diff|各exit0；orphan既有WARN不写成零警告|
|扩大owner/worker 4文件|11PASS/4FAIL，整体exit1，50.852093秒|
|完整timeout-policy|静态27FAIL；实际公共166PASS（6+5+20+35+68+27+5）；整体exit1|

RED日志SHA `2dd8220a05aa8f98dec17f729f9237e0220196c1cf6c3f23f0c46b5f6166f9ec`；最终31日志SHA `e729c03f5f4f746637189a228533670944783ae15388b77aad77948b7afc4d19`。先正式record0，再RED两项真实失败，再收紧条件/中性pending刷新；不把首次28通过改签最终版本。

扩大后端原日志SHA `267b6238360e59d74dec23f43279a9ec859dac187f8064dea221fb3bf2e38043`：两个联合例第104行strict parse拒__creatorosOutcome（原T1092）；Pi/Codex精调第110行完整output相等失败（已登记T1192）。已读取完整日志字节及两类断言/expected/received结构；日志长正文在日志本身已有截断展示，不能凭片段断言候选无损或自动确定全部根因。两个后端测试与产品backend不在此次改动中，这4FAIL仍是扩大链未通过，不能被11PASS抵销。timeout原日志SHA `abb9a766a86d20feda1ffc2f647e4ce0b216d7681a84fb8cadc175a7688c891e`，总体1保留。

首轮原RED16PASS/12FAIL、首次28PASS、LED047173PASS/1FAIL与LED059后20/前66PASS/1FAIL、T1187原14PASS/6FAIL及其正式前置材料均保留原SHA，不追溯清零。首轮严格命令名义7路径实际只6文件30PASS；最终46与83才包含真实server consumer，不给未发现文件补拍PASS。

## 尚未闭合的范围

当前346cf逻辑产品在实际200%宿主走查仍有输入/操作裁切，新第7条要求精确根滚动兜底；本次不签最终UI。第7条正式recheck、候选可行性、修改后的源/回归与同源实际键盘/滚轮/200%、独立最终视觉/任务走查及新包隔离smoke仍待。完整canonical现有b344记录为exit1、27ERROR/1WARN，不是本候选重新全绿；历史19审核欠债保原归属。

只读审查与私有报告写入，未执行测试、服务、验证器、产品CLI、DB、浏览器、模型、真实profile或研究实验。结论不完成T1187/T1191，不签完整Gate、native/真实模型/安装或全功能，不恢复微信或已耗尽两次的上传研究。
