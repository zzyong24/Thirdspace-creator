# T1302 局部实现与验证结果

实现基线 `c09e52d54ae313adc40a19ad6fecb894a9d9222d`，真实实施lease `/root/sol_frontend_impl`，SPEC `f2b7b6b6a1b1f3290df51eca50d17f16ee68d722bcd3436b922d5798646058f9`，独审 `REV:a0b5e6f83c1e`，Task Packet SHA `10dca5c68cb6a52a049f4e6ef7f76f3452b0180c056ecb7d55eb38e827236bce`。本报告为局部实现结果，不冒充真实生产视觉、模型或整任务验收。

## 已实现的行为

- 只有实际embed存在、`embed.selection.kind === "project"`、selection.id与当前注册preparation.projectId相等、owner为文章/图文、scope为当前creationScope，且当前state.outputId非空并严格等于preparation.outputId时，隐藏内层通用chips并显示对应自然改稿placeholder。无新props、无URL/历史request猜测；外层发送、停止、清空、hint、项目身份、附件及自然输入保持。
- 字段与事实选择移入原有两种预览Dialog，hook仍在原card/member层，关开不清状态。editor保按需/有界历史读，creation保即时fresh读。
- 标题/摘要/标签、合法空串/空数组、原稿与实际采用后的事实正文/确认状态可读展示。来源仅真实类型和数量；原合同没有名称或原文时明确未提供，覆盖全部合法ref族及两种metadataSource，不补名称、不显示raw JSON/id、不新增来源请求。
- 外卡保一行真实pending提醒；UNKNOWN重挂后原按钮显示已有恢复文案，仍沿原handler/body/key/disabled/preview门恢复，不增按钮或策略。
- `previewAssistedWorkDocument`、`useAssistedWorkReview`与`saveWorkEditorCandidate`同基线逐字相等，见`runtime/final-source-and-invariants.json`。默认field选择、事实keep/replace、source校验、CAS、原请求冻结和未知回执保护未改。

## 真实红绿与失败记录

先原4文件133项通过。只改3原测试后，完整before为144通过/11失败；其中来源展示夹具最初仅有kind，不称完整合法来源保护。随后补齐真实锚并经合同schema.parse，facts和metadata按实际选择投影；合法来源展示再次实际3项RED。原review hook默认/部分fields/UNKNOWN重挂同source/body/key保护基线实际通过。一次前例未消费mock队列造成的“未知文案不同”失败单列为夹具串扰，重置该测试mock后通过，未算目标RED。

三生产文件改动后4文件156项通过。只读复核发现重挂恢复标签遗漏，先把两原测试改为按恢复名称查找，实际2项RED；再仅合并`review.pending`到两原label条件，最终4文件156项通过（29.16秒）。全部原日志保留，不覆盖首轮失败；精确命令、session与exit见`runtime/command-results.json`。

## 检查与来源绑定

标签补修前类型、boundary、semantic均退出0；LED-047原interactions随156组通过，另7原文件113项通过。完整timeout-policy.verify退出0，174项测试通过。该检查后的生产变化仅两原恢复label条件，不改期限/请求/handler，因此未重复完整超时与LED组；最终boundary/semantic/diff-check再次退出0，并补最终静态timeout扫描。最终类型、静态timeout扫描、boundary/semantic与diff-check均真实退出0，最终四文件156项通过；未再重复无关全库。全部命令自然退出，最终ps无Vitest/TypeScript残留，未终止其它进程。

## 明确待验与边界

未运行build、candidate、浏览器、真实模型、索引、安装或发布；未操作旧candidate/旧UNKNOWN/用户库/Keychain。正式新候选中仍需文章/图文预览、选择、采纳、刷新、来源与另一平台隔离，窄窗/200%长内容、loading/error/pending恢复及键盘焦点实际操作和一轮视觉复核。

NoteRelay模板占位与候选/采用后layout差异不在本次写集；最终候选须在真正ready后检查实际预览/导出与采用后投影，若有差异另报真实证据，不能把早截图当定论。本任务不修改T1301、T1300矩阵或控制面，不替C执行taskctl/pmem/reconcile收尾。

原始终端日志逐字保留。完整staged diff-check退出2，仅9个Vitest日志末尾空行；未改日志压绿。六个源/测试文件及报告的精确diff-check单列，不把原日志空行称产品错误。首次暂存因忽略目录未加入报告，随后按已授权精确force-add补齐。
