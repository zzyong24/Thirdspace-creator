# T1120 核对画布中断保存失败状态被后续成功保存覆盖

用户要求问题及时建task。T1117第三次原公共浏览器2026-10-09T10:15:30.847775至10:23:56.799483 UTC，exit1，505.946559秒，1PASS/1FAIL/0retry，log SHA0f4c76d8feaecd9427c681328b8b3f6ef07284c84e2280e3daed0ff7b5b68dd5。一次原canvas.save中断已计数为1、上游结果已显示，但原保存失败status断言120秒未找到，最终真实快照已保存且下游有精确引用。前两次相同产品字节中断status与中文反馈均真实执行通过，不能据此代签当前失败。

本次同时发生Next生成类型竞态T1119及完整回归运行，不能直接猜HMR/负载导致或改断言允许未失败。先保留完整第三轮trace、保存时间线与PNG，核第二次save来源、JS/HMR/导航事件、正式get/revision及真实错误state。已保存不等于中断测试通过；不加自动retry、不强造error、不删精确保存或原断言，不触用户库/模型。原因未确定，当前仅诊断，若需产品/runner改变先独立SPEC和复核。本轮可先顺序执行原type入口恢复生成目录；浏览器再次执行应基于明确新事实，不盲重跑。

## 实际时间线与限定修复SPEC

第三轮trace已提取，只有脚本一次Page.reload：monotonic248141.669开始、292392.439完成（44.250770秒，默认waitUntil=load）。保存网络异常在251041.841（reload开始2.900172秒）已真实console记录；之后292616.408/293023.152出现Next Fast Refresh，20:27.753正式canvas.get、20:29.419第二次canvas.save rev2成功。保存失败断言直到293600.453才开始，比错误发生晚42.558612秒。开发载入/HMR窗口足以解释没有观察到当时error；不把HMR写成生产bug，也不称已锁定其触发文件。

4-build测试维护，产品三个T1117字节不再改。精准写集仅frontend/tests/e2e/creative-canvas.spec.ts中T1101第一例status变awaiting_confirmation之后的首次page.reload：waitUntil=domcontentloaded，然后仍原最近结果/中断计数/保存失败/中文alert断言；DOM已就绪即观察现有保存，不等异步媒体整页load结束再找短状态。其余reload/断言/真实save/get/候选/模型替身/预算/retry全部保留。新增T1117截图采证已选字段在弹窗前实际读取，其范围详见T1117；本任务不关闭HMR/console/devtools、不造error返回、不加产品重试或改saveState/owner。

验收：原第三失败trace与分析完整保留；源码diff唯一load时机变化；真实原两条浏览器0retry通过，包括中断中文错误两viewport、精确保存重开/旧标记恢复/取消不写/Enter确认/详情选择/防重复/三平台入口；最后frontend原typecheck与独立实现/视觉复核。T1119处理生成产物，两个任务不可相互代签。上游T1117完整reconcile及既有外部41项仍按其SPEC记录。前端合同沿T1117和T1108，监视路径/测试ID不删改；本任务本身属于测试维护，验收列—，不伪造新产品合同或改变业务范围。
