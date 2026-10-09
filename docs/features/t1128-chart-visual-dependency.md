# T1128 当前图表采证缺失图片库

2026-10-09，T1127尚未产品实施，真实 `node docs/verification/t1127/run-chart-visual.mjs --baseline` 截图1366成功后，在执行Python图片像素读取时报 `ModuleNotFoundError: No module named PIL`，实际exit1；原工具session48631输出与首张截图保留。不能用这一环境失败作为图表/采样目标RED。

本任务仅核对并修正待评审的验证runner：用Chrome自带PNG解码、离屏canvas读同张截图RGBA像素替代缺失PIL依赖，不安装全局库，不修改产品/服务/用户页面。圆点阈值、坐标/日期/null/summary/0retry/sourceSHA及1366和900保持；由T1127复核绑定实际runner。原失败保留，成功必须当前实际执行，未发生的前一截图链不补PASS。
