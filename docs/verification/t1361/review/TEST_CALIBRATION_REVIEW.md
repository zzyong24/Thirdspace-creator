# T1361 / T1356 测试校准有限只读核对

findings=[]，未发现这两处校准与真实消费者的高把握错配。仅核动态计数基线、1356 visit完成及现有private/readiness接线，不重审产品、不运行测试、不改测试/源码/服务。本结论不代签尚待完整执行的1356。

快照HEAD：2bee2e8cc8314f764d85e5b038d3b5e3f44a7a7c；产品e511be2b204a03b168a60f014963738638865246。当前相对HEAD的测试diff只扩展1356 visit，未改延迟A/B族、SQL前pending门、任何数值断言或执行预算。

## 计数基线

1361 formal01真实13点后因计划expected0/actual19失败保留，未改写为产品失败或历史PASS。formal02两窗witness均实际completed=true/14点，baseline与final逐项均为collection14/AI0/计划19。数据来自真实helper state表计数，不是硬编码19；sourceCounts/counts均核HTTP成功、seed.userId/ready.currentGroupId与非负整数，且基线明确collection必须14、AI必须0。最终完整对象深相等会检出本次UI阶段新增collection/AI/计划。

基线采于现成auth/me读取成功、data.id===seed.userId之后、UI操作之前。该ready经过同Next完整persistence bundle，其中已有同步启动的ensureStartupJobs；关闭scheduler/background driver不等于省略启动补齐已有计划。因此“完成初始化后的真实基线保持”比“假定零计划”符合当前运行消费者；此校准不证明计划补齐本身零写，也不冒平台采集新实绩。1356同接线与末尾相等断言一致。

1361 minimum witness仍如实保1条未终态settings.onboarding.group.get；其合同明确只证明目标原RSC/UI终态，不能写所有背景请求均完成。1356继续保全局pending=0，不能用1361这份PASS替代1356更强断言。

## visit串行收尾

新visit先等当前所有受跟踪dispatch/RSC终态；真实侧栏选择后等目标组名可见、初始化loading消失并再等pending0；之后才硬goto目标query；公开HTTP实际scope/数值与rendered校验完成后再等pending0才返回。符合真实Switcher写本地选择后仍需实际Next页面提交的两段消费者，不把click回执当导航完成，也没有以硬goto取消前一组选组来制造成功。

相对HEAD diff表明原有意延迟族完全原位保留，SQL注入前全pending0仍在；没有sleep、吞异常、放宽timeout、移除数值或新增业务读取。新加的是已有pending集合与实际DOM状态等待，不能保证未来请求不再产生，若实际仍有旧请求不收尾会原样失败，不能删除pending来收绿。

## private / ready边界

配置仍全新canonical mkdtemp、distinct私有端口、reuse=false、禁background/scheduler；helper先起，seed成功再起同PG Next。测试root/metadata owner权限、nonce/root/user/端口/dataDir一致核验保留；1361还要求input root已canonical。auth/me startup600秒与正式动作120秒原包络未改，identity实际回读同seed.userId。1356最终SQL故障还保独立真实postmaster PID/URL/server identity和finally恢复，不受本次校准影响。

限制：此轮不再验证所有selector或生产实现；1361正式02只按原witness的两窗14点与计数事实确认。1356旧before-send延迟族的服务器A身份边界仍引用原审阅，不能单独冒作原A按A成功payload晚到；真正实体晚回已由1361正式response-stage原RSC覆盖。本轮没有新增产品结论或扩围建议。

## 输入SHA

- `frontend/tests/e2e/t1356-collected-metrics.spec.ts`：`25a706137ef09bb1ae2b9a9121857f1e8dd096ceaa29d4b03a4ec0cf7f4086c6`
- `frontend/tests/e2e/t1361-pending-filter-workspace-refresh.spec.ts`：`01b5c26df8619b399817071b41ab5d29ad7ca643f4f497566935d1c348025ba2`
- `frontend/playwright.t1356.config.ts`：`93d883582dc3388871503ac1387f10336544717c2d2519771e4b61e2c8012359`
- `frontend/playwright.t1361.config.ts`：`d802b91b9a87d1ff6c9f94d9bc4af600dd622db269f6a08da3eb23d6fa2df3c2`

现有证据：docs/verification/t1361/candidate-attempt01/SAFE_SUMMARY.json；candidate-attempt02/SAFE_SUMMARY.json及normal/minimum原witness。审阅时间：2026-10-18T19:14:50.854442+00:00。
