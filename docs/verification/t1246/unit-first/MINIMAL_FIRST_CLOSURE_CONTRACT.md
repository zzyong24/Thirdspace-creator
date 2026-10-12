# 完整首轮确定前置闭包：195 ENV、2 collection、1前端类型缺导入

本工件供主SPEC整合，候选533224f334c43cdb81a344424e420cad93784dd1。所有首轮与四types真实EOF；只读核对，无产品/test/assert修复，不解除冻结，不签历史或下游通过。完整报告见FIRST_ROUND_RESULTS.md与first-final-source-scope-check.json。

## 195个真实PG环境前置（26文件）

191case的stack准确命中冻结55422 guard行，4case为真实Socket护栏连接前拒绝；两集合与原分类完全一致，unsupported0/missed0。逐case原stack、guard行及test/Git对象SHA见minimal-first-closure-source-map.json、backend-exact-pg-env-classification-first.json。400原FAIL中余205另查，不统归PG。

候选最小改动：仅下面26文件实际guard/URL入口、现有backend/src/test-fixtures目录中的owned-postgres.ts测试helper，以及临时runner的ownership输入。27静态候选中的intelligence-source-workspace因collection缺fixture未到guard，不能算已测。

安全合同：任何Node/CLI前核本run真实tmp根/marker/nonce/UID/PID/start/postmaster目录/端口/admin，拒绝未拥有55422/5432/任意用户库，不能永久换50028或先连SQL后校验。只操作本run精确注册随机DB；真实pg_dump/restore与Node同一owned URL，清继承PGSERVICE/PG*影响；保原真实迁移、并发锁、完整恢复/ID/count/ledger和所有正文断言。原ENV与未达到下游保留，修后正路要真实PG，负路SQL/CLI0，不以stub替代PG成功。护栏/native选择/完整budget与独评保持。

| 冻结输入 | 实际ENV case | SHA256 |
|---|---:|---|
| backend/src/group-upgrade-postgres.integration.test.ts | 1 | 21e7611fde3d4df4bbe0b6d3592ae374e1879497fd7fb31783beda3821dd5013 |
| backend/src/legacy-scheduled-job-migration.test.ts | 2 | bb89b6a28aad5d6edbc2551f543fa252913078418b46e46c2466d66cda9d2e97 |
| backend/src/legacy-source-migration.test.ts | 13 | aa4dd55141084440831898be6bf7f09ea5f30e5885a3cb38b7b2898b48413c6c |
| backend/src/integration/adjacent-parent-migration.postgres.integration.test.ts | 18 | 61e2bc9b394f12618922fc180ea232a4a5d3a80e272c1d935fa6873c988d7645 |
| backend/src/integration/calibration-archive-concurrency.postgres.integration.test.ts | 20 | cd55d1cede15641e1b668cfecc10763d63944b4c310e2f49aa6a367524681ffc |
| backend/src/integration/group-knowledge-write.postgres.integration.test.ts | 10 | 86da1c83a1a3c9f92278c703bea301290f472f0d46458aae1e29ff881544b8a3 |
| backend/src/integration/group-migration-concurrency.postgres.integration.test.ts | 12 | 131ffdfdb6952a4e888224fc210e2c3c8df196f0661440402f993ed19dadbc00 |
| backend/src/integration/project-create-archive.postgres.integration.test.ts | 7 | f5beea0e13df190139ecf4666e086bb17695640325c156f2ccd118faaf61d7d4 |
| backend/src/integration/publication-mutations-migration.postgres.integration.test.ts | 18 | 84dda08648a2de8b0f098bc21352ab20de4cb512e662785874fa146acf051ed9 |
| backend/src/integration/scheduled-export-progress.test.ts | 6 | 3265af8ce246585d6a45db95f47f3e18bf8311e38ea321c5a6103bdf38f4655d |
| backend/src/integration/scheduled-flywheel-consumption.test.ts | 2 | 43128c2d8b74baf6786350e87542aa18f7b658ace868a9ee31f1d17760df1f82 |
| backend/src/integration/shared-parent-writers.postgres.integration.test.ts | 30 | a0af88f4cd72f2968703d0e7044182ada4f5607f61bf43ae8d70c0034cc511ff |
| backend/src/integration/startup-group-collectors.postgres.integration.test.ts | 30 | 969c43578cc96a84ac8714c194443efa24fce531c73203f0c3bf2b8706a544e3 |
| backend/src/integration/t1062-new-domain-group-workspace.integration.test.ts | 4 | e94d5210c11df4883d455c954ab16418bf6d4dd7916b6422ff6cca15da6ad60f |
| backend/src/application/generation/work-review-root.test.ts | 1 | cf7347cb43e7127c05e2197ade1e67e9d5b878754293f163dfe6b7bf72790026 |
| backend/src/modules/articles/articles.integration.test.ts | 1 | eacc71df7b216f528ad6db72c124c48c038c82350ca5c2c9242e63aff612ad46 |
| backend/src/modules/artifacts/workspace-parent-write.integration.test.ts | 2 | d3bf2d4da45460d02ff5a8f137d13abb819967c1a36c133a5000aa1094d70e58 |
| backend/src/modules/creative-canvas/creative-canvas.service.test.ts | 1 | 1690eb7a6dc6ff4adb20444dccd3dda3d4b3a8c31e0115d28f5ffa8cb11a8553 |
| backend/src/modules/ai-runtime/asset-business-execution.service.test.ts | 3 | 9e1df5f7d667165a0a7cd97baf56ee30c716cb53e872197b8ee1039a5fd6ba49 |
| backend/src/modules/graphic-posts/graphic-posts.integration.test.ts | 1 | 14761851e1ca3d6c45575e86ff22fa2769f452e5e07571b7498b054861eec51a |
| backend/src/modules/material-links/workspace-parent-write.integration.test.ts | 2 | 40f269b1026c9cfbbe4625c0473327be9f86564fc749a136f24d542567932983 |
| backend/src/modules/moments/moments-model.integration.test.ts | 1 | 0619b3f891485d73839c55ff1a6571492bfe561f15c6446d4ac1abde361b610a |
| backend/src/modules/production/production-asset-asr.integration.test.ts | 1 | 3fd93ea3546080fd6190a535a6647dd5fb4271cb71c993234799dc48f6648fee |
| backend/src/modules/production/production-rough-cut.integration.test.ts | 3 | 3eddedaedaeed193144ab360ab4417d8de8313072276ff3015a33b51abef5b01 |
| backend/src/modules/production/workspace-parent-write.integration.test.ts | 2 | 08e34f1297a06785bc7ce1e67529f13c98ce9ae2810197301865b46393d0e724 |
| backend/src/migration-convergence.test.ts | 4 | 8653853cbcceba9dd58d88ceb65e1d8ed31abc9ee6138fcf16f8a1857cc686bd |

