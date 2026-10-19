# T1294/T1295 有限实现独立复核

结论：本次指定的Root文案/RPC/预准入代码与T1295最小CSP修改、直接测试未见待修的新代码finding。仅签所列有限字节；不签T1294完整浏览器全绿、最终包、原生App、WebKit/Tauri或SwiftShader无GPU路径。

## T1294 确定阶段文案与消息链

humanize只新增专用CODEX_SESSION_PRECHECK_REJECTED规则，说明本轮尚未开始、建议检查登录与配置，未假称确诊登录过期/资金不足/已完成。CODEX_RPC_REJECTED及unknown等原码不投零回合文案；固定提示不透传原message/data/账号/key。Root precheck仍只有可信clean reserved、零admission、本地/typed确定拒绝、严格同call/status rejected ACK后才产生该专用码，原取消/unknown/旧started/prepared恢复不放宽。

本审实际独立运行Worker48 + RPC9 + native28 =85PASS；humanize37PASS；均exit0。已有Root fixture前两轮因缺scope/完整Codex spec而失败的日志没有被本审覆盖，本审不把它们解释为产品RED。当前RPC/预准入生产字节与上次独审相同，新增真实Worker消息测试严格核原execution/fence/callSeq、consumed、一次commit、cancel和unknown；未删老回归。

只读核root-live-chat-after-precheck/RESULT.json：同conversation/source/AI task/execution四ID，execution-task-f7dc07f8-a65d-42c7-860f-02607f8de627为attempt1 succeeded；completion.persisted=true、readableText=true、4字、异常数组空，logging restored false。它证明该明确新对话完成，不能反推旧CODEX_RPC_REJECTED原因已确定；本审未重新发消息或调用模型。完整T1294另有短高viewport失败/其它在途用例，仍留给Root逐例报告，不签全绿。

## T1295 正式源与测试边界

生产唯一diff为desktop-csp.mjs的原script-src增加专用'wasm-unsafe-eval'。未加JavaScript 'unsafe-eval'、未关闭CSP，来源/其余directives及release启用条件不变。两个node测试按精确token区分JS/WASM且逐条锁住其它directive，并保web/debug无头负族。本审实际两文件9PASS、exit0。

正式E2E只有三项显式T1295环境配置同时存在才读取service binding/owner、建server/media或写公共对象；无配置分支仅注册skip。顶层仍只读取源码realpath和Playwright包定位，没有访问实例、用户DB、启动媒体或服务。进入分支核marker digest/uid/task、loopback origin、sourceRoot及evidence目录。900000ms RPC原预算保留，28800000ms单用例/串行外层覆盖该有限链多个RPC、有限轮询、native启动和清理，retry0。原公共mutation pending在未知时阻止下一请求，保原task/request/attempt，不自动重发。Root刚补assert(scriptDirective)只是类型/存在性断言，未放宽策略。

核formal-driver-final.log的正式复制路径真实2PASS/44.2秒；此前formal-driver.log的2PASS/48.6秒单独保留。最新current-1faa8c4c26d7绑定55594 fresh owned服务；page-origin WASM返回42、eval/Function均EvalError；policy SHA等于当前正式owner，native public与canonical SHA相等。实际原native MP4和公共MP4的文件SHA均与回执一致，已有解码/非黑/非静音断言保留。公共task ai-task-f99a1af0-343沿原request/attempt制作、采纳、下载；planUnchanged=true、pending=null、models/funds=0。closed回执browserConnected=false、serverListening=false，业务服务由Root持有，不把验证server关闭等同Root DB已关闭。

该载体是同release header的隔离HTTP/native真实模块和真实公共链，不是最终release Next/App。实际查看系统Chrome彩色帧与SwiftShader黑帧，后者确为全黑；原失败仍有效。CSP缺许可已补与软件GPU原生黑片是不同事实，本审不扩范围修内核或用系统Chrome通过覆盖黑片。原生App从未自动操作，最终用户安装验收仍待进行。

全部源/结果/图片与本审实际运行日志hash见BINDING.json。仅文档证据写，无生产/control改动，无新模型、付费、协议或浏览器业务调用。
