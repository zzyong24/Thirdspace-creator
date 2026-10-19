# 32个独立预检查：同session一次只读观察

实际27原路径成功，5原路径失败（trial3/10/19/22/31）；五次均account/read/CODEX_RPC_REJECTED/-32603。每次仅在同RPC、同refreshToken:false对象、同原signal/960000ms绝对期限内加一次原read；五次第二RPC均成功。**五个原trial仍FAIL**，原错误对象全部原样重抛，helper按失败关闭，没有把诊断读成功写成原失败PASS。

| trial | 首次方法 | 首次code | 第二次 | 秒 | 原结论 |
|---|---|---|---|---|---|
| 3 | account/read | -32603 | rpc-ok，同RPC | 1.509 | 原FAIL |
| 10 | account/read | -32603 | rpc-ok，同RPC | 2.078 | 原FAIL |
| 19 | account/read | -32603 | rpc-ok，同RPC | 2.235 | 原FAIL |
| 22 | account/read | -32603 | rpc-ok，同RPC | 2.863 | 原FAIL |
| 31 | account/read | -32603 | rpc-ok，同RPC | 7.020 | 原FAIL |

这只能证明本次5个原session可在随后一次只读请求返回RPC成功；额外结果没有读取/验证account或登录可用性，不代表已认证、真实聊天完成、所有环境可恢复、缺陷根因已定或生产可直接加重试。没有backoff、重开session或重启失败trial；正常受控函数原两次进程握手保持，额外读不创建第三session。所有非exact错误都无额外读。

原signal仅trial开头创建一次，二读前检查原取消/期限，Session原abort监听仍生效。每RPC120000ms，外层36000000ms涵32*960000+32*120000退出观察及启动清理；本次未过期。实际32原account/read+5额外=37次account/read，未达上限64；无thread/start/turn/start、模型/资金/业务任务。正常shell runtime白名单继承HOME/CODEX_HOME、值不输出；新nonce/ownedTMP，不读取旧Next环境/用户DB，不启Next。

源码一次import的app-server af38c7...和protocol3110cc...前后相同。sourceDrift=true如实保留：期间普通status bundle84fb95...→c69067...、executionfba156...→78ff0a...再生；该controlled-only脚本不读取这些dist作为执行入口，因此不混改实际会话TS，不代签普通bundle验收。所有前后全SHA见BINDING.json。此前b635 nonce因普通dist更新在0trial前守卫拒绝，PRELAUNCH_FAILURE保留，仅工具绑定失败，不是产品/协议失败，也未自动重发SDK。

本轮runner/全部native观测close=true；最终97个记录PID全部ESRCH、独占runner PGID空、ownedTMP开放句柄0，详见CLOSURE.json。退出code0只说明实验/记录/清理完成，不说明32全绿。原失败、产物及临时目录保留，Root已获知无在途握手。正式源码、dist、控制面写0，未作生产恢复更改。
