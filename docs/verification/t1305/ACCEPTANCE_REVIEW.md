# T1305 实际来源恢复独立复核

**PASS，仅三族 source 目标与对应有限 UI/oil 范围。** creation文章、creation图文、editor文章均有真实 loading→连接中断→中文原因/恢复动作→用户关闭重开→同来源真实200的完整证据。原首轮仍为1FAIL/2PASS；article定向1PASS不改变原结果，不代表历史并发选择问题已修。

评审者 `/root/sol_review_t1303`，按委派 GPT-6.1 Sol / high，独立于实施和操作执行者；沿既有评审上下文含源码复核，不冒称新无历史的视觉上下文。依项目oil-ui-pro0.10.0和UI_RULES，只判断当前实图与真实过程，不新选风格或打分。本轮未运行测试、模型、浏览器、服务、构建或控制命令。

## 绑定

| 对象 | 精确绑定 |
| --- | --- |
| source / run | `cfbaf1ee021ef6904440ffd78afe3f82c4381ed6` / `final-t1304-t1305` |
| control HEAD | `148a7da951a31ea3e3f94fcb8b42956f5daf6f2d` |
| candidate-binding SHA256 | `af548574f185d2ae22ea05de24fdc27bf2971283c75882eef76c9b99b1ddb7cb` |
| B HANDOFF SHA256 | `273f942b79f1f94f82249f94f93edd1501df41d85563677e1baf43bedf9a4283` |
| UI_ACCEPTANCE SHA256 | `4ee6f1d055c0431b0a1095d1a59be530c72691bdfd56fcf839ac8bccabe5b62f` |
| A EVIDENCE_SHA256 索引 SHA256 | `c6dc5374ed1be1de526cfeadb8e81ff7733b2bfaae253679e2cbfa89898a4e4b` |

证据根 `docs/verification/t1305/acceptance/runs/final-t1304-t1305/a/`，145 indexed件逐项SHA匹配，其中24PNG；索引自身不再计入件数。已核两轮runner原新字节、原result/log、三组network/result与对应完整业务before/after。复用新65112服务和B新组/候选，每case独立临时浏览器context，无业务storage搬运或mock source。

## 实际执行与目标

首轮三case自然exit1、136.335s，权威reporter为1FAIL/2PASS。Playwright失败后重启worker，模块checks数组重置，根checks只列后两PASS，不能作为全轮汇总。article在点joint1历史后，联合候选region等满120s仍不存在，末态仍editor；匹配source请求、暂持与响应均为0。因此未测试到来源故障，不能称source修复失败，也不能删成纯夹具错误。

article attempt02只调整前置等待：监听初始editor真实messages200并等其region出现，再pick joint1；原source拦截仍早于导航。该单族自然exit0、7.550s，不重跑或冒称覆盖首轮另两族。

| 目标 | 有效成功原件 | 首次请求中断 | 关闭重开 |
| --- | --- | --- | --- |
| creation article | `attempt02-creation-article/creation-article-*` | 两个同wire匿名fresh读暂持/abort | 仅增加1次真200 |
| creation graphic | 根`creation-graphic-*` | 两个同wire匿名fresh读暂持/abort | 仅增加1次真200 |
| editor article | 根`editor-article-*` | 一个lazy读暂持/abort | 增加1次真200 |

creation初两读的wire完全相同，不按顺序假指认article/graphic。三成功链均先看到实际loading、再route.abort连接、alert精确显示“候选来源暂时读取失败，请关闭预览后重新打开。”；关闭后原trigger回焦点、Enter重开，放开原请求走服务器真实200。原params/query一致，group header是`grp-d99d5a06-6`、account为空；没有伪造receipt或仅注入中文。creation目标恢复后ready，另一成员仍disabled；首次打开另一成员仍同中文error、额外读0，再关闭未继续重开，支持“只恢复用户明确重开的目标”。

真实prompt在loading/error/关闭/恢复之间保持。fresh第一次source失败前没有可编辑选择，故**未验证已经手选的字段跨故障保持**。恢复后依据真实source的指定base另行读exact版本，逐字段核默认，再Space改选标题、普通Escape/Enter关开保checked、无额外source；这是ready之后的选择保持。pending/body-key的证明来自原受控回归和B同context原保存恢复，不能由本轮新context代签。

## 实图、隔离与未定观察

已实际查看三族各自`source-loading`、`source-error`、`source-recovered-default`共9张代表图（article取attempt02），预核看过的相同字节沿用；不冒全24逐张查看。沿原白色Dialog/品牌焦点与NoteRelay正文，状态留在预览触发位置，中文明确对象和关闭重开的办法，未增加第二按钮或误报保存成功；恢复后折叠选择及正文可见。本范围没有新的阅读/操作阻断。

四case（含首轮article失败）的完整两平台DTO、脚本metadata及全部3版本before/after均字节一致，SHA为`39863d4966e65a3a90abc0ffaa591078c79fd7c01ea3eb9c214658fb1ba0317e`。原请求记录和测试保护均无模型/成稿save尝试，非有尝试被拦后仍报零。四临时profile自然退出并清理，未操作C controller或用户Chrome/正式App。

`history-selection-observation.json`为独立未定观察：首轮普通历史pick没有显示目标，未采response完成顺序；源码messages引用guard仅提供竞争线索，不能锁定“迟到默认覆盖”等具体根因。定向等待只是使source目标可达，**不是历史选择修复或快速切换PASS**。此问题未accepted-risk、未销账，交C/Root独立登记并核查，当前未分配新编号；不得被本source PASS覆盖。

本范围依据T1305 SPEC的局部来源await及用户关闭重开恢复判据，三族均已实际成立。前置会话装配竞争发生在来源目标之前、消费者不在两卡修复写集，不使已记录的source操作失效；有限通过不是接受该另域风险，也不签历史选择整体可用。

## Gate与交接

复用B同source原timeout命令exit0，三个原件hash均匹配；git `-z`核两control间除docs仅modules.config/progress两JSON，门/消费者未变。新runner预算另核：单case1800000ms，首轮3case串行，hook/launch180000ms，action/expect/screenshot120000ms，navigation300000ms，RPC900000ms，外层14400s、retry0/workers1；定向未缩预算，不冒旧门扫描新docs runner。

本报告不签T1302导出、T1303整体、父矩阵、原生壳/激活/当前App或T1301历史风险；原失败全部保留。只写本报告和JSON，合法step/任务收尾交C。报告窗口随后继续仅用于已授权T1303汇总，四报告全部交付后统一RELEASE。
