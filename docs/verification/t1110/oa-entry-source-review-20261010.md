# T-1110 公众号身份入口静态独立核对

结论：存在明确的测试缺口，以及可由不同 action 菜单触发的条件性协议缺口。当前观测尚不能证明产品公众号任务56的真实根因。只读研究页能读到单一 AppID，不等于产品 profile 已绑定；三个可见同 pathname 菜单，不等于三个不同完整 href。

本次根目录为 /Users/zyongzhu/.codex/worktrees/wechat-stats-evidence/Thirdspace-creator，HEAD实际23c3bedc0e8216e20b67f39c653e34a3dfdd508e。技能与项目记录均3.29.0。T-1110仍暂停、视频号研究卡researching/OPEN且两次实验已用尽；本次仅静态证据，不启动第三次原生实验、扫码或公开任务。

## ENTRY_NOT_READY 的实际源码条件

wechat-dom-witness.ts:152–159 的公众号 read 流程先观察入口，再导航，最后读身份字段。入口收集使用全部 a[href]，包含隐藏链接；对 href 按当前页解析、核官方 origin且无userinfo，再只按 pathname=/cgi-bin/settingpage 过滤。第156–157行按完整 url.href 建 Set，只有唯一数为1才返回有效 href。

因此，0个有效完整 URL 或2个以上不同完整 URL 都返回null并继续原480000ms入口观察，耗尽后报ENTRY_NOT_READY；这两种情况不分段区分。三个不同action的同path链接若各有不同完整URL，必然无法达到唯一数1，即便其中一个是合法账号设置入口；重复节点若解析后完整URL相同则只算1。token、其他query值或query顺序不同也可能使完整URL不同。静态只能证明该触发条件，不能证明现场已满足。

此错误发生在 settingpage 的 goto 和 AppID/名称字段读取之前；它不证明AppID selector失败，更不证明Cookie失效。当前已在设置页有字段，reader仍先收集入口，不会直接跳过入口观察。本轮 root 报告研究p1当前AppID唯一且原摘要匹配，只支持该研究页身份字段仍可读；任务56未收到本次扫码回复且产品accountId=null的旧事实保留。

## 当前测试覆盖

wechat-dom-witness.test.ts:207–263 的 source+内置reader合成链只有：一个隐藏同源 settingpage?action=index 入口成功；缺入口产生ENTRY_NOT_READY；进入设置页后缺字段产生FIELDS_NOT_READY；原取消/期限优先且不晚导航/读字段。源码字段单测另覆盖AppID唯一性、不同ID同昵称、关联应用不误取及外站拒绝。source.test 的两错误码诊断检查是注入错误，不能补入口筛选族覆盖。

未发现同pathname不同action菜单、其他设置子功能并存、目标入口与隐藏其他action并存、重复目标节点或同目标action不同完整href的用例。现有 fixture 的 action=index 是合成值，不能由它推导真实官网目标action。本次未运行测试，不补签RED或PASS。

## 下一步必要只读观测

在 root 已接回的原研究p1同一DOM快照内，仅解析既有菜单链接，不点击、导航或重试。必要输出为：

| 观测 | 用途与边界 |
|---|---|
| currentOfficialOrigin/currentSettingsPath 布尔值、readyState | 固定当前观察页类，不输出原URL |
| validHrefCount、uniqueFullHrefCount | 在浏览器内按当前生产同一规则计算；可证实是否实际歧义 |
| accountSettings/accountDetails/functionSettings/other 固定菜单类别的总数及可见/隐藏数 | 区分原生子功能并列与同一入口重复；不采其他正文 |
| 各上述类别对应的 action 协议值、action缺失/多值数量 | 仅 action 参数，定位目标路由；不输出href、token或其他query值，意外非协议值按unknown处理 |
| 每个目标action的uniqueFullHrefCount | 检查正确目标内部是否仍有完整URL歧义；完整href仅内存去重，不输出或散列会话URL |
| AppID/名称可见唯一数量、格式成立/摘要匹配布尔值 | 只确认当前普通账号页；不输出ID、昵称或原字段正文 |

不从当前研究页推断原产品profile的历史href数量、登录状态或任务56原因。是否需要更多只读字段应由这次具体结果决定，不采全query/账户目录或身份清单。

## 最小正确协议规则（待实际协议核实后才形成候选）

保留官方origin、无userinfo及settingpage pathname边界；先用当场核实的普通账号设置目标action/固定入口协议过滤，再只在该目标候选内检查完整href唯一性。其他settingpage子功能不能制造目标入口歧义。相同目标href的重复节点去重成1；多个不同目标href仍拒绝，不盲取第一项、不构造token、不去掉会话query后任选、不硬猜action=index。

可见性先用于观测，不自动新增“只能可见入口”的门：现有隐藏同源入口成功族有明确测试，导航到合法原href并不要求强制显示或点击隐藏UI。字段阶段继续要求普通页AppID/名称真实可见唯一、固定格式与原身份匹配；不按昵称或菜单语义猜账号。入口、导航、字段沿原预算和signal/end，不续期、重发或改变停止/归属规则。

未来若允许候选，应补“目标action+两种其他action并存仍成功”“同目标href重复节点成功”“多个不同目标href仍失败”“只有非目标action不能成功”及原外站/取消/期限族的公开source链行为验证；这只是建议，不表示已实施或通过。当前研究门未闭合，不改生产、门卫、契约或任务状态。

仅阅读指定源码/测试与已有状态文档并计算摘要，未执行browser、API、测试或任务命令。评审homogeneous inherited；仅写本 /tmp 文件，无产品绑定、研究validated或产品PASS签收。
