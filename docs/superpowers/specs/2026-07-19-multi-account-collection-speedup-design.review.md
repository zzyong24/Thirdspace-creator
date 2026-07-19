# SPEC 评审记录:多账号采集提速

- **被审**:[2026-07-19-multi-account-collection-speedup-design.md](2026-07-19-multi-account-collection-speedup-design.md)(T-433)
- **review_mode**:`cross-family` · 模型 `gpt-5.6-sol`(codex exec,schema 强制结构化)· 2026-07-19
- **verdict**:**FAIL**(3 blocker + 9 major)
- **总评**:方案方向合理,但队列并发与重启恢复存在发布级缺口,且含明确范围缩水措辞,当前不可开工。

## 逐条裁决(实现方回应 → 人裁决)

| # | severity / category | 问题(摘) | 实现方回应 | 人裁决 |
|---|---|---|---|---|
| B1 | blocker/approach | §2.2「两条 tail」无共享唯一执行权 → 高低各起一个 = 并发 2,破防封不变量 | **接受**:必须改「一个共享 active/drain 仲裁器 + 两条待选 FIFO」,全局 activeCount≤1,加并发测试 | 采纳 |
| B2 | blocker/fit-positioning | 队列仍是内存 Promise 链,重启丢待执行闭包 → queued run 不自动续,违反宪法 P-05/R-INGEST/NFR-RELIABILITY | **接受**:必须定义持久化队列恢复契约(启动扫 queued/running + CAS re-claim + 幂等锚) | 采纳 |
| B3 | blocker/scope-reduction | §2.5/S5「可选·独立切片·不阻塞主线」= 命中量规禁止的 optional scope reduction;§1 又称提速靠增量而主线不交付 | **接受**:S5 增量要么纳入本 SPEC 必交验收,要么走显式 PLAN 变更移出签核范围 | 采纳 |
| M4 | major/completeness | 绑号 self.detail 建不建 run 歧义(§2.1「待触发」vs §5「入低优/待触发」不等价) | **接受**:定唯一行为(建/不建 run + status/priority/scheduledFor + 进页是提优还是新建 + 次日幂等合并) | 采纳 |
| M5 | major/completeness | 错峰 hash%N 允许碰撞,不保证「互不相同」;缺时区/跨日/迁移/自定义保留 | **接受**:定无冲突槽位分配 + 时区跨日 + 已有 cron 幂等迁移 + 自定义保留 + 增删号重排 | 采纳 |
| M6 | major/approach | 严格高优 → 低优饥饿;非抢占无法保证「所有明细 done 才跑封面」 | **接受**:明确保证边界(每次选取高优优先 or 账号批次屏障)+ 低优最大等待/aging/可接受饥饿上限 | 采纳 |
| M7 | major/completeness | queued 状态机不全(取消/重试/失败终态/CAS/sweep-vs-runner 竞态) | **接受**:补全状态转移表 + CAS 前置 + sweep 使队列项失效 + runner 原子 claim | 采纳 |
| M8 | major/completeness | 独立低优 run 未定义 kind/父子/输入快照/幂等键/失败语义/重复合并 | **接受**:补字段级契约 + 唯一键 + 依赖事务 + 重复/父失败/重启/部分成功补偿 | 采纳 |
| M9 | major/reinvent-wheel | 缺「现成方案/OSS 调研」章(队列/限流/持久调度候选 ≥2 + 采否理由) | **接受**:补候选对比(自建双队列 vs 扩展现有 scheduler/gate vs OSS),逐项持久性/单并发/优先级/公平/恢复/成本 | 采纳 |
| M10 | major/reinvent-wheel | 「现状」断言缺逐条 file:line/codegraph 证据(gateway 单例/9s-4s/双闸/2s 轮询/sweep 覆盖) | **接受**:补「现网事实」小节,每条附 file:line;否定断言(无持久队列/无 queued 态)附 rg/codegraph 空命中 | 采纳(证据在 research 已有,需内联进 SPEC) |
| M11 | major/completeness | 「秒级」无量化(数量/口径/网络) | **接受**:给 P95 阈值(指定作品数/冷热缓存/网络下,绑定成功→首批作品可见)+ 区分任务创建 vs 采集完成 | 采纳 |
| M12 | major/traceability | 无 FR-ID 映射;按需触发/手动调时段无 route/contract/测试 owner | **接受**:分配 FR-ID + FR→契约→实现入口→测试→切片矩阵;补按需触发/手动调度的 ownership/校验/存取链 | 采纳 |

