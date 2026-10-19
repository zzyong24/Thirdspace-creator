# T1373 原生隔离复用的只读结论

T1368原件实际证明：同665的原LED053以`/usr/bin/sandbox-exec -p '(version 1) (allow default) (deny network*) (deny file-write* (subpath "/Users/zyongzhu/.hyperframes"))' node tools/timeout-policy/verify.mjs`，加CLI原生`HYPERFRAMES_NO_TELEMETRY=1`和`HYPERFRAMES_NO_AUTO_INSTALL=1`，八组174项自然exit0/37.626秒；132项用户HyperFrames metadata前后相等。原START/EXIT/SHA不改。

该已验证profile不能直接当成完整reconcile的安全闭包：

1. 它禁止全部network，连loopback也禁止；完整原配置LED060内三个真实合成HTTP公共消费者明确使用127.0.0.1 listen（pi-provider-json-compat.test.ts:21、radar-model-result-unknown.repro.test.ts:74、transcribe-postprocess.integration.test.ts:52）。无差别复用不能保证原完整门合法的本地链。
2. 它只deny `.hyperframes` 的写入，其余用户目录仍allow default，并未证明能满足本次“禁止真实业务数据/用户配置写”的全门边界。完整门还包含native构建、资源生命周期、服务消费者等不同命令，未有逐项同源副作用证明。
3. 新放开全部localhost不能自动等于只允许本次自有合成HTTP：真实App/本机代理同在loopback，既有其他服务处理请求不受子进程文件写沙箱约束。未核所有原检查的实际端点/本次自有server归属与网络策略前，不能把泛loopback许可当安全闭包；不执行真实请求来验证该风险。
4. 对用户HOME采用更大deny并新增project/tmp/环回例外，是尚未实际核证的执行环境delta。当前没有已审/已验证的完整SBPL及原命令合法本地输入族证据，不临场拼接后运行，也不改HOME、checker、receipt或依赖。

当前结论是`PREFLIGHT_BLOCKED / safe full closure NOT PROVEN`，不是声称原生OS隔离绝不可能。本轮没有启动full、无新full退出/错误数量；665原58/childUNKNOWN只保原源。内盘只读df约9.8GiB，完整native/build增量没有已证上界；不清旧树、用户/本轮证据或正在运行的nav缓存。

两产品定向/双窗/静态及独审已实际通过，与全局未执行原因分证；Root明确允许继续当前两项strict收尾。T1373继续待审根因登记，后续若有可证明的最窄OS闭包再独立裁定，不为了full冒副作用或新建通用隔离框架。
