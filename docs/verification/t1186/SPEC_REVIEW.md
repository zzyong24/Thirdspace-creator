# T1186 独立SPEC初审

结论：**PASS，限当前单测试样本校准SPEC；findings=[]。** 这是只读初审，当前产品和该测试仍未修改，没有执行测试、CLI、服务、模型、浏览器或研究实验。

实读SPEC SHA256：`6fa88cd5ff53a23bd58812d7c5e7efcee78b2f411930fb2630747c34849e901f`；constitution SHA256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`。当前 `backend/src/modules/ai-runtime/chat-tools.test.ts` SHA为`a62cc9fa58c0cd7428ee5a26fe9e993168751b0c3f938d6d9d15cad27a01da85`，与HEAD b34447aaf7836e7798d4bd37c262eff2357aaf7d逐字相同，SOURCE_BEFORE相符。阶段为stage4-build维护；审后仍须根代理正式record/start再实施。

实际完整LED014收据/原log/gzip逐字相符：96.762120秒exit1，前端178PASS，后端实际3文件264PASS2FAIL；原log SHA `4fffe363cea4e4fa07c03f0f9a27c22a568db1bd7226d754f092748994c583ee`。两模式均首次拒绝canvas.propose。源码显示旧sample只处理基础enum/type/minimum，无法构造const及联合操作项，并对positive排他下限构造0；operations联合项会成为null。真实Zod分支仍沿原schema严格校验，拒绝此夹具不能据此判定用户画布功能损坏。后续四工具未被该失败循环执行；其合同与同一生成器能力缺口是本次静态判断，不能写成已观察到四项失败。

五个计划样本符合当前合同，并可避免默认补值影响原parse相等断言；这仍须实施时用真实validator验证，初审不预签执行结果：

| 工具 | 最小中性合法样本边界 |
| --- | --- |
| canvas.propose | baseRevision:1；单个moveNode，非空operationId/nodeId，有限position{x:0,y:0} |
| system.read | request.kind=accountGroups.get，params.groupId非空；offset:0/limit:20显式给齐，无window/query默认变换 |
| system.action.propose | action.kind=group.create，非空无首尾空白name，trim保持相等 |
| canvas.create.propose | title非空/projectId:null；完整schemaVersion:1、viewport{x:0,y:0,zoom:1}、nodes:[]/edges:[]，不注入来源或身份 |
| canvas.generate.propose | baseRevision:1/nodeId非空，不伪造已保存节点/归属确认 |

写集精确限于原selected/project两模式it.each内部。保默认生成器、全工具定义集合及顺序、合法safeParse与parse相等、非对象/空对象/额外键原断言、redfox动作样本和typed4原跳过；不删原226例、不新增skip。增加canvas非法revision0、未知type、空operations及system.read/action未知kind拒绝，可实捕参数保护退化。system.features沿原sample不扩大。所有样本只用于参数合同，不调用执行器、不宣称样本ID已经过领域owner验权。产品、合同、mock、守卫、配置、SDK和预算不改，契合产品宪法的AI候选与用户确认/owner落实边界。

已读真实prepareChatToolDefinitions/parameters、canvas/system host及adapter、assistant-system公共root。执行端仍重新读取冻结上下文、核user/workspace/原定义与取消，再真实校验参数；候选来源封装与原服务prepare/用户采用分开。原公共测试覆盖旧定义恢复、跨组/未知身份/漂移/取消零写、严格文档、来源回执、CAS与恢复。验收应按SPEC运行真实两模式及完整chat-tools、上述公共合同和原LED014完整串行、类型/scans/diff及独立实施复核；其它失败留原owner，不能仅靠sample通过销门。

本轮只读取已有前置原收据：工具参数/canvas/system三文件35PASS/exit0；assistant root/采用/canvas三文件101PASS、**3 skipped**/exit0。三跳过来自原T1074 PG runIf，缺其专用环境变量，不能当104PASS或PG竞态已验。contract初命令真实未发现文件exit1；按未改backend配置的corrected命令真实7PASS/exit0，两条都保原字节。READ_SET记录所有实际路径/SHA及原私有receipt/log与归档逐字关系。这些是编辑前基线，不能代签待实施修复GREEN。

不签完整LED014、原canonical27 ERROR/1 WARN、任务完成、安装版/native、真实模型/平台或全功能。T1181/T1182研究仍暂停/UNKNOWN，2/2实验耗尽、剩余0；本任务无研究恢复或产品包变化。
