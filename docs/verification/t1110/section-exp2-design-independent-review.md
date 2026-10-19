# T-1110 EXP-2 URL 固定分类设计独立评审

结论：设计未发现隐私、权限或执行归属方面的具体阻断；可用于研究卡内第二次、最多一个新 intent 的窄区分实验。尚无 EXP-2 仪器源码可签，本报告评审的是方案，不证明实验运行、profile 已正常释放或真实采集通过。

root 报告 EXP-1 当场结果为原 SECTION_MISSING/原五字段、SKIPPED_CURRENT_PATH、0图、无 ready；新研究 ID 经公开 cancel 后 cancelled/generation2/0。此结果只排除了本轮截图/保存阶段，不能直接断言 Cookie、页面路由机制或关闭链完成。原54 failed0与公众号56 failed保持。

## 固定分类边界

在原拒绝 currentpath 的位置即时取一次 page.url()，用同一 snapshot 做 guard 判定及机械分类；若在异步登录探针后另取 URL，只能称稍后观察，不得当作那次拒绝原因。该同步 URL 解析不需要额外 SDK 探针、导航、等待、重选或重发。

只输出 originMatch、reportPathMatch、hashReportPathMatch 布尔值及 homepage/report/login/other/unknown 固定 pathCategory；明确重构字段，不输出原 URL、pathname、hash、query、正文、身份、错误消息或对象展开。hashReportPathMatch 是固定报表路由匹配布尔值，不是原 URL 的 hash/digest。仅解析规范的 route fragment，再精确比较当前 kind 的既有官方报表 pathname；禁止 substring/关键词推断、解读会话 query 或据此改变实际 guard。未知/解析失败归 unknown；login 只表示已知固定路径类别，不能推断登录状态、needsAuth 或 Cookie 过期。若 originMatch 仅表示 origin 相等，不包含既有 userinfo 限制，不能以两个 match=true 推断整个 currentpath guard 已通过。

限定到已配置、已核身份的视频号首份 prepare typedSECTION_MISSING 与原 SKIPPED_CURRENT_PATH 分支。分类失败忽略仪器并保原采集错误；取消及原 end 在分类/记录前后复核，耗尽后不记录晚结果。保留现有 screenshot path/login 前后保护，固定输出不成为新服务 API、公共 DTO、DB 字段或第二异步诊断 producer。私有研究标记与固定机械字段只用于本轮仪器证据。

首次 prepare 如果意外成功，仍沿 EXP-1 的原 signal/end 复核、固定 ready marker、throw 停止点，位于 receiveReport/onReport 前；因此不下载、不解析、不提交任何报表，也不形成采集 PASS。原 typed 失败路径记录分类后仍向原 finally 传播，不能返回伪成功或虚构 onStopped。

## 服务交接及研究计数

温和停已归属候选 Next、确认 OS 退出及原 profile Chrome0，可作为停止/存活观测；两者不证明 onStopped→DB profile 释放链已完成。新单一候选服务仍必须经原 hostRecovery 与 profile service 正常 checkout：拒绝、仍有未确认停止或归属不明即结束 EXP-2，禁止抢锁、删锁、手工改 DB/profile 状态、复制 Cookie 或 direct launch。公开创建本轮唯一 newintent，预存新 clientKey，不重发 EXP-1或原54；原 IDs/真实状态/父期限不改。

只读时当前研究卡仍写 EXP-1 prepared-not-executed，且没有 EXP-2 计划。实际提交 EXP-2 intent 前须更新 EXP-1 真实结果、公开取消及停止未确认限制，并登记 EXP-2 问题、固定字段语义、maxRuns=1、新 intent、仪器 SHA/命令和停止条件。这是当前卡内实验追溯所需，不是新增审批。EXP-2 后无第三次实验；若仍只能定位当前路径类别而不能闭合页面机制，保 researching/待验，不宣称研究 validated 或生产可恢复。

共享 guard 的 race 前预检 await 和永久 OS 清理限制继续保留，本实验不改变该 guard 或停止所有权。没有操作 browser/service、没有查看 raw URL/图片/Cookie、没有修改共享源码或控制状态；仅写本 /tmp 报告。评审方式 homogeneous inherited。
