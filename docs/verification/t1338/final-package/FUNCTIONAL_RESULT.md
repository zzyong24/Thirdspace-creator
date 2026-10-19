# 13dd 包有限功能与画面验收

实际source为13dd66ceb3b296461b54f544b78aab3a08058b6b，DMG 922cb618…；真实Next与bundle Chromium。全部0新模型、0外发，无生产修改。数据是已终态owned人工测试库的独立副本及明确人工前置，不是线上用户non-fixture数据。

| 范围 | 真实结果 | 原件 |
|---|---|---|
| T1338 legacy normal AccountSwitcher→朋友圈→原报告/status/同confirm34重放 | PASS 11.107s；原report31、DTO前后相同 | runtime/legacy-v1 |
| T1307 历史实际成稿人工复用前置 | v1相对路径proof装配FAIL/0API保留；v2 PASS4.356s | runtime/content-fixture-v1 / v2 |
| T1307 native预览与HTML真实导出；T1340专属助手初次异步正文 | PASS10.779s；14原段落/标题/四行六下划线逐字；HTML9855B SHA19f844fe4fb1345374545c130d3220c11f5fa7cb95ece20f898222e5c3ec5b77；script/文章/图文/任务DTO前后相同 | runtime/content-ui-v1 |
| 图文native-ready补证 | PASS9.049s；原162、导出按钮enabled、1366×900及1024×680 | runtime/graphic-ready-v2 |
| T1339旧9a41稿件级预测进入组发布版复盘 | 原FAIL131.548s保留；0发布事实，空态符合组页publication过滤；夹具上下文不匹配，不改产品 | runtime/calibration-v1 |
| T1339新公开人工内部publication/预测/实绩3族 | v2 selected-account缺失428前置FAIL2.504s保；v3同原5ID/同首body+externalId正常合法G+A续，PASS12.294s。partial缺失维null/null，zero0及负偏差保，empty全null/null，normal/min六矩阵逐字匹配公开DTO，前后全等 | runtime/calibration-public-v2 / v3 |

每次真实wrapper/外层都有独立输出、原before/after、browser.close、PID身份清理；上述终态均afterInputDrift=[]、remainingOwnedGroup=[]。两controller均正常stop143/error:null、精确PIDgone，原db/media/workspaces sourceAfterUI unchanged:true。没有声称单凭stop证明flush。所有owned根/key引用保留，后续应使用含新增成稿/publication的最新已关闭副本，见CLOSED_WITNESS_HANDOFF.json。

Root已实际查看legacy/文章原文四行/专属助手、最终graphic两视口及校准三族画面，接受对应有限功能证据。legacy截图报告细节在首屏外，DOM/原回执通过，不冒截图展示报告全文；最初IMAGE_1366仍loading，只证明助手，已由graphic-ready独立补足。1024视口侧栏按产品折叠，不能据此推390完整适配。390旧滚轮FAIL不消除。

本批未在事前正式UI contract/report/allowlisted命令下执行，正式UI协议缺项单列保留，不借本批真实性伪称已过taskctl正式UI门。下一轮4任务formal-v2为前瞻新合同/独立旅程；不重跑模型。
