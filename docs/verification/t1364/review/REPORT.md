# T1364 独立初评与下一观测边界

本轮未发现需整改的规格缺口，规范包为 `findings.json`（`spec-review-round/v2`，`initial`，`findings: []`）。这仅是诊断合同审阅，不是T1364验收、真实视频号恢复、下一真实诊断的执行回执或产品修复许可。SPEC冻结SHA256为`c4c8dce88a557fbc503b4e40486dd99d57f37b44cd10466f17da26c2924a5819`；副本为`SPEC.input.md`，精确输入SHA及e676 Git对象全等核对见`inputs.json`。

已按项目入口读取任务/SPEC、项目记忆、产品流程与阶段路由、架构。技能与项目流程均为3.29.0；当前为4-build中的独立诊断规格审阅。仅写本review目录，未改SPEC、中央状态或产品；未运行测试、平台、浏览器、服务、采集或解密器，未读profile/凭据/用户库。原日志仅消费执行者已经生成的安全投影。

## 规格核对

FR1364-1冻结真实attempt、归属与实际时间窗口，禁止用同错误码或相近时间拼接；FR1364-2只保生产已有白名单诊断，缺字段保UNKNOWN；FR1364-3将公开终态、事件、源码消费链及候选分开；FR1364-4不让一次已消耗的采集授权延伸为重试或源码修改；FR1364-5将安装交付与采集恢复分证。验收1要求后续用原安全来源补齐完整UTC、owner与single-POST关联，验收2/3要求明确已证阶段和缺少的观测。当前缺失材料是验收前待绑定证据，不是允许猜补的规格例外。

安全投影自身没有user/group/account字段，也不是POST调用台账；本审阅不据它单独认证这些字段或唯一POST。SPEC现有125.447秒与generation=2也不能替代这些证明。保留原1499、T1363受控GREEN与新281真实failed三份不同证据，符合合同。

## 新281能证到哪里

亲读外部`failure-diagnostic/SAFE_EVENTS.json`，其精确attempt为`collection-92ecb053-281`；窗口为`2026-10-18T22:45:42.097543+00:00`至`2026-10-18T22:49:40.784327+00:00`。唯一白名单事件时间`2026-10-18T22:47:48.382Z`，为`wechatVideo / prepare / channelsDaily / REPORT_LINK_MISSING`；最后保留的`entryObservation`是`wait_entry_or_centre`、entry可见计数0、centre可见计数0、centreClicked=false。投影记载严格attempt+窗口过滤、无第二次collection、decoder成功且无截断/不完整块；本审阅未重复读取其密文或明文日志。

e676实际source在`wechat-browser-source.ts:312`先await同Page的`identity(..., expectedIdentity)`，成功后才在317进入prepare；identity核官方origin、稳定身份字段与原expectedIdentity。因此结合该事件可证此前身份读取已经返回并通过原绑定身份比较。这不能证明失败时或当前登录仍有效，更不能推出登录过期。失败后isLoggedOut仅显式true才改成LOGIN_REQUIRED；未知/检测失败不等于稳定登录有效。

`wechat-dom-witness.ts:203`使用exact可见文本“视频数据”（daily）与“数据中心”；入口观察在同Page内核官方origin。最后0/0只说明最后保存的已知候选计数，不能当作完整页面导航清单，不能证明新菜单名称、所有iframe/影子结构内容或整个等待期每一时刻均无入口。phase与typed错误把失败定位在入口等待；centreClicked只在await点击成功且取消后检查通过后置true，一般情况下false不能独自证明从未发生物理点击。此事件没有click完成回执，不虚构点击。

source的首kind就是channelsDaily（第25行），prepare完成以后才receiveReport/download、以后才onReport（317–320）；collector再parse/commit（140–152），未识别底层code时映射EXPORT_FAILED（reasonOf）。所以此事件与源码链支持本次首报表prepare尚未完成、后续正式报表下载/解析/提交未开始；这比单凭committedPages=0或EXPORT_FAILED推测更具体。它不代表页面没有打开、没有任何网络访问，也不证明125.447秒就是某个外层总期限到期。最后计数也不足以确定selector应该怎样改。

