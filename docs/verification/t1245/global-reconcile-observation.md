# T1243收尾全局对账：独立只读归类（供T1245继续验证）

实际结论仍为 **全局FAIL**。原 `closure/reconcile-receipt.json` 记录命令 `node orchestrator/process/reconcile.mjs`、自然exit1、1347.182秒；完整原log为24ERROR/0WARN/DRIFT。本次只读取证，没有再执行Gate、改控制面/状态/任何源；不签T1245稳定布局或CSS实施，也不把原3938功能PASS扩成布局PASS。

可明确归类的是20条历史治理欠债（看板1+评审收据19）；另4个失败lesson标签也已在保存的旧完整日志逐项出现，但本次子检查根因未被全局入口输出，不能一并冒签其底层失败原因或所有回归均通过。T1204继续保留全局失败责任及逐根因调查；当前原产品稳定观察可继续，不需要修改门或原断言来消除这些标签。

## 当场完整逐项对照

不是拿 `.lessons-stats` 集合做替代：本次解压读取 `docs/verification/t1212/logs/reconcile.log.gz` 的实际27条完整ERROR原文，逐行与当前24条比较，**当前24条全部与该旧原log逐字相同；没有新增ERROR文本**。压缩原SHA `6745a5066473be2e1656cff6129a71b10c3bbe938afa08448073c739f6f1a081`，解压原SHA `3f2679c38648651bc649cb1fcbe92fec1d1bc2ff3aa762d98a7b0afe8bd15619`，与原 `t1212/reconcile-full-result.json` 保存logHash相符。

旧log额外出现的LED042/054/058，在本次完整log显示guard holds；这仅签本次各宏命令的实际退出，不能据标签减少推断全部内部功能修复。T1210的gzip日志并无完整ERROR全文，未作为逐项基线。

| 本次错误 | 数量 | 精确归类与边界 |
| --- | --- | --- |
| backlog-health RUNAWAY exit2 | 1 | T1204已记录看板超过硬限；本轮并未执行压缩或消除告警。不是自动化渲染/视频提示产品错误。 |
| 历史review receipt | 19 | 下列各旧任务SPEC/event/snapshot/待审债；未出现T1243或T1245 receipt错误。不补事件、不改旧审核列。 |
| LED052归档执行门 | 1 | 旧失败标签相同；原入口要求两个显式55422隔离PG变量，缺任一即throw。当前receipt不记录环境，reconcile隐藏子stdout，不能证明这次具体缺哪一个、不能证明归档产品回归。 |
| LED018桌面浏览器交付门 | 1 | 宏包含douyin-cdp/startup Vitest加Cargo windows测试，原范围也已失败；当前子输出缺失，不能签某一段通过或断言这次唯一由缺二进制导致。T1204/T1081等既有交付债继续保留；视频稿面或自动化CSS候选未改这些消费者。 |
| LED057 Windows目录复用门 | 1 | 当前宏为Cargo `runtime_cleanup_tests::windows_ --no-default-features`。此前T1204记缺真实构建资源，但该记载不代替本次Cargo stderr；保原FAIL，不更改用户目录/入口校验。 |
| LED053超时门 | 1 | 当前宏为 `tools/timeout-policy/verify.mjs`，静态与7组动态串行，只要任一失败整体exit1。已保存dd6轮27静态逐对象等于46a、166动态PASS，详见下段；不据旧结果冒签本轮全部动态GREEN。 |

19个评审任务完整名单：T1072-owned-devices、T1021、T915、T859、T858、T824、T819、T816、T768、T726、T707、T703、T691、T694、T656、T652、T645、T642、T635。它们本次对应的事件缺失、SPEC hash过期、receipt/snapshot不一致、T652待审文本均与上述旧完整原log相同。归档或待审任务各自责任不由T1245代销。

## lesson根因的可证明层级

`orchestrator/process/reconcile.mjs:739` 对每个lesson执行 `execSync(L.check,{cwd:REPO,stdio:'ignore',shell:'/bin/bash'})`，catch只输出配置中的固定onFail。因此当前“RECURRED”文本不是底层断言/构建/环境错误全文。已核当前实际 `reconcile.config.json` 各命令，未执行它们。

LED052已有独立历史完整原入口日志 `t1212/logs/archive-guard-explicit-environment.log.gz`：3文件59/59、108.21秒；这证明当时两个显式隔离环境下原门通过，不证明本次全局入口的环境或底层59例仍全部通过。当前receipt没有源冻结矩阵，不能为此对账补一个未发生的稳定全树Gate。

LED053保存的dd6 `static-comparison.json` 明确27条完整静态对象与46a相同，7组166例通过、整体exit1；原独立命令receipt实际40.664秒。读取旧原日志的13个命中文件是Codex执行/端口、local-codex-status、Doocs/Kuaitu静态编辑器、douyin-cdp-comment-diagnosis以及workbench artifact/browser/native消费者，未命中本轮ammo-card-list或automations-island。当前静态检查源码排除tests/spec/fixtures/docs；本轮测试24h和显式120秒必须由真实SDK/AST及公共旅程单独核，不能用静态门没扫描测试证明预算。当前lesson失败没有底层stdout，仍不能把旧166例移签为本轮动态结果。

此前T1204 SPEC引用的 `docs/verification/t1238/reconcile-final.txt` 本次实际读取为0字节，且所述 `reconcile-after-fixture-fixes.txt` 当前路径不存在。本报告不把这些引用当可读原证据，也不补造以前日志。足够支持“当前ERROR标签全部已出现”的是上述保存完整t1212日志，不是该缺失历史引用。此证据完整性缺口仍由T1204后续核对，当前未修改共享记录。

## 限定收口建议

不发现本次24条错误中有新的ERROR文本直接指向T1243一行素材提示或T1245局部布局候选。20条治理债明确在本轮产品写集外；4个lesson是已存在失败标签，但其本次内部原因未唯一判明。可以继续按精确任务范围取得真实结果，保留T1204和原全局FAIL；**不能仅凭本报告宣称全部24条底层都是已知旧原因、全局全绿或本任务自动完成**。任务完成仍以其自身真实Gate/公共链/独评证据和明确保留全局失败的审计为准，不能改guard、预算、旧receipt来洗绿。

本次原logSHA `9debc01bd12b828aec750a1cee1da4d89704843710cddd5a89041d54ca93d69f`；数值receiptSHA `ce8d0e21bf9f1fb5636b73ab464d446d8fc3ad368df863fc11a69211cf21914d`。没有重新启动任何服务、数据库或Gate；3939运行及最终布局仍待独立实际证据。
