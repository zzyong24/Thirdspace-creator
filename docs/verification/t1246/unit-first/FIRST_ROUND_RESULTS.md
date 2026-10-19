# T1246 全量首轮真实结果（四包首轮与类型检查均已实际结束，失败保留）

冻结候选533224f334c43cdb81a344424e420cad93784dd1。contract/worker/backend为integrated-unit-acceptance专属树；frontend为integrated-frontend-unit专属树，避免与package/browser的dist写竞争。Node25.9.0/Vitest4.1.8，frozen install实际exit0；原配置全发现、retry0/bail0、正test/hook/teardown CLI180000，原更长显式保留，原更短inline预算仍按首次事实登记、不能声明全历史预算已合规。每包开跑实际HEAD+源253SHA绑定，原assert/数据未改。

| 包 | 首轮实际文件结果 | 首轮实际用例结果 | exit | 原回执 |
|---|---|---|---|---|
| contract | 76文件，74PASS / 2FAIL | 456PASS / 43FAIL / 0SKIP / 0TODO | 1 | contract.log/json/-exit/summary/failures |
| ai-worker | 159文件，151PASS / 8FAIL | 1437PASS / 25FAIL / 0SKIP / 0TODO | 1 | ai-worker.log/json/-exit/summary/failures |
| backend | 643文件，554PASS / 88FAIL / 1SKIP | 6492PASS / 400FAIL / 1SKIP / 0TODO | 1 | backend.log/json/-exit/summary/failures |
| frontend | 559文件，520PASS / 38FAIL / 1SKIP | 4911PASS / 158FAIL / 8SKIP / 1TODO | 1 | frontend.log/json/-exit/summary/failures |

文件数按真实文件状态并核各assertion是否实际执行：Vitest把原timeout smoke全跳过文件的raw status仍记为passed，报告将它单列SKIP，不把未执行文件记PASS。原JSON不改；summary保rawFileStatusCounts及skippedWholeFiles。

frontend另原log含**1个未处理拒绝**Cannot update an unmounted root，原JSON未提供此字段，已从原log单列，不把它吞掉或将受污染下游PASS当闭包。原559 test sourceSHA全部与开跑前一致，结果恰559/missing0/extras0，完成后HEAD533/git clean，见frontend-after-source-discovery-check.json。

## 独立追加覆盖与原失败保留

- contract原config外2src文件：主线程独立临时config实际30/30PASS/exit0，保原76文件43FAIL；不是原batch全绿。
- frontend原opt-in timeout public reader在全量原配置实际1SKIP，之后同原未改case独立追加1PASS/0SKIP/exit0、retry0。真实隔离Chromium+本地31秒HTML，reader31138ms；取消assert通过，child正常退出并清理本run临时根。原预算550000（540000+10000grace）/outer1200000，不是平台/模型/App，见TIMEOUT_SMOKE_RESULT.md与完整receipt。追加不覆盖全包158FAIL/1unhandled/原SKIP。
- Rust原资源缺失exit101/0正文保留；复制合法本轮包3资源后实际lib267PASS/0FAIL/13ignored（声明280）、134.02s/exit0。子--exact前缀与条件Python仍有覆盖缺口，见../rust-first/SUMMARY.json，不代签native App。
- 主线程当场通报原浏览器170已结束131PASS/39FAIL；实际截图/trace与完整原browser归因由浏览器owner归档，本报告不把该通报冒充本Agent逐body核验。设置fresh完整body补充实际2PASS仅属fresh隔离环境，原170中的两条FAIL仍保留；不覆盖原counts，不将unit或包ready替代原浏览器失败。
- 开发包实际构建与只读DMG/签名验证由../package-first/RESULT.json留证，安装/启动App=false；package worker v2只证明真实包无任务ready+exit0/IPC关闭，不能代签生成或App。用户明确暂不授权App，原生App未验保持。

## 根因与集中写集

contract43真实失败是已有T1199 operation穷尽清单漂移，独评first-diagnosis/contract-first-diagnosis.md；worker25原红含协议/恢复/搜索/fixture退出ACK与旧bundle漏external，first-diagnosis/worker-first-diagnosis.md与独立启动stderr证明，原FAIL不覆盖。

frontend38file/158FAIL逐case全stack、执行源SHA、分类与最小write_set见FRONTEND_FIRST_DIAGNOSIS.md、frontend-first-file-classification.json。已证Reporting缺mock13、NoteRelayowner缺projectId4、绑定strict新增executionRoute回归原10+4case、ready旧前置/迟到mock，其他明确诊断不足；不得机械放宽全部oldexpected/count或删owner检查。真实产品封面独立模型引导缺陷由主线程Copilot独评另列，不因为fixture问题多而签产品无回归。

backend已出现红保原log；T1074实际本轮50028组锁先于父行锁，旧helper只观察分类SQL120s耗尽，单独因果见ROOT_CAUSE_REVIEW_IN_PROGRESS.md及t1074-lock-source-binding.json，待整包stack与原例复验，不与55422环境拒绝混归。27旧PG消费者真实源行/SHA及连接前owned marker/PID/dataDir/admin/namespace、Node和CLI同URL的最小动态修法见PG_OWNED_ENV_REPAIR_REVIEW.md；它是待集中方案，真实PG未到的断言不是PASS。

## 四包类型检查

- contract：completed_exit0，实际exit 0
- ai-worker：completed_exit0，实际exit 0
- backend：completed_nonzero，实际exit 2
- frontend：completed_nonzero，实际exit 2

controller只在全部四包Vitest实际完成后依序执行4typecheck（frontend next typegen只专属unit树）；失败仍保首次log/exit，不提前修源/assert。首轮全部完成后才集中修复、重新冻结/打包/原例复验；四包首轮与类型检查结束不代表通过；原全部失败及独立补覆盖保持，不能签全系统全绿或安装版全功能上线。
