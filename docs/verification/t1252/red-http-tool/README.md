# T1252原HTTP默认超时RED协议工具（待root独评，未运行）

只固定Node25.9的原global fetch，两独立自有child串行：headers场景收完整原POST后310000ms才发送200/JSON；body场景立即真实200 headers及前8字节，310000ms才发完原固定JSON。原Undici默认headers/body各300000是本轮实际来源；完整probe780000ms，观察真实TypeError.cause的UND_ERR_HEADERS_TIMEOUT/UND_ERR_BODY_TIMEOUT及>=300000ms且POST1。fetch后必须读完整response.text/JSON EOF，不只签headers。有真实错误，child exit1、productTest FAIL；parent仅收集两真实失败，不把RED签成产品PASS。若返回成功或另一根因，保原记录并collector非零，不能改断言补期望。

协议响应是固定合成资料，不是业务结果、不签公共Rust/渲染/官方模型。工具不读安装connection、token/auth文件；child env仅PATH/LC_ALL和保原HOME/CODEX_HOME，TMPDIR专属。每child原node:http exclusive127.0.0.1:0，自己创建listener后仅global fetch到自身该地址/nonce；没有foreign server ready复用/外网代理/外部调用。父只启动两个固定Node child，无Rust/Cargo/PG/App/浏览器或模型，也不build/install任何共享依赖。

父run入口立即冻结完整outer3240000ms，60s分段到期，包含PREP240000＋两CASE780000＋CLEANUP1200000＋REPORT120000＋余量120000。hash/ps同阶段受声明120000正预算；phase启动前严格要求全部剩余串行＋清理槽，SIGINT/TERM不再开新phase。clean600000旧草稿未运行，现1.2M包含最多6次ps120000＋两等待120000＋240000余量；每signal前重核当前child birth/uid/ppid及parent现场birth/uid，未注册或PID复用拒绝signal并保非零。只这两children，无模糊目录/名称pkill。child自身120000 HTTPclose，父真实close事件后才stdout/stderr及log close写回执。仍未确认关闭/ownership时cleanup保失败，不造0。

新fresh runRoot用os.tmpdir creatoros-t1252-red-*自有marker/nonce/本parent birth和UID，证据权限0600/目录0700；结果不覆写历史。服务器计数、真实header/body时点、固定responsehash、失效原causeCode/elapsed/childexit与ownedcleanup和输入前后SHA完整归档，不输出正文/headers值/密钥。child取消观察不等于业务停止；本工具无业务DB或任务，不能声称unknown/task恢复已验。

精确输入含SPEC、3工具源、6冻结MCP/lock源及fixedNodebinary；需要root读实际源码、绑定新SHA和准env后才能执行。生产/source窗口当前冻结；任何input变化拒绝。root授权运行时：

```text
CREATOROS_T1252_RED_TOOL_REVIEWED=1
CREATOROS_T1252_RED_TOOL_SHA256=<launch actualSHA>
CREATOROS_T1252_RED_BINDING_SHA256=<binding actualSHA>
/opt/homebrew/Cellar/node/25.9.0_2/bin/node docs/verification/t1252/red-http-tool/launch.cjs
```

当前仅node --check两文件实际0，以及exactOwned纯函数12PASS（拒child/parent PID复用、wronguid/ppid/unregistered/missing）。这些不签HTTP/计时、service或产品。正式运行正常预计约10分钟随两真实300秒超时立即结束，不等待整个54分钟上限。
