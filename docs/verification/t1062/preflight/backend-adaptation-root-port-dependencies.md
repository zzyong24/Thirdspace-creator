# T1062 暂停期间实际根端口依赖

暂停后仅只读与/tmp输出，不改产品。当前base75131fb489962e50d483fe21baccab39e0350e89，20dirty见 t1062-backend-adaptation-paused-wip.json。

## 已证实必须纳入的路径

- backend/src/modules/projects/projects.service.ts:1043 getOutputByCreationRequest显式requireAccountId，createOutput:1544有clientRequestId则走repo.createOutputWithRequest。
- backend/src/modules/projects/projects.repository.ts:1206 findOutputByCreationRequest与1219 createOutputWithRequest仍账号only。后台实际调用为output-conversions.service.ts:22-24→articles/graphic/projects.createOutput；work-members.ts:26-33→相同原owner create/find端口。不能在外围造账号绕开。
- backend/src/schema/projects.ts:104 outputCreateRequests仍非空账号、无组；冻结0128:669/685/1879/2433已实际nullableaccount、groupId和group/accountNULL partialunique，旧accountunique保留。仅ORM需mirror，不改DDL。
- backend/src/modules/articles/articles.service.ts:72 scope账号only；77 anchor、155/164 find/create、194 insert、310/330/333 candidate read/insert相同门。文章公共已存文档读取也会挡空组。
- backend/src/modules/articles/articles.text-results.ts:49 account、80候选读、97插入全账号only，creative-results adapter实际单字段路径不可只改外圈。
- backend/src/schema/articles.ts:7/23/41 account非空、无group；DDL0128 article_anchors/article_candidates/article_text_candidates已有组与nullableaccount，anchors/candidates新partialunique。
- backend/src/modules/graphic-posts/graphic-posts.service.ts:113 scope账号only，122 anchor、217/226创建请求、254插入、400/454/459文本候选读写。
- backend/src/modules/graphic-posts/graphic-posts.schema.ts:8/29 account非空、无组；DDL0128 graphic_post_anchors/group unique与graphic_post_text_candidates group列已具备。
- backend/src/modules/moments/moments.service.ts:12-14 account/owner/request仅账号；22/32 insert及38list。组合moments member和workSource readVersion公开port均依赖。
- backend/src/schema/moments.ts:4/8 account非空无组，对应0128 moments_anchors/requests已组列+nullableaccount+requests partialunique。
- backend/src/modules/moments/moments-model.service.ts:15-20 account/where/requests/reserve仅账号；24 generate、26 readFrozenGenerationTask、29 adopt、30 retry沿实际AI ports写/恢复原moments候选。修手工根不修这个仍挡空组生成/采纳/replay。
- backend/src/schema/moments-model.ts:4 momentsCandidates账号非空无组；0128 moments_candidates已组列与nullableaccount。
- backend/src/modules/moments/execution-moments-model.service.ts:10 business账户比较、11 root与active候选账户比较，NULL= NULL SQL不命中；真实lease.withLease(ref,'settlement')原模型settle链会失败。应核原task stamp+row原scope而非现group重签，旧record/frozenInputDigest保持。

## 仅暂不需要编辑的已读依赖

moments-model.adapter.ts只透传owner.readFrozenGenerationTask与原facets，不直接账号门禁；moments-model.ports.ts已moments(tx)/ai(tx)/lockMoments现成事务ports。当前无编辑证据，不因范围名义加入必改。

## 验证补充范围

新增root改动需原projects create/getOutputByCreationRequest公共回归、articles create/whole+single-field、graphic create/text、moments handwrite/model执行integration，至少同组不同平台filter/纯空组/归档/跨组+旧key多账号歧义+原冻digest回读与settlement。不能仅跑外围helper。原144集合内tests可追加多数集成，但当前未列moments.service.test.ts/moments-model.integration.test.ts，建议同根实现补入真实原tests并列独立argv，保留原断言。
