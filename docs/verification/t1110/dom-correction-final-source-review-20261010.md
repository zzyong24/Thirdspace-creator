# T1110 DOM修正最终源码独立审查（2026-10-10）

仅只读审查 /Users/zyongzhu/.codex/worktrees/wechat-stats-evidence/Thirdspace-creator 已应用候选。评审模式为 homogeneous inherited。未修改共享源码/状态，未运行测试、API或浏览器；没有代签真实平台、绑定、五报表入库或产品PASS。

读取HEAD：5f7648fa309fd4e5ab6df0ede5c32cda6e26ee79。最终读取生产文件SHA：
- ai-worker/src/runtime/platform/wechat-dom-witness.ts：10d7b940110ffc96316c2687bae539259c2ba22feabebde34a57d12144c1048b
- ai-worker/src/runtime/platform/wechat-browser-source.ts：f172f920fefc08a2c00d39e753eda97a0e0391369bc7064f60d2c6bd48403d0c

root已具名告知event-only 37ff86、taskctl305fe7 exit0恢复及auditfaec7b exit0无OPEN；本评审没有另行操作或签发流程状态。

结论：当前最终diff的公众号入口、Wujie同根读取、固定路径、runtime请求归属及取消后的业务提交边界与最小修正方案一致。首次发现的works监听顺序问题已被root实际修正并复读确认。未发现该最终diff新增的确定生产阻断；完整测试/type/timeout/public链及真实平台结果仍按实际运行证据登记，本文不替代。

## 1. 公众号修正保持原身份协议

identityWitness.read 在 nativeUrl 校验后的当前pathname为 /cgi-bin/settingpage 时跳过设置入口收集，直接沿原480000字段观察读AppID/name。其他pathname仍收完整真实href、去重唯一、用该href导航再读字段；没有action=index筛选、first、昵称或session兜底。

readWechatIdentityDom仍要求实际唯一可见账号项、AppID格式和非空name；source.identity仍核expectedIdentity和脱敏sourcePath。新正式source测试模拟起点goto落settingpage且有3个不同设置href，避免只测helper；缺字段、重复AppID、外站同path也仍拒绝。历史产品56的根因不由该反例倒签。

## 2. Wujie UI与runtime绑定成立

prepare保留 scope=唯一实际runtime Frame。uiRoot为Page中唯一visible wujie-app Locator；host ElementHandle被保留用于后续复核。无有效Wujie section时，真正可见普通iframe仍沿原Frame控件路径处理；没有force/show/first或重选另一Frame。

rootReady每次检查：
- 父Page官方origin和对应 /platform/statistic/post 或 follower；
- 当前唯一匹配 /micro/statistic/post 或 follower 的Frame仍为所选scope引用；
- pinned host仍connected/visible、仍为唯一visible/open host；
- runtime主realm代理document中的唯一实际section节点，由parent原生Node.prototype.contains确认属于当前实际ShadowRoot。

该证明用实际节点归属，避开Wujie改写的node.getRootNode/ownerDocument，比两份标签计数拼接充分。root给出的a6b4e5真实只读补证支持实际iframe主realm访问parent.location/host；本评审没有再访问该Page。

readWechatReportDom在shadow分支再次核父路径、唯一open实际host及代理section节点所属，然后把root切为这个实际ShadowRoot。加载状态、详情日期控件、dateCells、作品总数均由root.querySelectorAll读取，因此数据行不会继续从整个代理document宽搜。read()在数据读取前后均复核rootReady，verify再次调用该read；父路由、Frame引用、host或日期/行数变化不能用旧state自证ready。普通iframe与公众号仍用原Document协议。

UI的tab、7/30天控件和download都来自uiRoot。works response仍严格判定真实runtimeFrame request.frame、官方固定endpoint、本次newRequests以及冻结的请求窗口；没有把Page mainFrame或UI Locator代替runtime Frame。window冻结语义、统计30天/发布时间30天、reportedRows/visibleRows原约束未改变。

## 3. 已发现并关闭的具体finding

