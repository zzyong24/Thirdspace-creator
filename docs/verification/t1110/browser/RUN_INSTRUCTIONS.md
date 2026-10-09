# T1110 候选执行说明（未执行，不是PASS）

本轮子agent仅创建/tmp候选，读取root明确授权的脱敏pack并做语法/纯契约格式检查。未启动服务、未操作浏览器、未访问root真人产品31410或原私人导出/Cookie/profile，未改共享树/HEAD/控制面。旧Playwright候选已删除，当前只复用ego-browser 2.0.0文档API；没有import Playwright或launch浏览器。

root先完成既有context/Gate控制路由并冻结实际源码。当前root在改persistence-client/account-binding-panel时，prepare会明确拒绝，不能用旧HEAD副本代签当前产品。按实际落点创建并提交候选脚本、PAGE_SPEC唯一机器区块和对应allowlist后再运行，root唯一writer；本文件不绕过旧T1026 glob/context progress欠缺。

## 三层证据

| 层 | 真实执行对象 | 不代表什么 |
| --- | --- | --- |
| 数据事实 | root五份私人实下载的脱敏代表投影；原source hash/日期/值/0/null/列/单位，text/opaqueId别名 | 不代表投影字节没变，不提供账号身份proof |
| 页面旅程 | 同Ego空间20中root指定的测试Page；完整Next原路由/SSR/组件/styles；公开HTTP建组/登记/转组/回读及真正的membership guard | 本次组/成员是临时测试登记 |
| 执行状态 | /tmp影子composition的report read、nativeReports start/get/cancel、局部readiness端口替身；响应未知/partial/timeout/needsAuth由控制文件指定 | 不证明真实binding、原生浏览器采集、报告写入真实用户库或真人扫码恢复 |

原能力表绑定capability不覆盖；只有真实生产装配返回可用时操作原按钮，但不会点击开始扫码。root真人身份、5份下载及正式backend nativeReports落库集成单独留证，不能拿这份旅程签整单AC-1110-01/03。已有57组件测试不能代签Chrome journey。

## 影子Next窄端口

prepare-next.mjs仅git archive当前已冻结HEAD到/tmp/creatoros-t1110-shadow-*，使用materialize-shadow-dependencies.mjs在macOS独立复制本机.pnpm与四包必要依赖，保留相对链接并校验所有真实目标位于影子根、regular副本inode独立、workspace指向影子包、Next版本/SHA一致。五次cp各120秒，准备外层1440秒；.bin原路径只在副本重写，原安装/sourceWitness/HEAD首末不变。不扩大turbopack.root，不install。唯一产品副本注入点是persistence-client中的createPlatformCollectionTransport工厂：仍创建真实PlatformCollectionService，但factory在这个影子实例返回spread包装的service。listNativeReports先调用原service，执行真正账号/组/frozen membership guard；接着投影root代表报表给真实临时成员。start/status/cancel执行fixture原attempt/key映射，不插入platformCollectionBindings或verifiedAt/identity；afterCollectionStart/Get在副本禁用，防止fixture状态触发真实collector。所有注入、前后SHA和禁用hook写shadow-manifest。正式产品树没有测试flag或新HTTP端点。

NativeReportPayload来自private-witness-projection.json的reports数组，纯格式适配normalize-witness；受实际contract严格schema解析。observedAt可由root显式环境提供真实报表观察时间。未提供时使用pack mtime，仅“测试回读时间”，不能把UI“采集于”时间当原平台采集证明。sourcePath是公开后台路由枚举，未读私人文件路径。fixture canCollect readiness只测试现有disabled保护，不冒称无identity witness的产品ready。

## root执行命令

以下候选未执行。根目录与脚本正式落点变化时root同步调整。启动Next listener与origin统一localhost:31411，与root 127.0.0.1:31410和其选择cookie/localStorage分开，沿原loopback guard支持的地址，不改安全守卫。数据库、登录目录、平台根、runtime、master-key file全部新临时目录，子进程不继承用户数据库/模型secret/session环境。

```bash
cd /Users/zyongzhu/.codex/worktrees/canvas-binding-fixes/Thirdspace-creator
T1110_REPORT_WITNESS=/tmp/t1110-browser-audit/private-witness-projection.json T1110_TEST_PORT=31411 node docs/verification/t1110/browser/start-shadow-next.mjs
```

启动器只打印真实ego-server-state.json绝对路径。冷启动总预算480秒，单fetch120秒，失败保next.log。这个子步骤没有浏览器。root随后在**已有空间20**明确分配一个空白Agent测试Page并取得label；不要传真人微信p1，不创建第二空间，不profile选择/claim。候选会拒绝不是about:blank/本次影子产品origin的Page。

```bash
T1110_EGO_SERVER_STATE=/tmp/creatoros-t1110-shadow-<本次后缀>/ego-server-state.json T1110_EGO_PAGE_LABEL=<root实际测试页label> node docs/verification/t1110/browser/execute-ego-journey.mjs
```

