# T-1093 原转写稳定控制意图响应恢复

Root/Growth T215 DEC205准入的原Mother R01/R03/R05及分享导入稳定command维护，不改公开contract/DTO、方向、架构、权限、预算/费用、状态策略或partial。私有payload回执模型/范围已在Root准确合同记录；不是全域command key唯一协议。

本人创作者有原严格转写task与刚明确提交action/key，响应丢失。沿同一原key/action/完整target核回原task当前真实状态，交原步骤/已存稿件；不能旧意图再入队。明确新意图新key仍原状态/预算/期限规则。旧无receipt历史ACK无法追溯，不补造。

```mermaid
flowchart LR
 A[本人原任务与稳定控制意图] --> B[首次原门与状态同交易受理]
 B --> C[连接丢响应]
 C --> D[同key核原持久受理]
 D --> E[仅回当前原任务与已存结果]
 E --> F[明确另一意图仍走原门]
```

准确3路径：backend/src/modules/execution/persistent-task.service.ts、新增transcribe-command-receipt.ts及transcribe-command-receipt.integration.test.ts。v2 befbc0c819d4，生产2c0dd4dc93d6→346aeb5aede4/helper31d6346df195/newtestfcd912771cb8；v2仅suffix纠F01，独立9c787be17101已核。原workspaceWrite/owner/绑定/ordered行锁与daily同tx保存strict私有受理map；同task/key/action/target/frozen input只回当前不新迁移/reopen/调用，畸形/异目标拒绝；保所有payload当前spread与publicallowlist。

先新test-only E01真实RED（非fixture错），后3路径GREEN/完整10；仅新test补Root execution plan X01–X12真实状态/原budget/deadline/attempt门、legacy、host字段伪造、真正Host/ledger/保存生命周期。原command没有deadline拒绝，claim/lease保；explicit组owner谓词不新增member活跃限制。未知调用新key仍拒，旧受理key只读。不可删除旧断言/skip或放宽timeout/config，newtest自身错误保首FAIL且只修newtest。

Node25.9/pnpm10.32.1/backendintegration原同类180000ms/maxWorkers1/retry0。自产内存PGlite和该test mkdtemp磁盘close/rm；相关persistent/binding/business/ledger/worker/Host原库存与types真实执行。T213正在原库存读取完之前不变依赖；Root串行新任务治理。零provider/network/userdir/生产/新PG库/安装/browser/部署，无PG并发或UAT签署，不改Mother/reviewchain/引擎/manifest。T214原组件需同步当前task回执消费者，接口通过不能冒闭环。


DEC-205准确测试兼容补充（2026-10-10）：Root全文核未应用单hunk 2629ed0abba09262e5b5a11021f5c888c16aba273bf960343d92657d122bd971；准第4路径 backend/src/modules/execution/transcribe-postprocess.integration.test.ts，只容纳本任务已准私有回执，全部旧payload其余字段严格深相等/期限不变；新map唯一hash键与六字段严格相等，完整冻结input/targets/原attempt/同tx时间实算。原失败131P1F保留；修后原43/相关132/新22与backendtypes重验。零生产行为、费用、状态、timeout或其他旧断言变化，不消除原170四失败、不冒UAT。
