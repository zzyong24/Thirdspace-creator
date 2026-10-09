# 完整JSONB回执守卫最小修复实证

操作者本人原转写任务已有真实已确认ASR原文/settled回执，需要保存到原导入作品并交编辑/重建。原JSON.stringify将DB键排序当业务差异，导致正常原文保存被拒。完整深相等恢复同一事实保存；原operation、预算、模型账本、owner/workspace、lease/fence及事务门全部保留。失败先回读原调用/回执，不重ASR或创建新任务。

主控核schema与精确patch，独立只读proposal报告位于Growthcompletion/creator-jsonb-receipt-guard-proposal-independent-review.md，确认无具体blocker后授权实施。唯一production差异是execution-transcribe-workflow.service.ts的Node isDeepStrictEqual import与完整frozen/post比较，不涉及pending R05a、generic失败归类、partial或来源冷却。T1072规范工程边界与精确2文件write_set已记录，context-jsonb-guard-repair.log真实生成；未调用正式审核record、不消耗T1072或T915轮。

新增11守卫场景复用现transcribe-postprocess.integration.test.ts的真实PGlite/ASR账本/实际模型HTTP/工件fixture，单独计数，原30转写输入与expected不变：

- 真实JSONB键重排，strict解析完整深相等true而stringifyfalse；首次及幂等保存只有1个原工件，原ASR仅1个settled调用。
- 合法完整结果中的transcript/applied/reason单独变化，保存全部拒绝；没有只比正文。
- DB真实回执缺transcript/reason或额外actualEngine/segments，strict schema直接拒绝；不把不属于result的engine/数组编造成新业务字段。
- 实际HTTP已结算模型plan的真实model/apiFormat identity变化，保原operationKey，拒绝保存。
- 原业务awemeIds与冻结modelInput有序数组次序不等，拒绝保存；不改为集合。

每个负例断言原完整ledger不变、实际HTTP请求数不增、没有新工件；身份反例使用真实已有模型调用，不捏造可信identity。

真实RED backend-transcribe-jsonb-real-identity-red.log：新增11中1正常保存FAIL/10严格负例PASS（13原场景仅本定位未选）。唯一guard应用后backend-transcribe-jsonb-real-identity-green.log：11/11通过，11.22秒，exit0。该聚焦结果不等于整个24场景或原30终态全部通过；完整专项/170/类型检查另记录实际结果。原58FAIL、50FAIL、39FAIL与键顺序RED全部保留。


完整专项backend-transcribe-jsonb-full-guard-regression.log：3files51/51通过、21.39秒、exit0，无skip。覆盖现integration全部24（含11新增）与原preparation/audio27；实际源码Worker及已构建独立bundle保存全文/终态均运行。guard后backend-jsonb-guard-final-typecheck.log再次exit0；没有放宽原timeout或改待裁决expected。