同空间不关闭平台页/整个目标。脚本用TaskSpace(20)、page.goto/reload/click/focus/press/keyboard/snapshot/screenshot/evaluate/cdp/events；Ego未提供viewport wrapper，因此以Page Emulation.setDeviceMetricsOverride设1366×900和1024×800。Ego无goBack wrapper，以Page JS history.back做实际历史后退。没有locator/getByRole/expect/context/route等Playwright推断方法。API等待均120秒；外层执行预算保留完整串行/启动/清理余量。终态观察跨原2秒轮询周期，2500ms是观察窗口，不是请求执行上限。

仅对本次影子origin设置组选择并删除旧测试账号选择key/cookie；不读取/删除身份session或平台Cookie。

完整序列：表格原弹窗→Esc回焦→两真实成员查看数据→首屏按需展开/原范围与单位/raw/0/null/率/秒/键盘横滚→返回/后退/刷新→start在途加载/开始一次/禁重→刷新原attempt→取消原attempt→complete停止get→502未知同key确认→普通partial同key继续→timeout刷新不重发且仅用户重新同步新intent→needsAuth原弹窗/Esc（无真人扫码恢复声明）→原A get挂起时切B/迟到拒绝→真实跨组404→未就绪disabled保报告→真实空read。每次运行新建evidence/run-时间-随机目录，保留失败日志和图。

如果root需要稳定allowlist候选入口，可在正式落点使用`node docs/verification/t1110/browser/execute-ego-journey.mjs`，环境仍显式提供上述server state与Page；wrapper继承root正常Ego授权环境（不输出、不用于Next），只把同一脚本交ego-browser nodejs，最大120分钟，不新建/claim空间。frontend Gate外层必须覆盖实际运行与清理预算；启动服务/完成用户控制另由root管，缺Page/server时真实失败，不输出假PASS。

public-fixture-seed.mjs仍可单独给root自己31410隔离服务建测试记录；fetch的ok/status已修成标准Response属性。本轮未执行该seed。影子完整旅程有自己的独立localhost真实public seed，绝不操作31410。

## 当场证据与root复核

旅程执行后才会生成：actual-visible-copy.json（只取viewport及祖先overflow裁切内真正可见文字/rect）、双视口PNG、journey-results.json、public-fixture.json、fixture-calls.ndjson、next.log、source/commit首末校验。CDP事件仅记录本测试Page的本地公开operation和诊断，外网记录仅origin，Runtime异常及外网尝试不得当全绿。没有读取/清空profile Cookie、全局cache或其它Page数据。

root必须实际查看每张关键PNG及当场几何；检查中文長字段可读、局部表横滚、无整页溢出、操作按钮在窄窗可达及Tab/Esc焦点。能力表不可用、扫码未完成、真人登录恢复未测必须保持待验。未来journey-results outcome=passed只表示候选脚本断言通过，不是frontend-validation receipt，也不是完整平台采集成功；脚本从不写PASS报告。

PAGE_SPEC.machine-candidate.md包含唯一JSON区块候选及建议正式路径。root实际运行/看图后填写receipt：contract_path/12位contract_sha、完整commit_sha、observed_at、allowlist精确run key/command/exit_code/output_ref、真实Ego Chrome版本/两viewports、代表数据witness及执行fixture边界、logic/surface/journey独立证据、experience真实状态、checks/coverage、actual-visible-copy完整SHA、当场tdd_red_ref、真实open_defects。历史RED缺失不能补拍为PASS。

本轮只写候选，无Gate/PASS/完成事件。最终真机稳定身份、本人扫码、真实worker文件采集/冻结归属落库、五平台错峰自动化及全局欠债由root继续独立验收。

root完成实际复核/Gate重跑后，可用本次state调用stop-shadow-next.mjs；它先用ps核PID命令含本次影子源码与pnpm才停止该进程组，不删除证据，不关闭Ego目标。

```bash
T1110_EGO_SERVER_STATE=/tmp/creatoros-t1110-shadow-<本次后缀>/ego-server-state.json node docs/verification/t1110/browser/stop-shadow-next.mjs
```

执行入口通过脚本字面量只传入隔离server state路径与Page label；Ego服务进程不会继承shell自定义环境变量。状态schema在shadow spread之后设置，原错误文件与首次未进入页面的失败日志保留。准备1440秒覆盖4次git检查、archive/tar、5次复制和校验收尾。

QA网络诊断按http/https/ws/wss记录protocol+origin+method，ws按http、wss按https核同源；其他协议单列nonHttpRequests，不凭origin=null判外联。开始监视前本Page已有buffer另存preJourneyEvents；监视后的首页事件正常记录。URL无法解析时记录unparseableNetworkRequests并拒绝全绿。localhost只声明隔离root的127.0.0.1 origin/cookie，不声称独立于其它localhost应用或新的browser profile。旧IPv6 server-state不用于新旅程，冻结新HEAD后准备新state与root指定空白Page。