## 2份真实存在但未纳入冻结候选的源码夹具

这两文件在canonical实际存在且为untracked，不是新造历史报告。以下旧Git对象也真实存在，可核原source SHA；wrapper与原raw源码SHA不同，header声明import包装，本次未代签所有函数逐字/runtime历史效果。只允许补入实际源码/import闭包并记录精确SHA，保原test及全断言；随后真实collection、正文与backend类型复测。

- docs/verification/t1217/fixtures/historical-intelligence.service.ts：canonical /Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1217/fixtures/historical-intelligence.service.ts；现存SHA aba25b0714313c0e22c5c21a59223a3262e0620c21b2193f1a8f3e8290cebd6c（211647 bytes）。旧Git 9fde2af65605fa5b3fd643290fa7bac999cc683c:backend/src/modules/intelligence/intelligence.service.ts，真实raw SHA 3656cf91333147c2372c4d1ae9978d78cddffc3c980dfdb07a21c74703d88b81。首轮消费者 backend/src/integration/intelligence-source-workspace.test.ts:14 未collect到正文。
- docs/verification/t1229/historical-generation-bridge.ts：canonical /Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1229/historical-generation-bridge.ts；现存SHA 702df82aa972de2ce65dd0886934ebfd8adc520bc82ecb0e1c29ef4fa0f411da（16724 bytes）。旧Git 4df3424972831acfdd091056b3045b2472120692:backend/src/modules/intelligence/intelligence-generation-bridge.ts，真实raw SHA 727d8f42186bbc18e61a03e611db447f5445205517fffa7c26da1389d80aa8c8。首轮消费者 backend/src/modules/intelligence/intelligence-rewrite-official.integration.test.ts:21 未collect到正文。

backend typecheck实际exit2的三诊断就是上述两缺import及row implicit any；后者未证明需要新业务或放宽类型。最小候选写集为这2现存fixture，不是修改产品服务。不能补拍历史PASS。

## frontend类型检查原生成输入漏导入

frontend next typegen真实成功，tsc真实exit2，唯一诊断 tests-t1246-generated/e2e/t1070-director-editor.spec.ts(75,21): TS2304 Cannot find name resolve。冻结原file SHA c162998fbcda7d51658269ebbf8fc5f8d5bafbb08bfc7c97d10cbd176b92c371，与533 Git对象一致。原node:path import只有join，75行使用resolve；最小候选只在该原生成browser测试import补resolve，保证据隔离目录/所有操作/断言/预算。它不消除原170浏览器39FAIL，也不签App。

余205个body FAIL继续逐case因果/源码/最小写集核对；首轮全部原红不重写。
