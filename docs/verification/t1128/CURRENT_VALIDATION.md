# T1128 当前验证依赖诊断闭合

原baseline实际exit1因本机Python没有PIL，真实失败保留；不作为产品RED。仅待实施验证runner用真实Chrome原生PNG解码和离屏canvas读取同截图像素，无全局安装或产品修改。当前再次执行baseline实际exit0/11.4795秒、1366与900各截图；源SHA绑定旧ChartFrame，圆点真实17×7与9×7，说明旧形状拉伸仍存在而非产品已修。独立T1127 Round2核过runner、120秒预算、0retry与入口元数据，PASS仅准后续实施。根已实际看两张before图，不借自动humanViewed标志代签。

诊断证据：T1127/visual-before.json、T1127/T1127_SPEC_RECHECK.json及本任务actual-failure.json。此任务只是移除缺失验证依赖，T1127产品仍待修复/验证。
