# T1369 补足尚未执行的受控连续导航诊断

本文件只冻结测试修订提案，待中央追加SPEC/DEC及独立审核后实施。产品代码不在本delta写集内，当前不启动运行。用户卡死的修复目标继续保留，不能以未复现或提案完成代替解决。

## 原件与实际差异

- 基底`10cab133f97821cface88f9d1c0f8426acad763a`产品源码未改。`natural-attempt01`实际正常窗口自然连续链GREEN，不能据此否定用户反馈或签修复。
- `response-attempt02`在首次带组首页document的`page.goto`原120000ms自然超时，尚未到达受控平台筛选/侧栏链；随后finally的DOM evaluate等待执行上下文，独占runner经已核cwd的SIGINT收尾。原FAIL、interrupt、trace及执行源快照保留，不补写成受控RED或GREEN。
- 原`/api/v1/auth/me`600秒readiness只证明身份与持久层装配，不证明目标页面路由已编译、业务组合已完成。
- 安装公开浏览器观察的四个read dispatch实际迅速403且finished，原“pending”解读已撤回。该准入边界不作为生产卡死首因，不预置scope寻找SSR替代路径，不注入握手/header/token或读取连接凭据。

## 唯一允许的补充运行

只执行一次`--project=t1369-normal --workers=1 --retries=0`，窗口1366×900，明确mode=response。它是经追加授权补足尚未执行的受控链，不偷偷续原两次实验，不启动minimum项目，不重跑整批自然族，不安装依赖/浏览器或启动真实用户数据服务。若本次仍失败在装配/夹具/预热阶段，保存原件并停止，不自动再跑。

仍使用本新worktree中的T1356私有PG、T1355合成宿主与T1356真实service seed、禁出网/禁后台、独占不同app/PG/host端口。启动前核自有端口空闲，旧根与三旧树保护；每次root/nonce/UID/PID/数据库身份按原harness核验，不能复用已失败根。

## 真实目标路由预热与阶段分证

在真实身份及私有nonce核验、已有合成scope cookie设置后，使用同context的`APIRequestContext`逐一对以下真实公开Next页面做HTTP GET：

1. `/?startDate=<seed.startDate>&endDate=<seed.endDate>`；
2. `/overview`；
3. `/settings`。

每次从单调时钟start到完整响应body读取结束记录phase、路径、起止、状态、bytes/SHA；每请求600000ms，独立绝对deadline覆盖get及body完整消费，SDK请求只使用该原deadline的剩余预算，不另起或续期。不改写响应/headers/Cookie，不stub任何DTO，不重试。非200、网络失败或完整body未结束立即保失败并停止主链。APIRequestContext只预热真实server路由及读取，不执行页面JavaScript，不预填客户端router cache，也不改变本次浏览器导航的真实队列。

原auth/me readiness仍600000ms，核心操作/导航/有限观察仍原120000ms。预热前后结果与主链分别记录，不把预热耗时藏进“用户操作通过”，不称本delta已修性能。浏览器实际首页、B目标与settings对照仍须真实读取、真实完整响应并实际提交。

## 受控链及判定

保现response-stage机制，只暂停真实首页XHS筛选A收到200头的原响应；暂停期间不读body、不替换任何响应字段。随后通过现侧栏点击B=`/overview`，记录B完整body finished及真实scope，再在原A尚未释放时观察B真实URL/内容/等待收尾；随后释放A并按其真实finished或明确取消检查B不倒退。同一次正常窗口内按现合同做`/settings`轻目标对照，仍分证真实HTTP终态与UI提交。失败与放行后的恢复分开，恢复不能覆盖原120秒失败。

为保持本次有界，只执行这两个受控目标；本次不继续自然账号/日期、快速往返、同目标缓存等整批输入。原自然GREEN的有限输入保留；本次结果不能代签完整FR/AC、minimum、dirty/切组/ABA或最终修复。

request observer补主frame的`resourceType=document`，除原RSC/dispatch外记录首文档started/headers/finished或failed。每事件绑定实际requestId、phase、路径与原安全query；body只有真实完整finished后才记录bytes/SHA/scope，不能用200头冒完成。

## 失败采证与独立有界清理

- 任一主流程失败，catch首先保存原error名称/阶段/时间及已有网络、pending、`page.url()`、`page.isClosed()`、最后一次成功采到的状态及其原时间。不得在失败catch或外层finally调用evaluate、waitForFunction或依赖页面执行上下文的snap。
- 正常主流程内的snap仍可使用原120秒有限DOM采证；原失败之后不为补截图再读DOM。自动trace/已有截图能证明的范围如实保留；无现场像素记录UNKNOWN，不能拿最后一帧冒失败当时画面。
- 外层finally先记cleanup开始时间与已有安全事件，移除会新增异步task的response/Fetch.requestPaused监听并冻结待收尾observer清单，防止清理期继续增加任务。requestfinished/requestfailed等同步终态记账保留至context关闭后，不能为了收尾静默丢掉实际取消。随后正常关闭本次owned context。该关闭使未终态网络/CDP观察取得真实结束或取消；不关闭安装App、用户profile或原任务，不在finally继续/重发产品请求。
- `context.close()`本身独立限120000ms；若未结束或报错，保`context_close=UNKNOWN/ERROR`，随后仅尝试关闭本次owned browser，另限120000ms。所有清理错误独立登记，不覆盖原产品/环境错误，不伪造网络终态。
- 关闭后异步response observers另独立限120000ms：可以`Promise.race(allSettled, deadline)`，不得裸等allSettled。到期记录尚未终态的requestId/observerId为UNKNOWN，不改写成failed/取消或成功。未终态Promise的catch须预先注册，避免退出时未处理拒绝；日志保存不能等待它们完成。
- 主流程完成也沿同一owned cleanup路径。observer清理超时/错误不是主链GREEN，不仅因UI曾可见就标completed=true。

## 完整预算

配置保原test主体7200000ms，并额外覆盖3×600000ms预热、120000ms context close、120000ms browser close及120000ms observer结算，合计`9360000ms`（156分钟）。核心用户观察仍120000ms，不能延长它制造通过。

独立命令wrapper外层至少`10620000ms`（177分钟）：现host启动300000ms + Next readiness600000ms + test9360000ms + 独立进程清理240000ms + 调度余量120000ms。执行工具早yield供持续报告，不把工具轮询耗时当接口耗时。wrapper若耗尽，仅正常停止此次owned runner/子树，记录outer_timeout及cleanup真实状态，不杀用户App/未知进程；不自动再跑。

## 精确写集与未授权范围

只改`frontend/tests/e2e/t1369-dashboard-filter-sidebar-navigation.spec.ts`、`frontend/playwright.t1369.config.ts`及`docs/verification/t1369/**`中的命令、观测与安全证据。复用原harness/seed，不改原T1356配置/旧断言，不改backend、contract、AccountSwitcher、Workspace Provider、共享导航框架、产品spinner/timeout/质量门、依赖或安装资源。中央SPEC追加段、DEC、状态与review记录仅由中央writer维护。

正式运行前核本delta/SPEC追加段的审核SHA与中央放行，保当前产品原字节。若得到可定位的公共RED，再回报具体因果及最小候选；未得RED不改生产。本次提案不预定两transition、Next队列、backend慢读或CPU样本中任何一个就是首因。
