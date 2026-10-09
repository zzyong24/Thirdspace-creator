# T1166 校正新报告旅程的串行外层预算

独立实现复核指出 T1159 新E2E为两账号×三窗口串行，原test外层1500秒，单动作/导航/断言/公共请求为120秒，仅goto/reload/read/back四项相加已2880秒；原runner3300秒同样不足覆盖完整等待。此为静态预算缺口，首Chrome52秒失败原因是独立T1165错误码，不冒称出现此超时。

精确写集仅 frontend/tests/e2e/t1159-wechat-native-report.spec.ts 的本新case外层与 docs/verification/t1159/run-report-journey.mjs 外层/本轮源SHA观察清单。内层120秒、0retry、原断言与公共响应不变，旧case/产品/全局超时配置不改。本新串行最保守预算按准备8、各窗口24×6、身份拒绝24×2共200个120秒执行点=24000秒，test给25200秒并保1200秒结算余量；runner26400秒覆盖test25200+冷启动300+退出清理600及300余量。仅有限观察外层，原持久任务30分钟期限不续期，取消仍即时。

runner源冻结除原59路径增加T1165 contract/envelope与route.test两条当前修复路径，保before/after真实SHA；不篡改原冻结来源清单/旧证据。先独评，保原预算值，修改后实际原完整公共Chrome、node语法检查、timeout-policy原入口和diff；timeout旧全局失败单列，不能删门或把本任务静态算式代签真实旅程。控制/证据写集任务自身文档、BACKLOG、modules及真实事件。沿原4-build维护与LED053，没有新功能/审批点/真人执行。