## 结论

**全部 12 条接受**——SPEC v1 对一个改数据流的编排/调度变更过薄。**不准开工**(FAIL,有 blocker)。**下一步 = 修 SPEC(补:共享单并发仲裁器契约 / 持久化队列恢复契约 / 完整 queued 状态机 + CAS / run 字段级幂等契约 / 错峰无冲突槽位 + 迁移 / OSS 调研章 / 现网事实证据锚 / FR-ID 追踪矩阵 / 量化阈值 / S5 scope 决断)→ 再过 gate(第 2/3 轮,≤3 轮上限)**。

---

## 第 2 轮(v2 重写后)· cross-family gpt-5.6-sol · verdict FAIL(4 blocker + 4 major)

评审确认「方案方向正确」。第 1 轮 12 条大多已解;剩余更深:

| # | severity | 问题(摘) | 裁决 |
|---|---|---|---|
| B1 | blocker/scope | **DEC-1「移出增量」人裁决仍「待确认」= 未获批准的范围缩水**。显式写 DEC ≠ 已批准 | **需用户拍板**(AskUserQuestion);不能自批 |
| B2 | blocker/approach | 单并发证明只覆盖单进程;**双开=2 仲裁器=并发 2 破防封**,CAS 只防同 run 重复认领非全队列互斥 | 接受·v3 加 **DB 持久化全队列 lease/mutex**(owner/heartbeat/expiresAt/fencing)+ Tauri single-instance |
| B3 | blocker/completeness | **aging 自相矛盾**:queued 2h sweep→failed 早于 low 6h 提升;且 ORDER BY priority DESC 使 aging low 仍排 high 后 | 接受·v3:queued 等待不算 stale;单 `effectivePriority` 排序 + 明确「一条 aging low 后取 N high」公平算法 + 时钟测试 |
| B4 | blocker/traceability | **重启幂等契约只覆盖 backfill**,self.metrics/self.detail 的建项目/写指标/写明细/派生 low-run 无稳定 runId/锚/checkpoint;CAS 不防「部分写成功、终态前崩」重复副作用 | 接受·v3:逐 sourceKind 幂等键 + 首次副作用前锚 + 事务边界 + checkpoint + 重放 + 故障注入重启测试 |
| M1 | major | recoverQueue 依赖 aiTask 判活,但 job_run↔aiTask 关系/确定性 run 必有 aiTask 未定义 | 接受·v3:独立采集 lease/heartbeat/续租/fencing/失联恢复 |
| M2 | major | 状态机 running 取消被拒(违 P-05 取消/重试);部分成功记 succeeded(违 §11 partial 条数/失败记录/重跑) | 接受·v3:running→cancelling/cancelled 协作取消 + 失败 retry 转移 + partial 结构化结果 |
| M3 | major | 字段级不完整(priority/eligibleAt/claimedAt/... 缺类型/默认/索引/迁移);幂等键 §2.3 与 §2.4 不一致;job 归属两模型未裁决 | 接受·v3:唯一 job/job_run 归属模型 + 完整 DDL/Drizzle + 部分唯一索引谓词 + eligibleAt 规则 + 迁移/回滚 |
| M4 | major | 每账号一槽不证明 6 类 job 全无冲突(A 的 job2 可能撞 B 的 job1);「本机时区」未对齐 BR-05 用户设置时区+DST | 接受·v3:每 (accountId,jobKind) 最终 cron 公式 + 全局冲突检测 + 用户设置时区+DST/跨日/改时区重算 |

**结论**:B1 需用户拍板范围;B2/B3/B4 + M1-M4 是「把内存串行升级成生产级持久崩溃安全优先级队列」的完整工程契约,v3 补齐。**STOP:已第 2 轮,剩 1 轮(≤3);若 v3 仍 blocker,按 STOP 规则回上游(可能拆小 SPEC / 缩范围)。**

---

## 第 3 轮(v3 缩范围·折中后)· cross-family gpt-5.6-sol · verdict FAIL(1 blocker + 6 major)· **STOP 上限已到(≤3 轮)**

