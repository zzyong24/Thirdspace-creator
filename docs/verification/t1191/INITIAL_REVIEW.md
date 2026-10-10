# T1191 独立 SPEC 初审

结论：**PASS，仅最终精确 SPEC 初审**。本次实读 SPEC SHA256 `93a51a2c13c3a8d71d7bd815410d7562e992e48ddb08205ddd40600d78d02221`；产品宪法 SHA256 `86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`。当前 HEAD `b34447aaf7836e7798d4bd37c262eff2357aaf7d`。产品 `ai-copilot-content.tsx` SHA256 `2db7debaf1fea381f88e18d74bbef747904c78587427e4e2048266d252a4469a`，与 HEAD 完整字节相同；同名测试 SHA256 `35a0a9d416cedbe93bacb9e152d7349e9155c6dd09dd85c07d9d7d94a001a801`，撤去 T1187 已批准的四处 `currentTaskId:()=>null` 与一处 acquire 隔离导出后，恰好等于 HEAD 原文件。未把 T1187 的部分通过签成完整通过。

## 原发现与正式记录前的补充

1. **DRAFT-001，原初稿 cf584ad9…：当前 attempt 归属不完整。** 源1062的attempt只有text/strict/request/networkStarted；841–866切组/scope会换liveSession，1903–1960恢复effect不清该attempt，1546后继续使用当前sendPreparedRef。第4项扩大到任何零fetch原attempt，原稿仅说scope/epoch保护不改，不能保证旧失败不进入新身份。第一份补充 ed62af76…及最终稿第1/4/6项已明确当前ref身份、建立时session/epoch、显示/继续/fetch开始/prepare后提交与错误/输入回写、切组/scope/新会话与晚prepare负测。不取消或改属主原已提交任务。这是**SPEC层闭合，实施仍待验**。
2. **DRAFT-002，ed62af76…：继续时原附件可能丢失。** 源1747快照附件到transport ref，1797立即清picker，1799的finally清ref；1062原attempt未存附件，1682冻结body又读该ref。准备失败后仅继续text/request无法保原附件。最终稿第1/4项明确attempt原attachmentIds快照、只重武装该快照、不读后来picker、旧finally不清新attempt，并要求真实SDK准备拒绝→用户继续body保原附件负测。此项也是**SPEC层闭合**；不是六条现RED日志已观察出的附件失败。

两项发现发生在正式record前，原发现与两次SPEC实读SHA保存在READ_SET。未把旧稿补签PASS，也未声称当前产品已有修复。最终initial packet的findings=[]代表最终SPEC已具备这些约束；根仍须按正式record/start及当场验证推进。

## 六项状态及消费者核对

- 首次严格prepare/引擎失败的真实缺口成立：源1309起composer错误默认autoRecover，1609effect在零消息直接返回，3336起按钮又受现状态限制。可信 `preparationFailure` 与有效attempt优先于上轮SDK error，不靠异常关键词分类；未经fetch仍由用户继续同text/request/原附件，继续前仍由原prepare核注册token/generation/dirty与120000ms等待，不以UI状态冒作保存成功。
- 引擎未就绪与检查中由原 `useAssistantEngine` 的available/checking真值控制。现hook只在Codex读取实际状态，Pi原默认可用语义不变；不把本补充当新增模型可用性预检。已核真实 `/settings?highlight=assistant-engine`：SettingsDialog映射models页签、定位data-highlight，SettingsModelRegion确实渲染AssistantEngineCard。失败后就绪仍由用户继续；原autoSend正在检查时不消费nonce，确实就绪后的一次合法提交必须保留。
- 已fetch且无明确source时，现listMessages空回读会setMessages([])再设composer错误，旧SDK error可同时存在。最终稿要求明确“原请求结果待确认/核对原请求”，空消息仍保只读入口；无source必须零regenerate、零prepare与零新模型任务。不能把读回当成功或伪造source/task回执。
- 有真实source仍保原自动恢复；1580后现mounted/liveSession/epoch/receipt/messages身份及source user ID、正文、附件严格核验，原sourceEngines和冻结target/body保留。旧手动“重试”期待应观察真实自动动作，不能恢复旧手动行为以洗绿。原三次无进展与1/2/4秒间隔、明确继续、原后台任务及期限不变。
- preparationPending用于防并发；原计时回调先增次数再调用retry，原retry先清composer错误，再检查pending。最终稿明确effect与已排队timer遇到合法准备不得调用恢复或耗次数，须由目标测试验证；不靠新循环、缩预算或取消保存达成。
- 原权限/owner、源身份、SDK控制与提交/取消链、后台lease和合同不变。写集只准产品组件和同名测试；helper、设置、live-session/control、后端、预算、配置与其它UI都作为核读依赖，不是实施写集。

## 实际证据和后续验收

完整同名20例：**14 PASS/6 FAIL、exit1、23.003778792秒**，原log SHA256 `b542617c27a355879f6cb050a43a778b01e59fd573206ffeeea20f321bc35263`。六项都是当前明确错误文字或旧手动按钮期待失败，不能仅据此把六项统称产品根因。

原LED020串行：**后端274 PASS；前端78 PASS/6 FAIL；整体exit1、26.201091583秒**，log SHA256 `5d0f09a7e29a6d7a6290a11a5144a1fab44d5e7888019e1a37526b412e9be768`。两个原receipt的logSha256均匹配实际原log，仓库归档receipt与gzip解压字节也均相同。

未改真实control/session/consumer/interactions四文件的**83 PASS/exit0**是T1187编辑前证据，log SHA256 `5d9120364d76a783961dd4e89a2b16a9d68127c01c6112864769fc0db804cb88`；T1187接口校准后的frontend type0也是既有结果。它们不是T1191实施后的重跑。所有具体receipt/log路径、独立SHA与实际范围在READ_SET.json。

最终SPEC验收范围足够作为实施约束：保原20例与原安全断言，添加旧SDK错误并存、原附件、同一创建target零/一次提交、当前session/epoch失效与晚prepare、pending横跨已排队timer零调用/零耗预算、无source空回读零非法提交；另跑原完整LED020、真实四文件、严格准备/作品请求公共链、LED047/059、双端类型与scans/timeout/diff。不能仅改可见文字或删请求次数/冻结body断言。

按oil-ui-pro与UI_RULES保原错误卡布局、tokens和丰富紫色工作台；修后同数据/1280×800与900×600图、键盘/200%、实际按钮和独立视觉/任务走查仍待根执行与复核。根报告已有组件基线，本次未看图或代签其视觉结论。组件harness、隔离包smoke与native/真实模型/真人profile是不同证据范围。

本次仅只读源、规格、已发生日志/Git与哈希，私有写上述三件工件；未修改仓库，未运行测试/服务/验证器/产品CLI/DB/模型/浏览器或上传研究实验。canonical原27 ERROR/1 WARN、旧审核欠债及T1181/T1182两失败/2次用尽暂停继续保留。T1187仍需结合完整20及公共链复验，不能提前完成；本结论不签T1191实施、完整Gate、包/安装、全功能、微信或原研究恢复。
