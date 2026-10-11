# T1245 browser-3939-original 实际结果

稳定侧栏64px后的真实页面发生横向溢出：viewport clientWidth=326，scrollWidth=530。账号select挤出，原FAIL/PNG/trace已保留。

自然退出码 1，耗时 36.656 秒；单Next、worker1、retry0，未自动重跑，服务监听自然清理。原test748976全部断言保持；隔离DB/auth/media，无真实平台凭据、扫码、模型或已安装客户端操作。

已到真实UI启用、唯一runNow、原授权等待及刷新；在第一个布局断言自然失败，未执行后面的几何及最终三层公共回读/404。3663声明冻结false，唯一11个dist构建文件变化；其它3652及HEAD相同。不能签整轮或全部读集冻结。

后续修复按已独评局部CSS候选选择，无原失败覆写，不改API/归属/事件/轮询或共享shell。日志、trace、PNG、冻结前后、真实退出收据同目录。
