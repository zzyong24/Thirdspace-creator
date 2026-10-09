# T-1158 微信来源研究暂停与当前整合准入独立复核

- 审查时间：2026-10-10T03:29:57+08:00
- main HEAD：`aa7de1e91183ec0236a82cd954a4f4bf9bb1aeb1`
- 来源冻结 HEAD：`293d4e98d2cedbd04eebce16a62f921711ee8079`
- 结论：**ADMISSION_WITH_MANDATORY_RESEARCH_PAUSE**

## 1. 是否允许移植

允许在新的 current-main 整合 SPEC 通过独立评审后，逐段移植来源冻结的生产闭包；禁止直接 merge/cherry-pick，也不能只复制16个新文件而漏掉34个共享装配、契约、迁移、owner和scheduler增量。移植可以进行 contract/type、隔离数据库、脱敏fixture、公共service/UI组合和离线打包验证。

这不等于允许恢复真人微信执行。来源研究family `wechat-statistics-visible-section` 已用完两次实验，实际仍是视频号绑定、0报告、官方首页、导航机制UNKNOWN；公众号也未绑定。研究恢复前不得运行真实binding、nativeReports collection、真实scheduler、下载或安装启动触发真实微信采集。若冻结代码包含自动调度，安装/启动必须等研究resume criteria满足；不能靠隐藏按钮、删功能或改成默认假成功规避已确认范围。

## 2. 可独立验收的闭包

可独立验收：严格报表DTO和operation注册；0131迁移/journal/convergence；隔离PGlite中的user/group/account/lease/identity归属、分页、幂等和跨组拒绝；脱敏/合成XLS、CSV、HTML解析的字段、单位、0/null/负值与限额；页面的0/unknown/loading/error/cancel/stale响应；scheduler键、disabled/custom cron、单在途与原ID恢复；XLSX供应链、worker bundle和sidecar装配。

不能据此声称：真人稳定ID绑定、官方首页进入统计页、真实日期窗口表格就绪、原生下载、五类报告同步、真实profile scheduler或needsAuth判断成功。

## 3. 研究family与浏览器入口

当前main的整合任务ID只负责main审计，不能覆盖来源T1110，也不能用新ID重置研究预算。正式SPEC必须绑定来源commit、原failure_family、EXP-1/2已消费和remaining=0；来源BACKLOG、events、review-events、PASS/状态均不搬入main。

原浏览器空间仍由用户控制。用户交回后，只读核对实际菜单入口是研究卡明确的必要恢复条件；它不得启动采集、下载、新任务或第三次实验。未交回或只读入口仍不能解释导航机制时，继续暂停。

## 4. T1148

当前微信整合仍缺精确current-main写集，且共享路径很多。T1148旧收据继续保持候选：先完成新SPEC、实现和最终source manifest；若触碰旧PAGE_SPEC watched paths，相关任务保持block。只有剩余共享源码全部冻结，分别运行原allowlist、生成绑定最终HEAD的新报告并逐任务resume/complete后，才能最终签署。来源PASS、新局部旅程或中间HEAD均不能代替。

## Findings

- **ADM-001**：冻结闭包可移植，真人执行面和安装触发必须继续暂停。
- **ADM-002**：研究family、两次已消费实验和原失败必须原样继承；不得换ID刷新预算或搬控制事件。
- **ADM-003**：T1148最终receipt延后到current-main整合写集与最终HEAD冻结。

本次未运行浏览器、数据库、模型、采集、构建或App，未修改main、来源树、任务状态或控制文件。
