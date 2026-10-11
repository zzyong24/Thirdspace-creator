# T1217 防丢保护与内容消费分工独立准入复核

2026-10-11，只读正式 SPEC/Packet、writer 候选、真实失败日志、原 T603/T622/T665/T1073 测试和当前产品调用点。未改源、测试、控制面，未启动 Next/测试或触碰真人库/平台；仅新增本评审。

**当前正式补充分工 scope PASS，可在原五产品文件内实施；不签当前产品实现或 GREEN。** 保留前面中途边界/删除评审的历史结论与原失败证据，不拿旧候选 PASS 代替本次实现。

## 当前事实与哈希

|工件|SHA256|
|---|---|
|当前正式 T1217 SPEC|7474ffdfeb85c7dc1c03880871d460e2272d104e2e010f51a3804f5ca1dda43d|
|当前 Packet|d147faf6effc2482209aeeba960280dc3a7a6769264d3267b8fdc31d82ba81d8|
|transcript-conservative-guard-candidate.md|df394efe40812ff7da1484724fcf09899e08da78d56f8e250c4975aeb00c637c|
|related-existing-regressions-second.log|74d2367041673a4d6cb334d59ed4ccc143420523f211f58e4c27ded6303f987e|

实际日志终态 7 文件、76 例：71 PASS/5 FAIL、214.21 秒。失败为 T603 生成候选后人工稿锁、T622 重转写锁与列表组合状态、T665 防删除保护、T1073 挂起心跳下即时取消。T1073 不是保守根证明修法能解决的失败，应继续独立沿已审原取消合同修复；本次不把五条都说成同一根因。

原 T603 直接 seed 真实 item，再存同组 transform/output，snapshot 父缺失；没有 source/observation。原 T622 列表同样仅真实 item、done transcript、transform/output 与 metric，缺 snapshot/source。这些旧断言验证防覆盖/已有候选存在状态，而非授权坏候选正文可读。完整父 filter 把 transform 排除后锁失效，当前日志对应拒绝未发生/新转写任务多一条/待生成列表多一项。T665 保护引用有缺 snapshot 或 reference.transform/topic 不一致时当前完整 proof 过滤它，造成 affectedItems=2/preservedSnapshots=1，而原应为1/2。不是原公开删除保护结果已确认可放宽的证据。

## 当前正式补充的闭合性

最初新增文字把本 source observation 交集同时写在所有保守用途下，会误伤无 source 的 T603/T622。已当场指出，root 修正式段后再读到：**稿件锁及无正文 workflow 仅 transform 自身同用户/同逻辑组根 + 真实同组 item 根及 itemId 对应；不强加 source/observation。删除防丢再加本 source 的已证明 observation/item 集合交集。** 此更正解决前置歧义，不允许为了通过文字要求向原测试补 source 或改变旧断言。

- **保护证明是拒绝破坏的事实，不是内容授权。** helper 可加显式仅供保护的 transform/reference root+item 端口，复用真实初始成员/历史时间/同用户/同逻辑组 ownership；NULL 初始证明仍唯一，普通组不借 NULL，坏 item/跨组/跨用户不能触发别人的锁或保护。谓词只给 transcriptTopicLock、listItems 的不含候选正文 workflow、deleteSource 防丢使用，不替换通用完整父 filter。
- **手稿锁的已存状态**：已有 output 或真实原 task 活动状态仅用于拒绝覆盖/重复转录，保原 TRANSCRIPT_LOCKED/BUSY 和任务状态/冻结范围；不能把坏 aiTaskId 指向任意其它 task 当作活动事实。原 execution 查询仍精确归属/原 task 关系，不能使用 NULL 内容兼容增加执行权。
- **列表提示**：listItems DTO 只输出 workflow 状态，原 awaiting_confirmation 可表达已有输出待处理，不能据此给确认端口免验。可在内部读状态/是否有 output，返回层不得带出坏 transform 的 outputSnapshot 正文、snapshot.safeExtract 等内容；不能为了显示状态给 getItem 的完整 candidate 数组放行。
- **删除防丢**：只保护真实 owned transform/reference 根且对应真实 owned item，并与当前被删 source 的真实 observation/item 集合相交；不能全组宽保或凭坏 itemId 保另源。缺 snapshot/不匹配 ref 不能使已建立输出/引用被扩大删除。其字符串 ID 只形成“暂不可删”集合，不据字符串建立来源父、采集执行权或新的实体；壳 run 集合仍只由本源确实存在、完整父证明的 snapshot.runId/sourceId 推导。
- **消费仍完整**：getItem candidate 列表、getTopicPreview/ForExecution、确认/AI 输入、attach 及 getSourceContexts 按原完整 source/run/item/snapshot/transform/ref/topic 链、hash、定位证明。坏引用不能静默从 Project 返回空成功，须沿现有明确错误。正常完整公共消费不被新增质量规则反杀，旧成功族仍须实际回归。
- **锁与写集**：删除/attach 仍同组锁内重读保护集及 active/task 真值，控制/新 fence/未知不被覆盖；source stamp 与现有壳方案不改变。五产品范围不扩，新增负族在原 integration 测试；原 T603/T622 一字断言不改，原 T665 仅前已审与壳冲突的私有物理断言校准，其余影响计数/item/snapshot/transform/ref/共享保护及确认拒绝保持。不得改 T1073 或其它既有测试、skip/retry/Gate。

当前候选前文“仅 transcriptTopicLock、列表尚未选定”保留为过程历史，由其后实际失败补充和正式 SPEC 明确覆盖列表/删除三处；实施以当前正式分工为准，不把候选旧历史当成漏写集授权。

## 必须发生的验收

1. 原 7 文件真实失败日志保留，原 T603/T622/保护计数回到原预期，不减断言；T1073 经产品取消原合同修复后实测，不由本 scope 代签。
2. 真实旧服务内容/稿件和既有输出 transform 后，故意破坏 snapshot/source/run 父作为明确负族：手工覆盖/重转写仍拒绝，原正文/task ID不变；list workflow 如实待处理；getItem 不返回该坏候选正文，preview/确认/AI/Project 读取拒绝。该损坏实验不是安装真人数据根因证明。
3. reference 自身 root+item 合法但 transform/topic/hash/父错：删除不毁原输出/ref/item/受保护字符串所指已存实体，但 Project/AI 不获得读授权；保 run 只来自完整真实 snapshot，没有新建假 source/run。另源 observation、跨组/用户、缺/错 item、伪初始 member 的保护不能串入。
4. 合法完整 old NULL/canonical/group-only 公共消费链仍成功，原 IDs/hash不改；PG attach/delete 竞争不丢保护，归档/停控/late fence 拒绝不变。静态 helper 或单条旧 unit PASS 不代表这些族已通过。

当前修复落实既有“不覆盖已生成稿件/不因坏父扩大删除”和严格来源消费合同，属确定性已存 ID/归属/状态边界，不做语义创作判断；已有用户 bug 修复授权覆盖，无新增用户许可。任何把保守 proof 用到内容消费、放宽缺父读、改旧锁/删除断言、从字符串伪造 run 或移植用户数据，均超出此 PASS。
