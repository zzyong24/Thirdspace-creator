# 收口命令的实际失败与适用性核对

本轮首次taskctl complete T1210/12/13/14四次均实际exit1，状态没有转为完成。原因：初建BACKLOG验收列填“待验”，工具按UI journey报告读取普通evidence说明，lstat对应说明路径不存在；没有把失败补写PASS。

四项精确产品文件均为backend或frontend/src/server，没有改本应用页面、组件、视觉或布局，SPEC均没有frontend journey contract。外部平台自动化的隔离Chromium测试不冒充本应用页面双尺寸journey。正在独立核对验收列适用性；不改门卫、源码或测试断言，也不制造UI验收报告。独评确认后，仅校准误填列并用原taskctl转换状态、保留audit事件。所有实际构建/安装/公共采集与全局27FAIL仍按原记录保留。

独立适用性复核PASS已落原独评末尾；DEC-T1210-T1214-002记录仅校准四项误填验收列，不改状态、产品、门卫或断言。随后的状态转换仍由原taskctl执行并保留事件，报告按各真实验收范围签，不把非产品UI写成UI PASS。
