# af34 冻结源码的原170库存完整重验

本轮主控明确授权真实本地验证，源码 `af34bef454d4bab319e75806c068b9f3a7f8bf3f`。原5文件库存实际170，原测试超时与hook不改，maxWorkers=1/retry=0，无skip/过滤/timeout override。实施源码与五个测试文件运行前后SHA完全一致；没有生产/UI/contract/expected或审核周期变更。

准确结果159通过、11失败、0skip，74.60秒，真实exit1。chat原90通过；转写原30仍19通过11失败；其它三个原文件33+7+10共50通过。全部11FAIL标题与前次完整170逐项完全相同，不将来源/恢复/分类汇总差异默默改expected。suite仍FAIL。

命令、五源码SHA、时间和真实退出分别见 backend-af34-original170-serial-invocation.json、backend-af34-original170-serial-exit.json；原始完整日志 backend-af34-original170-serial-full.log，逐标题/原RED对照及hash见 backend-af34-original170-serial-result.json。旧 backend-five-chat-current-contract-full170.log（159P11F/36.90秒）原样保留。新时长差异不是新增通过或旧超时阈值变更。

研究6文件原46+新增observer18的64/64通过（40.23秒、exit0）另计，唯一测试装配提交af34及其真实源码/两处输入变化见RESEARCH_CURRENT_FIXTURE_RECOVERY_RESULT.md。LED024原11+backend186+frontend12、T794严格15真实横竖预览、T902安全render，以及Motion80原+8新=88通过也单列，不计入170。不声明安装版/真实双机、付费供应商或全候选验收通过。