source finally会调用closeProfile（291），collector以实际onStopped/资源释放确认管理租约，未实停不会在finally冒充释放（collector:244–247）。这些是代码合同；当前SAFE_EVENTS本身没有独立关闭/释放回执，不把静态finally写成该次实停证据。已有失败Page没有公开可重连凭证，GET终态不会还原历史DOM。

## 现有公开与owned浏览器能力

`platform-collection.ts:42–52`的POST启动完整collection、GET读取既有run；现有报表/作品/指标GET读取已持久业务数据，没有“仅观察绑定账号实时导航”的公开操作。正常accounts.bind.start走新绑定生命周期，不能拿来观察此绑定profile；collection start会继续准备/下载/提交，不是只读探针。

正式采集profile由backend `browser-profile-authority.service.ts:40`通过当前ctx与真实账号读回核owner、平台稳定身份，再派生目标授权；宿主装配`persistence-client.ts:4717–4720`通过此authority及hostProfileLifecycle.acquire后才将目录交给source。worker本身不通过任意用户目录输入授予权限。

通用`browser.open`只接受laneId/mode/domain（`workbench-browser-host.ts:26–30,73`），从可信execution context解析managed profile（148–155）；Rust的profile_location（browser.rs:401–429）明确返回`legacyIdentityImported:false`和`primaryLoginState:unverified`。它使用自己的managed browser profile，不能因accountId相同就视为原生Wechat采集的已登录档案。browser.observe/内部sessionId观察需要它们各自真实活会话、冻结授权和租约；不能把281换成这种sessionId，也不能借通用Lane、外部浏览器附着、复制profile或登录快照来绕过原authority。静态查到的公开/owned入口没有能够直接、安全复用该原生绑定profile作实时导航观察的现成操作。

## 建议的下一窄delta（策略，未执行）

Root已选定同owner、同正式profile、backend authority及host lifecycle的一次只读导航诊断。优先复用现有service/worker窄端口及身份witness/浏览器生命周期；不新增UI，不接受任意profile目录、URL、selector或平台身份输入，不再调用collectNativeReports/collection start碰运气。必须由真实backend成员/账号授权读回，取得当前expectedIdentity与正式profile授权，再取得同类宿主租约，在同一个实际Page完成身份核对后观察普通官方导航；禁止猜统计深链、下载、onReport、parser/业务commit、发布提交或自动登录/扫码。

下一次是独立且有明确唯一调用记录的诊断，不重启、续期、改写或复用已终态281的执行额度。执行期限和取消从该诊断原归属继承并贯穿启动、身份、导航、观测与清理，保留完整预算及外层余量；不因观测不充分自动第二次执行。原1499/281及其它旧任务保持原样。

仅再加固定计数无法识别真实导航。建议在同身份核验后的实际官方Page中，取得足够区分顶层普通导航尚未就绪、可见菜单结构差异、frame/影子结构、显式访问/认证状态的导航结构，必要时一张私有viewport截图。普通安全输出只保阶段、经过核验的路径类别（无URL/query）、就绪/结构计数和真假未知状态；实际role/label导航树或截图只作为本次用户授权的私有最小证据，限制区域、长度/张数、访问权限和原件SHA，排除Cookie/token、网络正文、profile、URL/href和大段用户内容，审阅前做必要遮蔽。不要把完整DOM或整页文字写日志；保留可辨导航证据供人核对后再形成修法，不能观察完又凭猜换selector。

这比当前FR1364-2白名单增加了真实观测与私有页面证据权限，必须由controller先形成窄SPEC delta、明确写集/授权/保密与停止合同并独审，不能把本报告建议当当前规格已放行的实现。新的正式公共API并非预设要求；选择最小内部service/worker复用时仍必须有backend authority及可审计的单次入口，不能直接脚本传profile。

停止验收须得到该次真实context停止及宿主资源释放回执并关联诊断ID；异常、取消、耗尽、开窗迟到均需覆盖。未实停则保留占用/恢复职责，不声称释放；诊断取证失败不能改写原采集错误或放宽归属。后续受控验证应覆盖越权/错身份、官方origin、取消/耗尽/迟到close、诊断IO失败、零download/onReport/commit与真实authority→lease→source→停止公共消费者链。这些是下一delta的审阅条件，本轮没有运行或代签。
