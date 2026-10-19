# T-1110 公众号当前设置页反例与流程边界独立核对

结论：最小修正应是“当前已在官方 settingpage，直接沿原预算观察真实身份字段”，而非仅筛 action=index。这个缺陷机制已明确，但 T-1110 当前仍 paused/OPEN；在现有任务和研究门状态下不能直接实施生产修正或启动额外区分实验。当前允许登记本次只读证据与最小方案，不以新任务名称绕门。未运行 browser/API/测试，未修改源码/看板，未签研究或产品 PASS。

## 现场事实与源码结论

本次静态根为 /Users/zyongzhu/.codex/worktrees/wechat-stats-evidence/Thirdspace-creator，HEAD 当场核为6e6f2fa36bd0fc7a0b06bbe33f0cd597a6255c86。dom-witness 源码SHA为039dc9abc6716b1efbbc0f60e3e4895da16a9318a973a7fbb3bfaf198dda26c7，测试SHA为d7f8451b1a175acd554cbad680cd2c3a396696a35de75e93d31c50a8513dcc89。

root 提供的当场工具事实：a33430在原Ego20/p1官方settingpage取得readyState=complete、validHrefCount=3、uniqueFullHrefCount=3、AppID label=1；e905d9记录三个可见菜单为账号设置/action=index、账号详情/action=index、功能设置/action=function；0c0f64在p3/appmsg则取得唯一settingpage入口/action=index。本评审未重读浏览器，以这些具名现场观察作为输入，不冒称独立真人签收。p1的AppID标签数量本身也不能代替全部身份字段、可见性、格式和归属校验。

源码 identityWitness.read 的 OA 分支无条件先收全部settingpage href，第156–157行只有完整URL去重数=1才返回入口；否则持续null并在原入口预算耗尽报ENTRY_NOT_READY，goto及readWechatIdentityDom尚未执行。故p1的uniqueFullHrefCount=3构成当前入口阶段确定性拒绝反例。index内已有两个不同href，只筛action=index仍有唯一数2，不能解决这个反例。

这个证据证明当前页/当前reader组合有缺陷，不证明旧产品task56当时也在该页、也有三个href、已扫码成功或用了同一profile。原56 failed/null、未收到当次扫码回复保持；不能倒签其根因或公众号产品绑定成功。

## 最小正确修正及范围

OA先用现有nativeUrl核官方origin、无userinfo及当前pathname。若已在 /cgi-bin/settingpage，跳过冗余入口观察和goto，进入现有 observe(readWechatIdentityDom(...), 'FIELDS_NOT_READY', 480000)；字段未就绪继续原有限观察，不能只读一次null就失败。若当前不是settingpage，保留原入口→实际goto→字段链；p3的唯一入口仍按原链工作，不构造URL/token或从重复href任选。

保留readWechatIdentityDom现有真实可见AppID/名称唯一、wx格式、非空名称和官方path检查；source层原expectedIdentity匹配、登录检测、父signal/end、关闭与profile归属保持。function等其他settingpage子页若不具备合格字段仍失败，pathname本身不是身份成功。不要按昵称、AppID标签存在或action值代替字段校验，也不要增加可见菜单硬门反杀现有隐藏合法入口族。

这是局部消除冗余导航的协议修正，不扩大公共API、报表、权限或数据归属；不需要靠已知不同action去重猜入口。不承诺同时修复“非设置页也存在多个设置href”的其他场景，更不声称修复视频号统计页落首页。

## 恢复后必要 TDD

当前测试缺少该输入族。允许实施后，应在真实source+内置reader的合成公开链先取得行为RED，再做上述最小修改，至少覆盖：

1. 初始导航实际落到官方settingpage、三个不同完整href（index/index/function）、真实字段合格：读取成功，不再查菜单或额外goto；旧实现应因入口歧义失败。
2. 同页字段延迟就绪：沿原480000ms字段预算观察后成功；字段缺失、重复、隐藏或无效仍FIELDS_NOT_READY，不因pathname或菜单存在误成功。
3. 非settingpage只有一个合法入口仍走原导航链；缺入口仍ENTRY_NOT_READY；隐藏合法入口、外站/含userinfo链接边界保留。
4. 当前页字段观察中的原取消、期限耗尽及晚返回不能绑定、晚读/提交或续期；readIdentity的expectedIdentity错误仍拒绝，并保真实停止/未确认停止归属。

校验应调用source公开login/readIdentity及原字段reader，不只测试新分支helper；再运行该改动适用的worker类型、原身份公共链和timeout-policy门。此清单是未来必要验证，尚未执行，无RED/GREEN补签。真实产品绑定仍需另有当场原公共链证据，不能由研究p1或synthetic测试代替。

## 当前流程阻断

已读 [product-to-code-orchestrator/SKILL.md](/Users/zyongzhu/.codex/skills/product-to-code-orchestrator/SKILL.md) 及 [Gate 04](/Users/zyongzhu/.codex/skills/product-to-code-orchestrator/gates/04-research-first-gate.md)。Gate的明确规定是：“触发后原任务转 `⏸️`，暂停四类行为：继续改生产实现、扩大 workaround、重复全量运行、不可逆操作。允许的只有只读取证、更新研究卡，以及卡内最多两次的最小区分性实验。”

目前BACKLOG的T-1110仍⏸️、视频号卡仍researching、原OPEN未关闭且两次额度已用尽。taskctl.mjs:222–227的start/resume按taskId查询OPEN并拒绝恢复，没有按failure family允许同任务局部生产开工的入口。因此，公众号缺陷机制已知并不自动授权在同一个paused T-1110中改生产或把TDD列为第三次研究实验。

技能另说“独立任务可继续”，阶段路由说“开放研究门只阻塞受影响任务”；它允许真实无依赖的其他任务推进，不等于把原T-1110的公众号范围换个名字重置状态/实验额度。这里仍是T-1110已确认范围，不能仅新建标签、挪卡或把OA证据写成视频号validated来绕过原门。

现态应先把本次已发生的只读事实、与旧56的区别、最小方案及验证缺口登记证据/研究卡。原研究恢复仍需证据及现场verify_key闭合，并保持AGENTS指定taskctl唯一状态转换；本报告不建议直接调用会写状态的research-gate resume绕用户规则，也不建议手工关OPEN。若将来确需独立实施，必须先有真实可审计的任务/门范围处理或用户明确调整，保留视频号原阻塞与两次已用尽的事实；当前没有这种处理，故本次止于读证和方案。

评审 homogeneous inherited，仅静态源码与流程判断；未重执行具名现场工具，未签正式receipt、绑定、研究validated或产品PASS。
