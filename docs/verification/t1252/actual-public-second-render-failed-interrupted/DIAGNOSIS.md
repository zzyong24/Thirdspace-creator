# T1252 公共第二轮：真实 render 失败与中断边界

当场证据：`/private/tmp/t1252p-QTwUuo`，2026-10-12 09:24（北京时间）写出 case2 JSON。三个明确 body 的前两个实际 PASS；第三个实际 FAIL。第三 body 661487ms，整文件 665318ms；57 声明中只运行 1 例，其余 56 是过滤，不算通过。严格阶段最小值断言得到 `109999.8515 >= 110000` 为 false，差 0.1485ms。

原源码 `2a15d551…` 行568：真实 SDK 与单次 `setTimeout(resolve,110000)` 并行；行580严格要求每阶段 performance.now 差至少110000。原实际 Node25.9 的内置 timers 源将 Timeout 交给 insert，并不执行 performance.now 最小值复核；[Node 官方Timers](https://nodejs.org/api/timers.html#timers_settimeout_callback_delay_args)也未保证精确回调时点。具体0.1485ms由哪个底层clock量化造成尚未证明；已证实的缺陷是测试私有延迟消费者没有保证其声明的minimum。不能删断言或降阈值。

两种格式的 MIME/bytes/hash/PNG红像素/PDF正文/任务原期限断言位于失败行之前并已执行到该行；失败后的 readAll、错组404、错版本、4HTTP/2launch 尚未通过，不以之前结果代签整例。

用户中断使 case2-child.json、case2-proof.json、final.json 未落盘。保留缺失，不重新制造历史 EOF、close、group0或退出码。2026-10-12 10:15 的当前 ps 未发现该owned根相关进程；这只释放当前共享窗口，不证明09:24历史清理完成。当前全输入2207源、111831安装实现、337浏览器文件 SHA 核查无漂移；此次核查不是丢失final的替代。

后续窄候选只把110000ms delay改为一次冻结 `start+110000` 后重新检查剩余时间。仍与同真实SDK并行，仍由原120000msphase监督，所有原断言/57声明/三body/原Task D保持。候选未应用或执行，需独立评审和ROOT核查。App用户暂不授权，仍未验收；本链不使用官方模型或Windows。
