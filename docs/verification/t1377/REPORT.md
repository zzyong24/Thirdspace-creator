# T1377 单测试文件超时范围修正

用户明确允许修正并继续安装（DEC137701），独立SPEC审核PASS、taskctl start实际0后，仅修改既有desktop-release-workflow.test.mjs：确认jobs下唯一且有界relay及唯一精确job级150分钟声明，只剔除这一行后保持旧global禁超时断言。原it其它约束不变；新增有限内存负控覆盖5非relay job、build/relay子step、声明缺失/变值/重复/移位与近似job名、relay之后新增job。

实际定向39PASS、exit0/1.746秒，命令/原日志hash/source前后一致见[TARGETED_VERIFICATION_SAFE.json](TARGETED_VERIFICATION_SAFE.json)。workflow与两relay程序字节未改，150分钟/7200秒预算不改，无产品或打包入口改动。T1376原干净0b四门44PASS/1FAIL保留，不补签历史，不跳四基本门；独审提交后才以新干净候选恢复本机产包。
