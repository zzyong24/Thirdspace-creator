# T1294 本机 bundled Codex 非付费协议诊断

真实结果为 **account/read阶段CODEX_RPC_REJECTED**。不能把driver正常结束exit0称协议PASS；driver只是捕获失败并完成清理。当前具体账号/协议拒绝理由仍未知，原protocol把所有frame.error投为同一安全码，本次不猜账号状态、CODEX_HOME或dynamicTools原因。

先读原codex-app-server.probe.test.ts与真实controlled/session/protocol代码，再在nonce拥有workspace运行正式bundled0.159.3及原controlled入口。没有修改HOME/CODEX_HOME、认证配置、正式Worker或控制面；原受控allowlist环境自行使用当前宿主设置。原参考测试的假HOME未在本诊断套用。

只wrap CodexRpcSession.prototype.request：允许initialize、config/read、account/read、model/list、thread/start、mcpServerStatus/list；拒turn/start和其它方法；只输出固定method、begin/end与CODEX白名单安全码，不输出RPC frames、原错误正文、model ID、thread ID、账号或配置内容。原controlled代码仍做两轮initialize/config与MCP禁用核验，不削弱原权限检查。

|序列|方法|当场结果|
|---|---|---|
|1|initialize|OK|
|2|config/read|OK|
|3|initialize|OK|
|4|config/read|OK|
|5|account/read（原refreshToken:false）|CODEX_RPC_REJECTED|
|后续|model/list、ephemeral thread/start、MCP status|NOT-RUN，因上一阶段失败|

没有执行turn/start，真实模型回合0、付费0、配置写0。owned PID73253/73254通过原close关闭后均实际不存在，closed=true；没有遗留受控SDK会话/线程创建，threadStarted=false。

这是当前本机新非付费受控路径的直接拒绝阶段证据，尚不证明用户原“你好”任务的完整根因，也不证明动态工具列表有错。原已确认CODEX_RPC_REJECTED可以与该阶段核对，但必须按原group/task公共账本证明是否同因，不能靠相同安全码等同全部故障。若需要进一步安全错误细分，只能在owned诊断中投影有限数值/白名单分类，禁止保存rawerr/frame；真实完整dynamicTools应由Root协调公开配置读取，不能改为私读用户库。

源码输入/脚本/结果SHA见INPUT_BINDING.json、BINDING.json。正式源/control未变。实际模型聊天只由既定浏览器专用新会话验证，本诊断没有并发模型调用或自动重发原unknown任务。
