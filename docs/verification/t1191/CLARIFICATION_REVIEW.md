# T1191 恢复条件澄清独立复核

**PASS，仅新澄清的实施准入。** 当前SPEC SHA256 `746ced072262c34db65dcfecf8934e574b5c67c4bf39467054417d36356ce9cf`；宪法 SHA256 `86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`。此任务同lineage已有93a51a2c…的正式round1/3 initial PASS（receipt ab67cdb366be），现reviewctl583行明确后续使用`review_kind=recheck`。本packet遵循该实际消费者，不重置cycle；前次私有初评三文件、正式记录及初稿两发现保留。本次不签任何修后Gate。

## 当前真实问题及精确约束

候选产品 SHA256 `2fe5c5cf6f3ddb1ab6c0ed1e44afca90d5136958976affbb52a1985be713760e`，测试 `0791875615d414600262f285bdb18a2927ca70d10df534af511ace851fdab990`。源1598仍为`if(attempt&&!attempt.networkStarted)`，新条件尚未改。原T716在interactions763起先发送局部改稿，再注入用户消息和SDK错误，818断言原自动regenerate一次。它的sendMessage只是vi.fn捕获void，不调用transport.fetch；因此attempt.networkStarted为false、preparationFailure为null。候选过宽条件会重新send，而不进入原SDK恢复。仅nofetch不足以证明prepare失败，不能为该替身编造fetch、按messages/异常文案推断网络阶段或改掉原断言。

最终第4项收紧为当前有效attempt、nofetch且有明确engine_unavailable/preparation_failed标记，才重新准备同text/request/原attachmentIds；无该标记仍走原SDK恢复。判断继续受既有ownsSubmissionAttempt与pending保护，不要求原strict布尔值：真实引擎失败/严格prepare失败均有直接枚举，非strict且无编辑器的引擎失败也仍能用户继续一次。它不改变服务器source身份、UNKNOWN只读核对、冻结target/附件/engine、当前session/epoch/owner、取消、原三次与1/2/4秒间隔或正执行期限。

新增两个同文件回归有意义：普通SDK路径没有准备失败标记时不重send/不重prepare而保原恢复；无编辑器但明确引擎失败时，未提交→就绪→用户继续只提交同原话一次。原28例、完整20来源及安全期待、两类明确准备失败、附件/会话/pending负测保留，产品写集仍只该组件和同名测试；旧interactions及helper/配置/guard/预算不改。

已Git逐字核：原interactions SHA `f378c5f4e9d3d6c902af77f8cf68a3e7d01110a7b6e23ee552d0bb9369339772` 恰为HEAD；chat-task-control、live-chat-session、draft-chat-request、settings-interactive-region、reconcile.config、contract/timeout-policy也均与HEAD字节相同。当前旧失败是真实适用Gate发现，不能以“旧替身”称范围外而省掉修复。

## 当场历史证据保留

- 首轮正式record0/start0之后，新增8例的完整28 RED：16PASS/12FAIL、35.734969167秒、exit1，原log SHA `d95c74b68aa6b2a9eff3a62db2ba1e662f34644ba03bae7b3e5c9f7b6b8799b6`。
- 首轮候选完整28：28PASS、8.211427750秒、exit0，原log SHA `556839afcc733d44d7c5f359754aadcea3a6b6c52bad2374a140a00abf1467c7`。它不是当前746ced澄清后前置RED或最终GREEN。
- 当时原LED020：后274PASS、前92PASS、exit0；frontend type0。严格准备等命令实际6文件/30PASS0，虽参数有7路径，不补拍未发现consumer文件为PASS。
- **LED047整体exit1，173PASS/1FAIL**；log SHA `e7a61cf02b6070e4da45043f6583495695b1c0cb51e079243c73d6700c906433`。
- **LED059整体exit1，后20PASS、前66PASS/1FAIL**；log SHA `eb938de67307fb7c5d5964255d6a07c59be8ac2f86072a07aad71a95a244f123`。两处失败均原T716：regenerate期待1实0。

所有原receipt所记logSha256已与实际原log重算一致，具体argv/时间/退出/receipt自身SHA与读路径在READ_SET.json。前一正式审核和首轮测试绑定当时真实SPEC/源，不追溯签成这次澄清的前置审核。根需先正式record本recheck，再按新增两例当场RED→收紧条件→完整相关Gate/独立实施与最终UI证据推进；此前一次图或28PASS不能代签最终source SHA。

只读审查，私有写本目录三文件；未执行测试/服务/验证器/产品CLI/DB/模型/浏览器，未改W或初评材料。不签after GREEN、最终视觉/任务走查、包/安装、native/真人/模型全功能、完整canonical或任务完成。原canonical27ERROR/1WARN、审核欠债及上传研究暂停/2次用尽保持。

## 原归属保护内的 pending 清理待验

根补充的当前收尾点已核源码：sendPrepared finally先从WeakSet删除，却仅在owns（含原epoch）仍成立时refreshPreparation；同liveSession新会话已增epoch时，可能没有重渲染使新加submit disabled仍显示旧pending。允许把**纯pending通知**限定为mounted+当前liveSession相同，而不要求旧epoch；错误、输入、附件与not-submitted等业务回写仍须owns，不能一起放宽。此处落实现第1/6项，不新增owner/任务/预算规则。延迟resolve与reject负测应核清理后submit重新可用、零旧SDK/再生、旧错误/输入/附件不覆盖新会话；当前风险仅由源码链判断，未执行复现，修后仍须当场验。
