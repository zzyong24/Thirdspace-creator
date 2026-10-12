# 原公共浏览器超时探针追加实际结果

冻结 533224f334c43cdb81a344424e420cad93784dd1，独立原case实际1文件/1PASS/0FAIL/0SKIP，exit0、retry0，外层实际36010ms。公共readDouyinTrafficPage真实隔离Chromium+本地route31秒HTML后完成，实际reader 31138ms > 30000；已取消原调用立即拒绝的原断言也实际通过。原test/assert未改；原全559配置的1SKIP保持，不相加为同一batch或覆盖首轮158FAIL/1unhandled。

原completionWaitMs含grace是550000ms，hook/teardown180000，独立outer1200000，CLI未降原550000预算。原finally关闭context/browser后Node实际退出0；只清理本轮receipt验证的临时runRoot，未操作他人浏览器/App/服务。精确源SHA、环境/子preload绑定和日志/JSON见timeout-smoke-source-binding.json、-exit.json、-result.json。

这是公共reader+真实本地浏览器机制，不是真实抖音账户、模型生成、已安装版或原生AppE2E。用户不授权App仍未验。
