# T1110 菜单与可见根修正的串行预算核对（2026-10-10）

仅只读核对恢复后工作树的当前源码；未修改共享树、状态、浏览器，未运行测试/API。本轮恢复事实由root提供：event-only 37ff86、taskctl305fe7 exit0和auditfaec7b exit0；本文不替代恢复证据核验。生产DOM候选尚待提交，下面给出按实际消费者计算的最小建议。

## 当前真实公式

contract/src/timeout-policy.ts 定义每个新正执行至少120000，completionWaitMs 对各内层预算求和再加10000；remainingDeadlineMs 从原绝对deadline取剩余时间。

wechat-browser-source.ts 当前：
- SDK_LAUNCH_BUDGET_MS=120000；
- LAUNCH_GUARD_BUDGET_MS=completionWaitMs([120000,120000,120000])=370000；
- STARTUP_BUDGET_MS=completionWaitMs([370000,370000,370000])=1120000；
- OA身份预算：[480000入口观察,120000设置导航,480000字段观察]；
- video身份预算：[120000主页导航,480000字段观察]。

含startup、初始goto120000、身份消费者、末尾清理120000和completion余量10000，login/readIdentity默认为OA2450000、video1970000。collect当前每kind另计10×120000，OA两份默认4850000，video三份默认5570000。当前source.test.ts:250–251有这些确切默认值回归。

公众号当前settingpage直读是缩短该分支，不应因此缩短已保留的最坏分支默认预算。OA默认和旧唯一href导航分支继续保留。

## 原十槽与新增量

旧video prepare/receiveReport中的显式等待消费者可对应：
1. report goto；
2. runtimeFrame观察；
3. 唯一可见section观察；
4. section click；
5. 详情7/30天控件观察；
6. 7天 click；
7. 30天 click / works原生response等待；
8. 实际日期/行数ready观察；
9. 下载href getAttribute；
10. 下载click / download事件等待。

works waitForResponse先注册再点击30天，两者同时占用墙钟；download waitForEvent亦先注册后点击。因此各对可按max计一个120000槽，前提是没有另一个独立延后重试或重新等待，listener错误真实处理、晚结果不推进。source已有pending.catch避免未处理reject。不要机械将两者相加，也不要把真正串行等待误算并行。

若新菜单写成：
- observe唯一可见“数据中心”；
- click数据中心；
- observe唯一可见“视频数据”或“关注者数据”；
- click实际子菜单；
- waitForURL到对应Page固定path；
则为5×120000，替代旧goto的1×120000，净增4槽。

若在已有runtimeFrame observe之后，另有visible/open host与代理section同根的observe，则净增1槽；其中唯一host、shadow.contains代理节点、host引用等即时布尔核对可以归同一有限观察段，不需要每个布尔单独120000。真正串行且各自允许完整120000的观察/点击必须分别计。

此实现形状最小为每kind15×120000，video collect默认变为：
completionWaitMs([1120000,120000,120000,480000,45×120000,120000]) = **7370000**。

这只是对明确实现形状的建议，不是要求固定15：
- 若实际菜单仅两次受SDK120000保护的click加URL等待，替代旧goto净增2槽；加独立host观察时13槽，video默认6650000。
- 若runtimeFrame与visible host关联共同在一个真正有限观察段完成，不另占完整串行120000，则再少1槽。
- 即刻metadata/count检查不等于新的自动等待；不要凭字段数量增加预算。
- 若新增root verify、DOM读取或响应/stream接收有独立120000上限，实际串行消费者必须另计，不可以隐藏在菜单槽、启动余量或清理余量中。

因此最小可读实现是列出导航、root、selection、download实际阶段的有名预算，按kind求和；避免继续只用无解释的Array.from(length:10)。无需改服务契约、共享guard或原持久任务预算。

## 原deadline不可变

withProfile的end为min(localEnd,inheritedDeadline)，op.timeoutMs为min(单次显式预算,原end剩余)。backend wechat-native-collector固定run.startedAt+30min，另有父signal和独立外层race；新内部local fallback即便大于30min，公开采集仍在原1800000到期，不应改startedAt、不重发、不续期、不重开一个新“菜单任务”。

每个新SDK click/waitForURL传op.timeoutMs；waitForURL不传现场已证明不支持的waitUntil。增加默认local计算不能解决某个未被signal/有限race实际覆盖的await；候选要单独检查observe内部read、host关联evaluate、works response.finished/json、下载stream等实际消费。await前后signal/end检查用于拒绝晚推进，不等于那个await本身具有120000执行上限。

当前source.withProfile在openProfile前仍await共享guard；guard.ensureChromiumLaunchable预检在其内部launch race之前await。此前已明确的预检不受内部race覆盖限制仍存在，本轮预算增量不应宣称修复它，也不应扩改共享guard。withProfile finally的context.close也不因预算数组末尾120000而自动成为可中止close；真正close/onStopped与pending-stop所有权继续由既有生命周期/公开执行器处理，不能用计时器伪释放资源。

## 最小验证要求

作者提交实际候选后应按其完整串行等待清单复算。必要实际RED/GREEN包括：

1. 当前默认数值回归在新的实际消费量下先RED；保OA2450000/4850000和video身份1970000，不因快捷分支缩短默认。
2. 至少一个正式source链的假时钟慢成功样例，真实执行新导航/root步骤，每个消费者在自身预算内接近上限；证明老十槽会过早截止、新外层允许三份顺序完成及真实停止。不要只把期望5570000改成7370000证明算式。
3. 同一链加较早继承deadline/父取消：在原期限停止，晚菜单/root/响应不点击下载、不onReport；完整三份或最后terminal不能借新local预算越过原deadline。
4. 至少一条原公开执行链回归保run.startedAt、TASK_TIMEOUT/CANCELLED主原因、stopUnconfirmed、部分报告保留和租约归属，不只helper预算测试。
5. worker typecheck及node tools/timeout-policy/verify.mjs。本文未执行，不记录PASS。

## 同根补证判断

root给出的0c1055/87db32新现场补证证明Wujie会代理node.getRootNode/ownerDocument，但parent原生Node.prototype.getRootNode.call(proxy标签节点)等于实际host.shadowRoot，shadowRoot.contains(proxy节点)也为true。相对独立的计数拼接，这是实际节点归属证明。

生产以唯一visible/open host、匹配runtimeFrame，验证代理唯一section节点在该host.shadowRoot内，比“两个boolean都为true”强；可使用parent realm Node.prototype.contains.call以免误信节点自己的代理方法。每次read/verify仍核原host引用connected/visible与Page/Frame固定path；实际被读filter/日期/总数应属于同代理根，不能改成全Page宽搜。无需新增公开字段、用户权限或质量门。真实request.frame仍为runtimeFrame，不由UI Locator替代。