最初读取的dom source SHA dc20abe588e5f6a40573bc3ae6e682a912411093dd9f068b8148169398bba393，在works waitForResponse注册后await assertRoot，再点击30天。新增根检查会先消耗响应等待的120000窗口，可能pending已经失败却仍点击30天，且不能再按response/点击同时一槽解释。

最终SHA 10d7b940... 已把assertRoot移到该分支page.on/request和waitForResponse之前。现在监听注册紧邻30天click，期间没有额外await根检查；listener仍先于点击、pending.catch保留、request监听finally off。该finding关闭，不要求重试或重发。

## 4. 契约、诊断和停止归属保持

WechatPreparedReport.scope仍为Page|Frame，receiveReport仍以runtime scope.url校验官方URL/base，以独立download Locator触发原生下载。最后sourcePath仍固定 /platform统计入口，不改为iframe路径，不输出完整URL/query/hash。五报告kind、selection、expectedRows、byte大小守卫及worker逐份onReport端口未改；不增加worker写库或公开API参数。

原五字段probe只在尚未选择host的Frame分支读取，exact/visible Locator均来自该Frame；已选择Shadow host的缺失不拼接Frame与Page两根快照。没有新增正文、URL、auth、identity或私图路径到诊断。普通错误与原取消/期限优先链仍保留，只有既有明确loggedOut证据转LOGIN_REQUIRED。

新click/waitForURL/elementHandle使用controls.timeoutMs；rootReady在启动前复核signal/end，异步检查后复核signal。原source外层bounded和原公开执行器30min/父signal仍阻断晚业务回调；本次diff不改closeProfile/guard/onStopped/onStopUnconfirmed或profile租约释放。真实停止不确认时继续既有保留所有权处理，不把JS检查成功当停止证据。

## 5. 十五槽预算合理，验证口径须准确

REPORT_STAGE_BUDGETS按明确阶段列15个120000：菜单最多5段、runtime Frame、UI根/标签观察、标签点击、日期控件观察、7天点击、30天点击/响应、实际ready、href、下载点击/事件、失败probe余量。菜单替旧goto净增4；host观察并原标签观察而非再增加独立120000。works根检查已移到监听前，使同一响应/点击阶段重新符合同时占用墙钟的设计。

video collect local默认为7370000，OA原4850000与两平台身份2450000/1970000不缩短。公开backend仍run.startedAt+1800000，withProfile取min(localEnd,inheritedDeadline)，不续期、不改原ID或自动重发。

十五槽对应显式正等待的阶段清单；不可把它解释为所有DOM/protocol await都具有独立120000硬上限。现有observe内部await、metadata/evaluate、response.finished/json和close仍受各自实际消费者/外层与既有生命周期制约。原共享guard预检race前await及context.close不可即时中断的既有边界没有由本diff解决，不能补签为修好。

已只读18例新测试内容：涵盖Wujie native/proxy分裂、当前OA设置页、三份与普通可见iframe、重复host/frame/section、proxy跨根、prepare后Pagepath/pin变化、错frame响应、取消/原期限及晚response。root告知18例实际GREEN及4file126例运行中，本评审没有执行或补签这些结果。

需要纠正一处证据措辞：wechat-wujie-regression.test.ts最后“新增真实串行消费者由default外层预算覆盖”用例，实际仅在前两份onReport回调各setSystemTime(+2900000)，不是让新菜单/host阶段各自慢执行。它有效证明clock超过旧5570000后新default仍可交第三份，且非只改常量断言；但不能声称完整新增步骤最坏串行预算已现场验证。建议把测试名和报告结论改为“回调时间推进超过旧default后的完整source完成”，完整菜单/root慢成功若未运行如实待验。该证据口径不要求再开研究实验或扩用户范围。

## 6. 仍待原验收，不能倒签

本文只签本次源码一致性审核。应记录root实际RED→GREEN、完整worker tests/type、timeout-policy与公开执行链真实结果；最终本人账号五报表、原profile真实入库、QA验收仍以实际产品链证据为准。过去两原生实验、failed0、历史首页导航原因unknown继续保留，不能用当前Wujie机制解释全部历史失败。没有新增全量目录、发布能力、权限流程或研究实验。

