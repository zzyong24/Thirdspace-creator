# T-1307 新候选公共验收独立复核

**PASS，仅限本次两真实 turn 的原文渲染、原 HTML 交付、三次采纳与刷新隔离。未发现未解决实质问题。**

source `dc46cfa700ec9c9cbada47fb76237d0b50d10a67`；控制 HEAD `354786143377c58a12876731d00b075c4008a858`；binding SHA `d82fcbe6bbccae7f99197a0ce20deb3bd2520c459dded17e6f322f13dcf859e5`。实际端点 `65353`、fresh owned `MhP4pW` 与 HANDOFF 一致。193 项证据索引逐文件字节数及 SHA 全匹配，索引 SHA `6f63d795f47083a19e12fd7a45b239486b84c921118efd275af1d0c10680bd2f`；packet/source/binding 均核对。

| 具体结果 | 独立核对 |
| --- | --- |
| 联合创作 turn | source `ai-msg-bcda7005-108`，execution `execution-task-0247fb0a-8222-4f26-b33a-3b446f6d54ec`，实际 Codex/completed/attempt1 |
| editor turn | source `ai-msg-bcda7005-362`，execution `execution-task-89c53992-c117-4692-90d9-fe5577df4e45`，实际 Codex/completed/attempt1 |
| 三次采纳 | 联合 article version194、graphic version299、editor article version433，各新增版本并自然刷新、精确版本读回；涉及 article/graphic 两领域 owner |
| 原稿保真 | 独立离线解析两 source 及采纳后当前稿的4份预览/4份原下载，正文各9段与对应 source 按段逐字相等，四行换行和六下划线保留；原下载 SHA 相符，graphite-minimal保持 |
| 隔离 | 22组动作记录包含完整双方DTO、script metadata与按真实total分页的全versions；只改变采纳目标，另一owner及脚本不变 |
| 实际执行 | Playwright 1PASS、0skip/0flaky、exit0；本run完整timeout verify exit0 |

证据入口：`joint1/editor-{submission,task,messages,candidate}.json`、三份 `*-result.json`、四份 `*-source-render-export-check.json`、对应原始source/preview/download、`network.json`、`final-business.json`、`result.json`。runner已读；结论分别对原source成立，不靠预览与下载互等。

attempt01 浏览器启动前 sandbox 失败、attempt02 native脚本空行归一与typed双空行期望失败均以原exit1和原件保留。attempt03先读回同组/项目的已保存 script version46；准备阶段未补保存/重建。随后原一键动作合法确认 script version70及3次采纳，恰为2次模型请求，不重发旧任务。

新增 `SAFE_BACKEND_PHASES.json` 的18行均核原日志行SHA、提取前缀SHA与白名单字段。joint none首次 settled `04:14:45.386`、append `45.422`，proposal deferred及finish `04:15:15.219`；editor对应 `04:15:40.884`、`40.920`、`50.954`（UTC）。两execution/attempt/call与消息outcome匹配，证明后端none在finish前append、proposal终态deferred。同stamp重复before_finish仅终态对账。该证据不证明精确DOM时刻、TTFT或完整FEEDBACK；宽文本族observer仍只能作粗观察。

限制：runtime RET-001/002缺失不被本公共PASS覆盖，不声明accepted-risk。局部四行/长元素截图不代整体布局、响应式或T1302完整视觉；后续A仍需原范围复验。父40功能/56route矩阵、现用App、原生壳/激活均未签。C继续持有服务，尚未最终shutdown。

本轮homogeneous独立复核仅读原件、代码及离线数据，不运行测试、HTTP、模型、浏览器或服务。issues为0。四份授权报告核验后 **RELEASE全部写权/资源**，由C整合，不提交。
