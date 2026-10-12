# 原公共浏览器超时探针追加覆盖只读准入

冻结533224f，前端完整原559测试已实际结束exit1；原timeout-browser-public 1SKIP保留。以下只读闭包不是公共测试PASS，不改任何原测试/assert。精确路径/SHA见timeout-smoke-source-binding.json。

- 原test只调用chromium.launch(headless true)，新context/page；不connectOverCDP、launchPersistentContext或App/XCTest，不复用用户profile/cookie/激活。
- 已取消readDouyinTrafficPage在douyin-traffic.ts:28 throwIfAborted，page.goto前即拒绝。随后context.route **/*本地HTML延迟31000ms，已绑定后才调用真实公共reader；没有真实平台页面/账户/API、模型请求。
- reader的全部执行闭包是页面ID检查、导航/真实tab与就绪判断/上下文核验、parseTrafficTables公开parser；其源码没有debug/screenshot/dump/writeFile/mkdir/homedir/数据库/Worker/spawn。analytics barrel只导出factory/schema/parser，原例不调用createDb/createConfiguredDb/PG/services；douyin-errors沿唯一Worker零依赖类身份出口，不创建Worker。无dist构建/写入；不存在与后端树或已结束前端全量构建的dist竞争。
- 原global setup仅DOM shims、测试React/ECharts替身及afterEach cleanup/环境复位；node环境不启动页面持久服务，不读用户库。运行将使用独立TMPDIR/TMP/TEMP、App/媒体/auth/db/OUTPUT根，清外部模型/PG/native/env，继承已独评Socket护栏，不读真实.env。浏览器可只读已安装Playwright executable缓存，不操作已有浏览器/App。
- 实际从冻结contract timeout-policy纯helper读回：launch180000、page默认/导航/有限ready各120000；原completionWaitMs([180000,120000,120000,120000])加10000结算余量，**550000ms**（不是540000）。追加CLI testTimeout550000、hook/teardown180000、retry0/bail0；独立outer1200000ms覆盖启动/collect120000+hook180000+test550000+teardown180000+report/清理120000与余量，不降低原显式550000。
- 此追加只验已跳过的原case；保存独立timeout-smoke.*回执，不覆盖frontend.log/json/-exit及原SKIP。parent已授权此公共隔离浏览器覆盖，不需原生App认证；App仍未验。

静态闭包准入结论：可以在已结束的专属frontend unit树追加原例，仍须实际stdout/JSON/exit证明公共慢页面和取消，不能以helper或verify.mjs签成功。源码测试自带finally关闭context/browser；外层到期只停止本轮owned测试子进程并保存失败，不操作他人服务。
