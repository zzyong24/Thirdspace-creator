# 设置两个原完整用例：独立静态准入

结论：**PASS，可执行本精确版本的补充诊断**。唯一 launcher SHA256 `f2ef3152bfdebc16fe307a22346fac2077c50c3ecaa61be970a150b177a1f38c`；binding `c72930c9b1314afed375fe8b8616a623042e13cf21bf662947196f012a3c9cdf`；config `36e058165453e0a24b998b9b4b6ef2acb60e433fd62fe21fdbc2ee20dc180acf`；injection `8a0381f5bf32d98c864d617b6f5316b64f8d2abd99ead435abe2b9d8c899a4ad`。

候选 `533224f334c43cdb81a344424e420cad93784dd1`。准入 run 为 integration `docs/verification/t1246/settings-full-history-runs/2026-10-11T17-19-06-539Z`。评审者 codex_route_inventory，作者 codex_contract_review。本评审没有启动工具/list/Next/浏览器/模型/PG/App，没有改产品或原断言。原170两条FAIL保持；该准入不是原用例功能PASS。

## 当场静态证据

- 独立重算4工具 SHA；473条准备输入当前SHA全部一致。原与生成测试各100完整库存（含17baseline输入）、253源、11Worker、driver8均核；已发生listing before/after日志两边 counts 完整、errors=[]。runtime执行前再次核同guard；完成和异常均保存after inventory。新工具+Node SHA与listing前一致方执行，前后漂移结果不能绿。
- 三个私有源码逆变换真实逐字0差：settings.spec和network-policy原字节一致；helper删除唯一完整injection（含插入空白）后与已预算声明的原生成helper逐字一致。未替换任何断言、返回值、模型数据、等待和响应。完整两body仍包含分类/真实TabEnterSpace/宽窄截图/close/escape及主题密度写localStorage返回刷新，不以简化sidebar动作代替。
- 实际作者listing明确仅 e2e/settings.spec.ts:158、:283，test IDs `87418b536bb3b16b9965-9d167bbc2a2b29b9bb07` / `87418b536bb3b16b9965-1daf9239c5bf49000f59`；两个timeout均74100000ms。对应--grep真实只有这两条，模型探针/RedFox保存族未选中。retries0、workers1、trace/screenshot on继承已审driver；不新增skip或隐藏失败。
- history包装先保存原函数，用Reflect.apply(original,this,args)原参数、this、返回同步透传，异常原样抛出；不await、不调back/go额外次数、不改state/url/期望。仅记录URL/history.length/键名/__NA/数字idx及原method/delta/导航；不保存完整state。同步before/after不等于back完成，popstate/framenavigated另记，后续必须按真实事件和两条result时间/trace归属分析，不能猜2次back。
- webServer继承真实loadConfig的独立.next/run哈希缓存，frontend正确cwd，Worker不重建且11原SHA锁定；配置复用仅审过driver，reuseExistingServer=false。执行前61349排他bind空闲门；Next启动失败不能冒foreign ready继续签PASS。lsof只诊断，cleanup不向foreign listener发信号，实际完成需核Next launch+cleanup收据。
- HOME/CODEX_HOME保原父值，不指到新目录、不复制官方auth。只有APP/PGlite/media/auth/TMP/cache/backups等task根。显式环境allowlist不继承DATABASE_URL/代理/密钥，fresh PGlite与媒体及auth根原config再次绑定；无.env准入，scheduler关闭，无system App调用。原网络策略拦browser外网HTTP/WS；本两选定body无生成或供应商探针。读取已装Chromium缓存不是复制凭据。
- 信号目标来自现场spawn runner根及现场PPID血缘，观测PID+birth-time，每次信号重新ps核birth-time；不按命令substring杀进程、不杀任意61349 listener，残余foreign仅报告。owned数据保留，不删除历史证据。listing已发生cleanup members=[]/listeners=[]；这不代签执行后cleanup。

## 实际消费者预算

保每case74100000ms，两body共148200000。继承project超时672660000ms，已直接读installed Playwright1.60.0 workerProcessEntry.js:3051 afterHooks=max(project,test)、3091 worker cleanup原project、3115 trace slot原project、2812 final worker shared default slot。按最多两个Worker，各独立四族槽1345320000ms，四族合计5381280000，加startup/setup/teardown/shutdown/ownedcleanup/report余量，所有组件真实求和 **5530920000ms**，与launcher一致。

outer用performance.now单调elapsed，最多60000ms分段setTimeout，没有把5.5B放单个signed32 timer，也不因正常完成等满预算。期满SIGTERM只owned，另240000ms cleanup后SIGKILL仍只owned；正常runner.close后timer清除并进入同owned清理。原action/request/expect≥120s、原较长case与project不缩短，不更改持久任务deadline。这个极长上限来自保原scope预算，不能为诊断提速下调。

## 旧阻断及执行边界

旧launcher `97d4ca5c63996a6182a127ff124743086454dbc0076ff0b95a877a00306b892c` 的私有HOME改写违反系统变量边界，**禁止执行**；作者已修且新listing在最终环境进行。更早injection逆构漏空白的preflight红记录保留，没有body/Next运行，不补为绿。只准上述f2ef最终字节与唯一run执行；作者实际执行必须绑定该SHA，保存两完整body各实际结果、原FAIL对照、history原事件、trace/截图及所有after/cleanup；任何失败如实记录，不能以本静态PASS代签运行。