| # | severity | 问题(摘) | 裁决 |
|---|---|---|---|
| B1 | blocker/fit-positioning | **内存优先 FIFO 里等待的 run 被当 `running` 显示 = 假进度**(违 P-03/P-05/R-INGEST 真实进度)。评审建议:要么落真 queued 态(=移出的持久队列),要么 drain 取到才标 running,**要么移除内存优先队列只留轻触发+错峰** | **采纳评审收敛**:移除内存优先队列 → 降到「最小」(轻触发+错峰);明细>封面靠**延后重活**实现(非队列) |
| M1 | major | 优先级契约自相矛盾(FR-1「重活全后」vs §2.2「5 high 后强制 low」;连绑 3 号 6 high 时首 low 可插在第 6 明细前) | 随移除内存优先队列一并消解(无 aging) |
| M2 | major | drain 无逐 run try/catch/finally,run 抛错则 active 永 true → 采集闸永久停摆 | 随移除内存优先队列消解(不再引入新 drain) |
| M3 | major | FR-3「第一页落库即可见」带「现有?核实」未证;mock 证不了含真 profile 冷启的 P95 | 采纳:先 file:line 核实第一页落库;P95 改「功能测 mock + 真链路另测起止/机型/样本」 |
| M4 | major | 错峰无容量边界(>240 号必无解)+ 自定义撞车无拒绝态 + DST 重复/缺失时刻未定义 | 采纳:定最大账号数/窗口容量公式 + 容量耗尽确定行为 + 自定义冲突校验/建议槽 + DST 语义 |
| M5 | major | 新增 collectionBaseMinute/userCustomCollectionTime 缺表/类型/约束/迁移/RPC 契约;并发新增/归档可能取同槽 | 采纳:补完整 DDL + 槽位唯一约束/事务 + PUT contract |
| M6 | major | 缺「现成方案/OSS 调研」节(cron/时区/调度候选 ≥2) | 采纳:补 croner/luxon 等 cron+时区库 vs 自建 对比 |

**结论(STOP)**:3 轮均 FAIL,评审收敛到「**移除内存优先队列,只做轻触发 + 错峰**」(最小范围)。B1 靠此消解;剩余 major(错峰 DDL/容量/DST/时区库调研 + 首屏可见核实)是最小范围内可补齐的完整性。**按 STOP 规则不再原地磨**——降到最小范围重写一次(不算同工件第 4 轮硬磨,是采纳评审的范围收敛)后做最后一次门;仍不过则实现 obvious 的轻触发+错峰(设计已捕获),不再纠结门。

---

## 第 4 轮(v4 最小范围)· gpt-5.6-sol · FAIL(4 blocker + 4 major)· **STOP 上限早过,停止过门**

**4 个 blocker 全在「错峰」(§2.2)深水区**:①跨时区——不同账号不同 tz 时「本地分钟互异」不保证真实时刻不撞(UTC 00:00=UTC+1 01:00);②槽位唯一只靠事务内查空闲、无 DB 约束 → 并发新增账号竞态(违 BR-02);③容量算法自相矛盾(固定槽 vs 缩 stride vs 回退,>240 号无解);④`setCollectionTime(accountId)` 缺 userId 属主/归档守卫(违 P-02 数据归属)。major:调度链路(node-cron tick/scheduledFor/补偿/幂等)未定义、runNow 补齐路径缺证据、settings 时区字段缺证据、回滚不一致。

**收敛结论(停止过门)**:
- **S1「绑号轻触发」4 轮零 blocker** —— 它只是「self.detail 从绑号初始化跑时跳过尾部重活 enqueue」,**不加表/不改数据归属/不改架构**,不属于「改方向/架构/数据归属」范畴,**本不需要重 spec-review gate**(gate 被触发是因原 SPEC 捆了队列+错峰)。→ **S1 可直接实现**(小、安全、解核心痛点:绑号不堆逐条重活、明细先于封面)。
- **错峰(S2)是真·跨时区调度子系统**(真实时刻冲突/并发分配/容量/DST/属主),**另立专门 SPEC** 做,别捆在这。
- **持久队列 + 排队可见(后续-A)** 亦独立 SPEC。

**按评审 STOP 规则:不再原地磨;拆分——S1 直接做,错峰/队列各自立 SPEC。**
