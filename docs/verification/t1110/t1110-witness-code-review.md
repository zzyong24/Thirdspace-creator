# T1110 内置witness增量源码只读审查

2026-10-09；HEAD b1f0cc5462285e59531a329a42340abe84c8d0ac，包含未提交工作树。仅读当前五个实现文件、相关合成/公共DB测试与官方公开文档；没有改产品/控制面、操作浏览器/用户库/Cookie或读取私人身份/报表，没有重跑测试。源码快照见文末。

**结论：本次快照有三项需要修复；其余指定接缝未发现新的确定性源码缺陷。** 前两项root已确认准备补实际RED→GREEN；本报告不会把“计划修复”写成已关闭。产品独立profile真人QR仍待验，本代码审查不代签整体T1110。

| 必修项 | 精确触发与修法 | 最小回归 |
|---|---|---|
| 登录误报 | wechat-dom-witness.ts:116仅rect/[hidden]判断可见。CSS visibility:hidden的扫码提示仍有布局rect，能在有效页面让isLoggedOut返回true，source:176/201继而误写LOGIN_REQUIRED。应复用身份/报表已有getComputedStyle display/visibility核验，不能拿未显示提示作Cookie失效证明。 | 正常账号DOM加visibility:hidden扫码提示仍false；实际显示同提示为true；缺ID/普通网络失败不变登录过期。 |
| 午夜重算窗口 | witness:151在请求前用now形成单篇目标，await response后:163重新windowFor(now)。上海23:59点击、00:01响应时，已真实核实的合法原窗口被下一日新窗口拒绝。prepare一次冻结operationNow和目标，全程使用同一选择；不重算/续期。 | now从23:59跨至00:01，原frame/request完成后仍按原选择下载；保存原publishedDates，不移一天。日报也用同次准备的冻结目标。 |
| 无frame事件反杀 | witness:152监听page全部request时直接request.frame()，该方法对部分合法浏览器请求会throw，事件回调未catch。应仅忽略无法证明属于当前frame的request，再继续等待真post_list，不输出raw URL/error。当前response predicate和response reader已有catch。 | 发一个frame()抛错的无关request，listener不向事件总线抛出；随后当前frame正常请求/response成功，finally移除监听。真实微信是否产生此事件未实测，不宣称已观察；这是所用Playwright端口明示允许的输入。 |

第三项API依据：[Playwright Request.frame](https://playwright.dev/docs/api/class-request#request-frame)说明部分请求尚无可用frame且该调用会抛出，包括相关导航/Service Worker场景。本审已直接读取官方页，未据此推断微信当前启用了Service Worker。

已核正确的接缝：

- AppID固定协议：witness:42–46仅普通settingpage明确AppID/名称标签，不取可修改公众号ID或昵称兜底；重复AppID/空值拒绝。官方[微信支付开发必要参数](https://pay.wechatpay.cn/doc/v3/partner/4013080340)将公众平台公众号/小程序申请的AppID解释为唯一标识；结合root传递的本人普通账号设置实际witness，可支持当前固定ID方案。这不证明本人产品QR已完成，也不授予API或搬Cookie权限。视频号则核普通首页文本与clipboard一致并保持身份比较。
- 实际日期和控件：witness:147明确详情.filter-row:has(.filter-extra) radio，不再全scope近30 first。日报昨日结束与单篇今日结束分开；scope检查精确同源frame路径。works请求检查POST/currentPage1/pageSize10、秒级日期、完成响应、errCode0及真实总数，不构造/主动调用私有接口。
- 抗旧响应：:151–160用当前frame新发request对象集合排除监听之前已在途的旧response，predicate再核endpoint/window/frame；reader核真正response完成和平台成功，再与DOM总数匹配。不会仅以近30标签就绪。现test:56–72把新request在waitForResponse fixture内部提前发出，验证predicate但未完整还原click触发的实际时序；建议按下一段补更准确的行为fixture，不因此把源码已排除旧对象说成缺失。
- 公众号就绪：:60–87由当前可见inputs与原生href的实际日期同窗形成nativeDateInputs，未造完整日期数组；source:75–76仅公众号按此证据接受分页/图表，视频号日报仍须完整日期集合。prepared.verify在点击前重读同窗/总数，实际下载文件仍由parser严格核日期，不放宽格式与归属。
- expectedRows完整穿过download:145、composition:4695、collector内部input，到parser:305–306提交前核真实CSV行数；不进入公开DTO。13总数/CSV10或14拒绝，真实0可以成功；collector:63已把REPORT_ROW_COUNT_MISMATCH映射REPORT_PARSE_FAILED，公共integration:117–127断言保前两份报告且不入第三份。
- 原期限/取消：source用原deadline remaining截断每个wait/request并独立AbortSignal.any，prepared.verify后/下载后/交callback前复核signal；collector沿原startedAt期限、串行lease renewal和stopUnconfirmed规则未被这批增量改变。原platform owner/group/generation守卫不放宽；原报告与partial保存语义继续有效。

除上述三项对应小回归外，最少还需两条针对新接缝的行为证据（不扩大产品范围）：

1. 被动请求真实时序fixture：旧request在监听前发出、其response在点击后迟到；新request由详情30 click触发。只新request被接纳，旧/其它frame响应不能代签；finally listener移除。不要用waitForResponse mock自行造一个点击前就成功的request来代替这条。
2. 在完整browser-source上注入内置DOM witness与明确browser fixture，原剩余deadline或取消发生于待post_list response时，外层沿原ID结束，物理关闭/未确认如实保留；随后late response/late下载不交onReport。至少确认新witness传递expectedRows到真实parser的公共链并保持仅2/3全部report才完成。已有合成helper覆盖不等于这次reader真实DOM/时序完成。

32worker和实五文件5PASS为root已报告的实际结果，本人未重跑或读取私人文件；不把其成功声称为本人观察的真人平台/QR证据。Ego.url async与Playwright.url sync首次桥接null是工具adapter不匹配，不是本源码API缺陷；后续实际DOM重读结果仍须root如实记账。普通页witness、私人实文件、独立产品扫码与真实Chrome视觉验收彼此不能代签。

本次写报告时的open形态：rect-only login=false；重算window=true；无guard request.frame=false。后续root修复须按新SHA复核，不能沿此快照自称已关闭。

| 审阅文件 | 当前SHA256 |
|---|---|
| ai-worker/src/runtime/platform/wechat-dom-witness.ts | a28840408f4107de61dbc3f2c8526c30ebc92e3b13badc34c4febacb954f1949 |
| ai-worker/src/runtime/platform/wechat-browser-source.ts | 9a92c5c9e34266da6d0bb800c343fc14b3664190e5a92b6c1939b04d7fd05fcf |
| ai-worker/src/runtime/platform/wechat-native-report-parser.ts | 7244f11d1d46c0edd4aeb190217d23b85dd8738a4cd578083c36f3202a8b9d07 |
| backend/src/application/collection/wechat-native-collector.ts | c09b829dc9ecf0b19b8b89ffa901a732f68500018d94b32d20d11d0a93f02dd9 |
| frontend/src/server/persistence-client.ts | 2d9175f1294f5244bd4bf71027c01e081ef3abf3d91a7add6614641d449e13dc |
