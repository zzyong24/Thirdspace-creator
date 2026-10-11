# T-1246 受控浏览器执行副本（待独立评审，未执行）

这套入口叫“当前54原断言＋声明预算规范的隔离验收”。它不声称用原短预算命令通过。主线程尚未冻结候选、未批准长测；当前没有浏览器结果。

生成器完整复制 `frontend/tests` 到同深度 `frontend/tests-t1246-generated`，保54个e2e文件及全部参数化声明；相同深度保留源码/fixture相对引用。仅显式改真实时间消费者、外层声明预算和证据输出位置。所有原输入、业务数据/归属、响应/拦截、assert、标题、retry及sleep/interval保持。没有 monkeypatch、假API响应、新skip或删断言。

`manifest.json` 保存原全部测试文件SHA、每个副本SHA、每处原/新表达式、原line/consumer上下文及可字节重构证明；`changes.diff` 是原目录与副本完整差异。审核者需核生成器的变更许可和原测试树/产品均未修改。JSON的candidateState是未冻结，不能作为来源提交完成或PASS。

正执行/request/expect/action/navigation/capture至少120秒，test/hook/fixture至少180秒，原更长保留。局部test预算取原更长预算与“只对真实循环内await乘该字面量循环界、直接helper的await数加权，再乘最长原观察预算和两倍串行余量，加冷启动300秒、fixture清理360秒”的较大值；这是声明外层余量，不改持久任务deadline。默认套件没有更短globalTimeout，主执行器不能另套短总超时。内容动态循环及带原deadline轮询保留，独评须结合实际`--list`核全串行外层覆盖；单次统计不代替运行元数据。

配置显式继承原隔离PGlite/媒体/auth、loopback网络守卫、project、视觉基线检查和webServer的env/准入。webServer命令使用start-isolated-next.cjs：读取原Next完整配置，仅经原T1238已用的standalone-config环境注入独有.next/t1246-目录，不改next.config.ts，不在冻结后predev重建Worker；记录已构建dist各SHA。需主线程package完成且PACKAGE_READY=1才启动，包→浏览器顺序避免并发。Next自己生成的tsconfig/next-env仅清本轮路由路径并保并发其它更改，不整文件回滚；独有cache保留供trace核查。配置强制retry0、trace on、screenshot on；默认expect.configure和各缺省APIRequest/route.fetch/screenshot消费者显式120秒。原自动逐例截图索引仅迁到本轮scenario目录，两个错误仍聚合保留。其它旧任务输出迁到original-output/t原号，input `t1101/user-baseline.png`仍读原真实fixture。config审原/副本SHA并要求本轮输出目录真实位于t1246内。长测还需显式candidate SHA等于当前HEAD；准备时sourceCommit仅为真实provenance，不与包含manifest自身的新commit比对造成循环；全original/generated/driver字节SHA和exact inventory检查，实际candidate另记execution-binding.json；只`--list`免候选门，绝不等于允许长测。

```bash
# 准备不运行测试；使用已安装compiler，不安装依赖。
node docs/verification/t1246/driver/prepare-browser-driver.cjs /absolute/already-installed/typescript/lib/typescript.js
# 依赖/源码快照交付且独评后，仅列完整原例（不启动webServer）。
cd frontend
CREATOROS_T1246_RUN_DIR=/absolute/integration/docs/verification/t1246/list-audit pnpm exec playwright test --config=../docs/verification/t1246/driver/playwright.config.ts --project=e2e --list
# 下列仅为待冻结后的执行命令，不在准备期执行。
CREATOROS_T1246_RUN_DIR=/absolute/integration/docs/verification/t1246/round-1/browser CREATOROS_T1246_FROZEN_CANDIDATE=<exactSHA> CREATOROS_T1246_PACKAGE_READY=1 pnpm exec playwright test --config=../docs/verification/t1246/driver/playwright.config.ts --project=e2e --workers=1 --retries=0 --trace=on
```

源同步后必须重新准备与独评，不能覆写在途副本或证据。生成器遇现存副本会拒绝，先由主线程归档旧快照。原webServer `pnpm dev`会predev构建Worker，长测前主线程需冻结其产物/启动方式，配置继承此原行为并不保证bundle冻结。音频原固定commit/cache准入、后台disableScheduler以及官方Codex出站/登录仍须单列前置；不改原门、不fake/skip。首轮见失败即时记问题、继续全体；完整收束后集中修复，不在首轮改源码/断言或用重跑覆盖红数。

准备期独评DR001-003已修：七条分拆orchestrator/evidence、radar环境分支、旧afterAll及T1070环境输出全显式迁本轮；Worker按实际build.mjs全部.cjs/.mjs/.js required entry清单核，而不是只.js；原/generated各100文件exact集合及每个SHA守门，源码productPaths脏改拒绝。未执行浏览器，246声明差异不是改失败洗绿。
