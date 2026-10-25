## 审核验收审计

审计日期：2026-10-25。只读审计锚点：`8f0245a5a7bd4c9829c2be43c90880444477c2c2`；原错误清单：`docs/verification/t1407/reconcile-quick-final-state.txt`。本节归档的是独立的控制面与验收证据审计，不是21项旧产品的新验收结果。仅本节获准写入；未修改产品、审核事件、BACKLOG或收据，未调用真实模型业务，未推送。

### 结论与最小闭环路线

现有 `reviewctl` 足够完成修复，不需要新增历史导入或lineage迁移引擎。16个错误snapshot均已找到与当前规范链末事件、BACKLOG收据一致的Git原件；其自收据哈希和绑定字段均已核对。先逐字归档外部分叉及被替换snapshot，再恢复这些原件，能够恢复真实旧收据之间的一致性。恢复不会产生新PASS，也不会使旧SPEC自动重新生效；之后必须针对当前实际漂移进行真实独立复审。

21项审核错误中，17项因已到第3轮或constitution变化需要现有单次新周期；T-707、T-694和T-652可在原周期做真实第3轮，其中T-652先用现有共享审核迁移命令。T-1072-owned-devices没有当前规范身份的历史事件，应保全外部T-1072来源，在新的任务专属snapshot路径下对当前身份做完整真实初审。不能拼接分叉链、复制旧PASS成当前初审、改写封存事件，或把已消费的旧授权重新当成可用权限。

用户本轮明确要求“把……没通过的验收都处理好，复验通过后再推送”，已经授权对这些明确不一致、漂移和验收缺口做正常维护；可由主会话据实登记精确typed DEC并使用现有工具，无须再次询问同一维护许可。typed DEC必须限定当前任务、旧末事件的SPEC/constitution完整SHA、明确变更ID、单次周期和全新nonce，并引用本轮原话及修复范围。它只授权重新审核，不代表用户同意旧产品新方向、接受旧缺陷或承认原FAIL已通过。

### 全量22项错误对照

下表“恢复后漂移”比较当前规范末事件绑定的原SPEC/constitution与当前文件；与外部分叉自己的hash是否一致不是同一问题。轮次为cycle/round。

| 序号 | 对象 | 原错误/直接原因 | 规范末轮 | 恢复后漂移 | 最小处理 |
| --- | --- | --- | --- | --- | --- |
| 1 | BACKLOG | RUNAWAY，原记录94.8KB，超过60KB失控线 | 不适用 | 不适用 | 保留任务身份与7列契约，机械归档、缩减详情后复验 |
| 2 | T-1369 | SPEC hash已漂移 | 1/3 PASS | SPEC | 恢复原件后真实新周期 |
| 3 | T-1255 | constitution hash已漂移 | 3/2 PASS | constitution | 恢复原件后真实新周期 |
| 4 | T-1072-owned-devices | 当前别名无event；外部原身份T-1072 | 无 | 身份/缺链 | 当前别名真实初审 |
| 5 | T-1021 | SPEC hash已漂移 | 1/3 PASS | SPEC | 恢复原件后真实新周期 |
| 6 | T-915 | receipt 692283b8bace → 外部 ad76cf555129 | 1/2 PASS | SPEC、constitution | 恢复原件后真实新周期 |
| 7 | T-859 | receipt 9895a91a63a8 → 外部 5818394813ca | 1/2 PASS | SPEC、constitution | 恢复原件后真实新周期 |
| 8 | T-858 | receipt 2521be715a0a → 外部 c76009a5586c | 1/3 PASS | SPEC、constitution | 恢复原件后真实新周期 |
| 9 | T-824 | receipt 18361dc8c3c3 → 外部 f0e215103ddf | 1/3 PASS | SPEC、constitution | 恢复原件后真实新周期 |
| 10 | T-819 | receipt 0425ab7b87b8 → 外部 a8879edf798f | 1/2 PASS | SPEC、constitution | 恢复原件后真实新周期 |
| 11 | T-816 | receipt fb03de3a57d7 → 外部 7896d566ccf8 | 1/2 PASS | SPEC、constitution | 恢复原件后真实新周期 |
| 12 | T-768 | receipt 3eb18966ea59 → 外部 64f8010b2045 | 1/3 PASS | SPEC、constitution | 恢复原件后真实新周期 |
| 13 | T-726 | receipt 2809820bf64a → 外部 39e3f41ca866 | 1/2 PASS | SPEC、constitution | 恢复原件后真实新周期 |
| 14 | T-707 | receipt 06867c4bf60c → 外部 87de34262527 | 1/2 PASS | SPEC | 恢复/迁移后现周期第3轮 |
| 15 | T-703 | receipt c1a3920aea71 → 外部 0662dafac8fa | 1/2 PASS | SPEC、constitution | 恢复原件后真实新周期 |
| 16 | T-691 | receipt 9444ca5b32a9 → 外部 2f2a131519e7 | 1/3 PASS | constitution | 恢复原件后真实新周期 |
| 17 | T-694 | receipt 2c7be136aea0 → 外部 171b7c9ad2f2 | 1/2 PASS | SPEC | 恢复/迁移后现周期第3轮 |
| 18 | T-656 | receipt 5f6970ac76f2 → 外部 bd8a6ac135f0 | 1/3 PASS | SPEC、constitution | 恢复原件后真实新周期 |
| 19 | T-652 | 共享snapshot被T-707占用，审核列待审 | 1/2 PASS | SPEC | 恢复/迁移后现周期第3轮 |
| 20 | T-645 | receipt 5dfe24b42eb7 → 外部 7ff0c3cb1906 | 1/3 PASS | SPEC、constitution | 恢复原件后真实新周期 |
| 21 | T-642 | receipt 7728c9ed44bd → 外部 9002b8dbeb4d | 1/3 CONCERNS | SPEC | 恢复原件后真实新周期 |
| 22 | T-635 | receipt b8add273a494 → 外部 84661017fde5 | 1/3 PASS | SPEC、constitution | 恢复原件后真实新周期 |

16项外部snapshot来自 `e4ec21a88027b78584e90720671adb0299f1de1e` 的真实历史。当前规范事件链388条，外部链136条，共同前缀91条，外部独有45条。直接拼接必然破坏哈希前驱；整体merge该历史还违背DEC-137503保全旧敏感祖先但不传播的明确决定。旧来源及 `docs/verification/t916-review-receipt-repair.md` 只能证明当时的审核工作，不能替代当前文件的复审。

以外部分叉自身为参照，T-858、824、819、816、768、726、707、694、652共9项SPEC/constitution仍与当前一致；另外8项还有源上漂移：T-915/T-859的AGENTS、T-703/T-691/T-656/T-645/T-635的PROJECT，及T-642的SPEC。即使源上仍一致，也不能把其不属于当前规范链的receipt直接填到BACKLOG；恢复规范原件并真实复审更小且保留了当前链。

### 可执行路径与权限边界

1. 从每项下方JSON的 `restore_commit` 读取 `review_path`，先归档当前外部文件原字节、SHA256、来源commit、原事件及原已消费cycle授权。用Git对象读取精确原件，核对 `canonical_receipt`、`event_hash`、cycle/round、全部SPEC/constitution路径和哈希，再原路径恢复。只恢复snapshot，不恢复旧产品或整段旧Git历史。T-1369/T-1255/T-1021当前snapshot本已属于规范链，不需从别处覆盖。
2. 对恢复后每项运行现有只读 `reviewctl context` 获取真正末轮、旧finding及行差异。独立评审当前SPEC和constitution；正常复审必须基于当前内容，不从旧PASS生成输入。
3. T-707/T-694/T-652的constitution未变、现规范仅第2轮，可正常recheck到第3轮。其余17项登记真实单次typed DEC后进行新周期完整initial。T-1369的DEC-136909已经记载真实精确授权，可按真实工具契约补齐绑定字段；不可捏造新用户答复。
4. 新复审输入使用严格 `spec-review-round/v2`，由独立会话实际产出findings，不自行填写verdict；由reviewctl推导。模型字段如实写继承宿主模型、具体型号未核实，不能冒称已独立核实其它模型。
5. 正常record成功后再audit、reconcile。reconcile quick只验证控制面，不等于full验证或真实UI验收；报告当前剩余错误和warnings，不把恢复旧snapshot称“旧产品全部通过”。

现有命令形态（占位符必须取本节JSON和本次真实评审产物；以下没有执行）：

```bash
node orchestrator/process/reviewctl.mjs context T-707 --backlog BACKLOG.md
node orchestrator/process/reviewctl.mjs record T-707 --spec <spec_path> --constitution <constitution_path> --input <真实recheck.json> --review <review_path> --backlog BACKLOG.md --review-mode homogeneous --model <实际独立性说明>
node orchestrator/process/reviewctl.mjs record T-915 --spec <spec_path> --constitution <constitution_path> --input <真实initial.json> --review <review_path> --backlog BACKLOG.md --review-mode homogeneous --model <实际独立性说明> --new-cycle <本次精确DEC> --change-ids <本次精确变更ID>
node orchestrator/process/reviewctl.mjs audit --backlog BACKLOG.md
```

`record`在已有链时先核旧snapshot/receipt一致；普通复审只容许SPEC变化，不容许constitution变化。新周期才允许两类hash变化，且必须消费精确typed capability；达到第3轮时，尚未关闭的finding ID必须逐项列入授权。工具没有通用历史import命令；`migrate-shared-review`仅解决多个合法任务共享同一SPEC的snapshot路径冲突，不能拿来伪造缺失事件或任意重命名身份。

当前唯一仍open的规范旧finding是T-642 `REV-002`：Project/promotion/reference先提交，初始output_script写入失败时可能留下缺右稿的项目，重试造成重复promotion或artifact version。这必须保留并交独立复审判断当前合同是否已经覆盖；如果仍未解决则继续CONCERNS。维护授权不等于用户同意接受这个业务半成功结果，也不允许凭“历史问题”直接销账。若需修改用户已确认的原子性/业务归属、降低旧验收阈值或接受未解决风险，则超出本轮控制维护范围，不能由typed DEC代替产品决定。

### T-652共享审核的现有工具路径

T-652与T-707共用 `docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md`。规范链分别有真实审核，不能把共享snapshot同时当作两者真相。当前相邻snapshot应恢复为T-707末事件；T-652已有任务专属文件来自外部历史，内容与e4ec源相同，应先逐字归档再从活动路径移开。BACKLOG中T-652文档列目前没有显式SPEC链接，必须按事实补上同一SPEC链接。之后运行：

```bash
node orchestrator/process/reviewctl.mjs migrate-shared-review T-652 --backlog BACKLOG.md
```

目标为 `docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.T-652.review.md`，命令要求目标不存在，并从规范真实末事件生成迁移快照和新receipt、引用原hash，不复制外部分叉PASS。迁移保留原cycle1/round2审核事实；再实际审当前SPEC进行第3轮。不能把T-652在 `73cd2e1a…` 中的旧相邻snapshot覆盖到T-707路径来“修”一项、破坏另一项。

### T-1072身份映射的最小路径

当前规范链既没有T-1072-owned-devices，也没有原T-1072事件；相邻legacy snapshot内部task_id是T-1072。外部真实原件在 `e8ec732c143615fa6d6dbaecc67e9aa57833a197`，原事件hash为 `0b5902901a901ff1e780f6e30ebd46d4ea7e0227b11a1e774bb11b08cf5c1a77`，原receipt为 `eb8de221287b`，原审核是初审。

归档原件、原task_id与现别名关系、原链来源；保留相邻legacy文件只读。对当前规范BACKLOG身份T-1072-owned-devices，使用从未占用的 `docs/features/t1072-owned-devices.T-1072-owned-devices.review.md` 做一次现在真实发生的完整独立initial，record时写当前别名。该初审不冒充重建旧T-1072，不回填历史发生时间，不宣称当前链拥有原批准，不通过改回T-1072撞上别的身份。

```bash
node orchestrator/process/reviewctl.mjs record T-1072-owned-devices --spec docs/features/t1072-owned-devices.md --constitution docs/产品定位.md --input <当前真实完整initial.json> --review docs/features/t1072-owned-devices.T-1072-owned-devices.review.md --backlog BACKLOG.md --review-mode homogeneous --model <实际独立性说明>
```

### BACKLOG RUNAWAY的处理限制

只读dry-run `node orchestrator/process/backlog-compact.mjs --all --squeeze --dry-run` 显示约95.1KB，机械归档9行只能减少约2.9KB，不能单独解决RUNAWAY。T-1171已记录旧5列暂停表的squeeze会使pmem漏143任务、context-compile误读；不得盲用这条输出直接改当前7列控制表。保留任务ID、状态、审核、验收、SPEC链接及7列结构；先归档真实已完成行，再按既有消费者可识别的格式外移长详情。不得删除未完成行、擅自完成旧任务或提高阈值。T-1171估算仅靠标题/摘要外移的最低约40.7KB，可能消除60KB错误但仍高于30KB硬限，必须分别报告，不能把“错误清除”写成“全部健康”。

### T-1405/T-1407真实UI验收缺口

`taskctl complete`对T-1407的实际拒绝见 `docs/verification/t1407/taskctl-complete-attempt.txt`：RESULT.md缺frontend-validation JSON block。T-1405/T-1407的待验列不能靠CLI RESULT销账；当前缺专门frontend journey contract、独立真实UI报告和对应可执行verify绑定。适用规则为 `orchestrator/process/rule-bundle/gates/10-frontend-validation-gate.md`，实现核验入口在 `orchestrator/process/taskctl.mjs:253`。

应按两份SPEC的真实范围补齐有限旅程：聊天引擎/模型来源设置、原合法组归属与可见回复/错误/恢复，及本机已安装版本实际流程；用真实浏览器/桌面、代表性非fixture数据、两个视口记录visible copy、postconditions及logic/surface/journey层证据，绑定当前HEAD、受监测路径洁净与精确contract SHA。CLI可作为后端读回，不能冒充UI。正式执行报告的verify_key必须映射现有配置命令，再运行：

```bash
node orchestrator/process/frontend-validation.mjs validate --execute --report <T1405真实报告> --task T-1405
node orchestrator/process/frontend-validation.mjs validate --execute --report <T1407真实报告> --task T-1407
```

通过后才由taskctl按真实报告完成；不能把验收列改为“—”、降低required level、添加恒真verify或补拍从未发生的前置RED/审核。全局reconcile的“journey receipts reconcile (or no UI receipts yet)”并不证明这些缺失旅程已执行。

### 原UX失败与本次证据边界

来源SPEC在独立旧工作树 `/Users/zyongzhu/.codex/worktrees/legacy-license-upgrade/Thirdspace-creator/docs/features/t1403-cos-ux-closure.md`；原任务授权和最终报告在 `/Users/zyongzhu/terminals/cos-ux-closure/prompt.md`、`REPORT.md`。这些FAIL不能被T-1407整合提交或本轮审核收据恢复洗成PASS：

| 原结果 | 实际证据与本轮要求 |
| --- | --- |
| 视频号正式报告失败 | collection-1858851c-156耗时144.721秒，EXPORT_FAILED、committedPages0、REPORT_SECTION_MISSING。需正式frame/post及真实wujie快照/归属可见性满足原合同；不能放宽安全检查来生成报告。公众号绑定成功不能替代视频号报告。 |
| 登录后原任务自动恢复失败 | exec_cc3ef01e-93b7-42d2-89b9-d76e5d83ea09 / job-0d742f83-1560仍waiting_user、FLYWHEEL_LOGIN_REQUIRED。onBound/bootstrap定向原子resume在来源报告仍属未实施提议；另起人工采集任务不能算自动恢复。 |
| 编辑器性能失败 | 1440视口10.262秒超过10秒，1024未执行；不能扣掉自动化开销或用后续热缓存结果替代原阈值。 |
| 平台切换性能失败 | 12次里7次超过2秒、最慢9.661秒；慢状态可见性通过不能证明延迟通过。 |
| 原导航3秒路径 | 原证据已通过，只保留其原有效范围。 |

T-1405/T-1407原范围保留这些独立旧FAIL，并未承诺整份来源任务全绿；用户最新要求处理没通过验收，可由主线程按当前明确关联范围继续修复、复验，但不能将21项历史收据的控制修复解释成无边界重做所有旧功能。若要处理上述旧UX失败，应在精确关联SPEC/任务中保留原FR、3/2/10秒阈值、1440与1024视口和原任务恢复身份，真实重跑来源旅程；现有入口 `docs/verification/t1403/control/verify-journey.mjs` 位于旧工作树。未复验的项继续写FAIL或未验，不假通过。

官方Pi的HTTP402只证明原官方任务返回该HTTP状态并进入等待，不能直接命名“余额不足”；最近resume结果由主线程另行取证。本节不调用模型、不新增重试、不改变原任务ID。全局22ERROR/17WARN是此锚点的真实旧结果；最终应重新运行所需Gate并报告新结果，不覆盖该旧回执。

### 逐项机械恢复与复审元数据

以下hash均为本次只读核验结果。当前文件hash是审计锚点的值；执行前须重新取hash，发生新漂移即重新核对。null恢复commit表示不需恢复外部snapshot；T-652的restore_commit仅定位其原共享历史，执行须采用上文任务专属迁移。旧finding中resolved仅表示规范历史审查状态，仍须按实际差异验证；T-642的open状态必须保留。

```json
{
  "schema": "acceptance-review-audit/v1",
  "audit_baseline": "8f0245a5a7bd4c9829c2be43c90880444477c2c2",
  "reviewer_independence": "继承宿主模型的独立同构会话；未核实具体模型型号",
  "mutations_authorized": "只写本报告审核验收审计部分",
  "no_product_acceptance_claim": true,
  "source_snapshot_commit": "e4ec21a88027b78584e90720671adb0299f1de1e",
  "canonical_event_count": 388,
  "foreign_event_count": 136,
  "common_prefix_events": 91,
  "foreign_only_events": 45,
  "items": [
    {
      "task_id": "T-1369",
      "backlog_review": "e8916b9b3f96",
      "canonical_event_exists": true,
      "event_hash": "756c3dda4c0952bbce08fa9fe03f533b5dfa87cd377fcd2d53796cb4a474c9d0",
      "cycle": 1,
      "round": 3,
      "spec_path": "docs/features/t1369-dashboard-filter-sidebar-navigation.md",
      "spec_sha256": "6f8114cc1f5fbc686abed00a695c4f2ffb8b33d389e47f964cf45d38d36078cb",
      "constitution_path": "orchestrator/SYSTEM_ARCHITECTURE.md",
      "constitution_sha256": "eb1826d4c09054df622d9718c38ca372bd19833e72bd1a752757631a5747c1df",
      "review_path": "docs/features/t1369-dashboard-filter-sidebar-navigation.review.md",
      "verdict": "PASS",
      "current_spec_sha256": "4f608dbb11ca3e269bef9a5d78351b5bec0fb09c636a513f2e69ccae718ad18a",
      "current_constitution_sha256": "eb1826d4c09054df622d9718c38ca372bd19833e72bd1a752757631a5747c1df",
      "canonical_spec_drift": true,
      "canonical_constitution_drift": false,
      "restore_commit": null,
      "old_findings": [],
      "needs_new_cycle": true,
      "canonical_receipt": "e8916b9b3f96",
      "observed_foreign_snapshot_receipt": null,
      "drift_type": "spec_drift",
      "next_review_kind": "initial_in_new_cycle"
    },
    {
      "task_id": "T-1255",
      "backlog_review": "7e54d5d28829",
      "canonical_event_exists": true,
      "event_hash": "7c0346dd5ad90710d66bd46e5c348c4cade4affacb3f7d57575dbdcfddafcf9a",
      "cycle": 3,
      "round": 2,
      "spec_path": "docs/features/t1255-reporting-full-delivery.md",
      "spec_sha256": "2323b2dd3404fb8de09d54592bcb75449899b828d06512cc7f2f9b286c6d3f6c",
      "constitution_path": "PROJECT.md",
      "constitution_sha256": "09ddad223f77418a2efc2d037f386542a2c121fe782427b00d0ece6ea3ac68f6",
      "review_path": "docs/features/t1255-reporting-full-delivery.review.md",
      "verdict": "PASS",
      "current_spec_sha256": "2323b2dd3404fb8de09d54592bcb75449899b828d06512cc7f2f9b286c6d3f6c",
      "current_constitution_sha256": "e9085d32d6f91bbe1a251b502aeede8c338e95c87c9f809155c159b8b1b0ab13",
      "canonical_spec_drift": false,
      "canonical_constitution_drift": true,
      "restore_commit": null,
      "old_findings": [],
      "needs_new_cycle": true,
      "canonical_receipt": "7e54d5d28829",
      "observed_foreign_snapshot_receipt": null,
      "drift_type": "constitution_drift",
      "next_review_kind": "initial_in_new_cycle"
    },
    {
      "task_id": "T-1072-owned-devices",
      "backlog_review": "eb8de221287b",
      "canonical_event_exists": false,
      "source_task_id": "T-1072",
      "source_event_hash": "0b5902901a901ff1e780f6e30ebd46d4ea7e0227b11a1e774bb11b08cf5c1a77",
      "source_commit": "e8ec732c143615fa6d6dbaecc67e9aa57833a197",
      "spec_path": "docs/features/t1072-owned-devices.md",
      "constitution_path": "docs/产品定位.md",
      "source_review_path": "docs/features/t1072-owned-devices.review.md",
      "proposed_review_path": "docs/features/t1072-owned-devices.T-1072-owned-devices.review.md",
      "new_canonical_record_kind": "initial after actual independent full review; not a copied historical PASS",
      "canonical_receipt": null,
      "observed_foreign_snapshot_receipt": null,
      "drift_type": "identity_alias_and_missing_canonical_event",
      "next_review_kind": "initial"
    },
    {
      "task_id": "T-1021",
      "backlog_review": "f0f3fa0ff91b",
      "canonical_event_exists": true,
      "event_hash": "494552bf33ddd0e33bf270593b04388011dafa538f516a799a282db5926c4ac4",
      "cycle": 1,
      "round": 3,
      "spec_path": "docs/features/t1021-cover-template-library.md",
      "spec_sha256": "242b25c4f83f4030a8d9746e16754bc985a22eab91078f4e1ed6a9eb65b6a8c3",
      "constitution_path": "docs/产品定位.md",
      "constitution_sha256": "86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800",
      "review_path": "docs/features/t1021-cover-template-library.review.md",
      "verdict": "PASS",
      "current_spec_sha256": "1ca8392b4d5ea2ecb6288aef8284578164938ba2a5d648c3fa05a5e9606b83ad",
      "current_constitution_sha256": "86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800",
      "canonical_spec_drift": true,
      "canonical_constitution_drift": false,
      "restore_commit": null,
      "old_findings": [
        {
          "id": "REV-001",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "SPEC 承诺 visual.carousel 的单页重试、配文编辑回读和最终采纳，但操作表只绑定现有封面生成与单图采纳。缺少稳定页 ID、逐页状态、配文修改保存操作、原任务重试操作、整套笔记采纳业务归属；现有 generated_asset 采纳只物化单图，不能证明配文与页序刷新后保留。"
        },
        {
          "id": "REV-002",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "真人必须使用身份图与通用缺图仅提示词降级相冲突，未规定不选号模板时如何明确模式，未冻结身份图必填边界。正式 execution-cover.service 已有参考读取失败 catch 为 null 并转 image.generate 路径，可能生成陌生人。"
        }
      ],
      "needs_new_cycle": true,
      "canonical_receipt": "f0f3fa0ff91b",
      "observed_foreign_snapshot_receipt": null,
      "drift_type": "spec_drift",
      "next_review_kind": "initial_in_new_cycle"
    },
    {
      "task_id": "T-915",
      "backlog_review": "692283b8bace",
      "canonical_event_exists": true,
      "event_hash": "1d0f281764a2d94f245bbaedad518a9d89ad8fc824c531ba04bf5609a747b93b",
      "cycle": 1,
      "round": 2,
      "spec_path": "docs/superpowers/specs/2026-09-04-agent-runtime-refactor.md",
      "spec_sha256": "b990a38a015698105d29d2da0cada4767b3be4bd09948cc5ef147621fb98d8ce",
      "constitution_path": "AGENTS.md",
      "constitution_sha256": "ab6003112be4c5b680fba05abf8326eaf59eeafd1613b4ca44464ef3d0cff126",
      "review_path": "docs/superpowers/specs/2026-09-04-agent-runtime-refactor.review.md",
      "verdict": "PASS",
      "current_spec_sha256": "b8282e2c286a9e0ffa757264667e724bcc20457e355b08487d8c08e1011811d9",
      "current_constitution_sha256": "966350c9181a8b4cd32d03cab4d4516b3c79f9af39f950576ac3e058e0a29f27",
      "canonical_spec_drift": true,
      "canonical_constitution_drift": true,
      "restore_commit": "51ed266eae26d50f46239dfb863b2e887309075e",
      "old_findings": [
        {
          "id": "REV-001",
          "status": "resolved",
          "severity": "minor",
          "failure_mode": "R-05 要求只有诊断且无业务结果时为 failed/blocked，但 blocked 不在 R-01 新状态枚举中。当前持久任务服务已有 blocked 状态；迁移实现可能继续写入未定义的新状态，或将登录等待等可恢复阻断误投影为不可恢复失败。"
        },
        {
          "id": "REV-002",
          "status": "resolved",
          "severity": "minor",
          "failure_mode": "SPEC 明确保留暂停能力，但验收仅覆盖取消、崩溃和检查点恢复，未检查 pause_requested 期间是否禁止新调用、如何收敛在途调用，以及 resume 是否保留累计预算与已完成事实。实现可通过现有 AC 而丢失用户已确认的暂停行为。"
        }
      ],
      "needs_new_cycle": true,
      "restorable_receipt": "692283b8bace",
      "restorable_event_hash_matches": true,
      "canonical_receipt": "692283b8bace",
      "observed_foreign_snapshot_receipt": "ad76cf555129",
      "drift_type": "foreign_snapshot_then_spec_drift_constitution_drift",
      "next_review_kind": "initial_in_new_cycle"
    },
    {
      "task_id": "T-859",
      "backlog_review": "9895a91a63a8",
      "canonical_event_exists": true,
      "event_hash": "db0d70797f340d98150f2e44928f4c5ea3e4b2a74bd750d340c4a161d4e032ee",
      "cycle": 1,
      "round": 2,
      "spec_path": "docs/superpowers/specs/2026-08-16-portrait-material-pip-smooth-transition.md",
      "spec_sha256": "e6fe3ad73fa90859a3850b09e4ffd11fd82efdc1da7e1ee27899839d045981c5",
      "constitution_path": "AGENTS.md",
      "constitution_sha256": "e84f83b7e65a415ba7a2a4639188bc2fd2d682f42d3220107a119abdc39d2a77",
      "review_path": "docs/superpowers/specs/2026-08-16-portrait-material-pip-smooth-transition.review.md",
      "verdict": "PASS",
      "current_spec_sha256": "e5be057cd6751965e3f6827fa5529c9fc93c599624eab18443188c55597210f5",
      "current_constitution_sha256": "966350c9181a8b4cd32d03cab4d4516b3c79f9af39f950576ac3e058e0a29f27",
      "canonical_spec_drift": true,
      "canonical_constitution_drift": true,
      "restore_commit": "fdd6d7ab123413a1954085e5a51e25e89671277b",
      "old_findings": [],
      "needs_new_cycle": true,
      "restorable_receipt": "9895a91a63a8",
      "restorable_event_hash_matches": true,
      "canonical_receipt": "9895a91a63a8",
      "observed_foreign_snapshot_receipt": "5818394813ca",
      "drift_type": "foreign_snapshot_then_spec_drift_constitution_drift",
      "next_review_kind": "initial_in_new_cycle"
    },
    {
      "task_id": "T-858",
      "backlog_review": "2521be715a0a",
      "canonical_event_exists": true,
      "event_hash": "3d2ef5ac0db0ab1c0a7d0e31d15ff3eb4f8a59038d2abd6d42298c0f620c0483",
      "cycle": 1,
      "round": 3,
      "spec_path": "docs/superpowers/specs/2026-08-16-video-direction-stage-and-caption-emphasis.md",
      "spec_sha256": "ab768b979e62ab63199ee8d1014c993dcac7f51dfa92f15e627dacb33b2ceed1",
      "constitution_path": "orchestrator/SYSTEM_ARCHITECTURE.md",
      "constitution_sha256": "871570cc600267be82e2e1fbfa79d730fc51121810b8de262c5a49c876029b66",
      "review_path": "docs/superpowers/specs/2026-08-16-video-direction-stage-and-caption-emphasis.review.md",
      "verdict": "PASS",
      "current_spec_sha256": "65055af6914c4f7475ab2846913d815c2cb03843a2e2a612b63f6f898745098b",
      "current_constitution_sha256": "eb1826d4c09054df622d9718c38ca372bd19833e72bd1a752757631a5747c1df",
      "canonical_spec_drift": true,
      "canonical_constitution_drift": true,
      "restore_commit": "fdd6d7ab123413a1954085e5a51e25e89671277b",
      "old_findings": [
        {
          "id": "REV-001",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "模型为每一行返回空 `emphasis` 数组时，输出满足 schema，runner 也没有任何项可判无效而会原样通过；renderer 因而产出没有重点词的短样片，直接不满足 AC-858-3。由于 runner 被禁止重写或猜测重点词，当前失败与恢复规则也没有让该次正式决策链获得可验收强调的路径。"
        },
        {
          "id": "REV-002",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "两个 beat 可以分别携带完整 `subject`，其时间窗重叠，但 schema 没有辅助/主视觉角色字段，§3.2 也未定义如何由已有字段判定“辅助”。一个合理实现会把两个对象同时渲染，另一个会按数组顺序覆盖其中一个；两者都可能将重叠项解释为辅助，却产生不同用户可见交接，且前者违反 AC-858-4。"
        },
        {
          "id": "REV-003",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "AI 明确选择辅助 overlay 时，正式候选被迫把它声明为 takeover；模板却不会以不透明全画布层盖住人物，overlay 可与人物或既有视觉同时出现。若把该 beat 当主视觉，违反“takeover 期间人物不可见”；若按现有模板当辅助显示，则 direction 的唯一主视觉合同没有被执行。"
        }
      ],
      "needs_new_cycle": true,
      "restorable_receipt": "2521be715a0a",
      "restorable_event_hash_matches": true,
      "canonical_receipt": "2521be715a0a",
      "observed_foreign_snapshot_receipt": "c76009a5586c",
      "drift_type": "foreign_snapshot_then_spec_drift_constitution_drift",
      "next_review_kind": "initial_in_new_cycle"
    },
    {
      "task_id": "T-824",
      "backlog_review": "18361dc8c3c3",
      "canonical_event_exists": true,
      "event_hash": "b5c6f08f45f868c62dc5f790155cbcf1a73a8d683e2b543765cac09b2b8a7fbb",
      "cycle": 1,
      "round": 3,
      "spec_path": "docs/superpowers/specs/2026-08-13-continuous-voiceover-storyboard-pipeline.md",
      "spec_sha256": "58355a1e3ae9f12a57279dfb67ba05d7e950b2aec1f3284aecaf8764339950c6",
      "constitution_path": "orchestrator/SYSTEM_ARCHITECTURE.md",
      "constitution_sha256": "871570cc600267be82e2e1fbfa79d730fc51121810b8de262c5a49c876029b66",
      "review_path": "docs/superpowers/specs/2026-08-13-continuous-voiceover-storyboard-pipeline.review.md",
      "verdict": "PASS",
      "current_spec_sha256": "192b82d1165b95deb86983129be8d5683db1c60f6032ec1990798768e4e753d9",
      "current_constitution_sha256": "eb1826d4c09054df622d9718c38ca372bd19833e72bd1a752757631a5747c1df",
      "canonical_spec_drift": true,
      "canonical_constitution_drift": true,
      "restore_commit": "5c3be5d18b1af36916466aaa0c13fbe79cd14c50",
      "old_findings": [
        {
          "id": "REV-001",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "规格只要求任务创建时冻结三份 Skill snapshot，并要求 runner 计算 hash、日志记录摘要，但没有规定在第一阶段成功后把冻结口播、hash、阶段完成状态及第二阶段重做次数持久到可恢复的任务状态。worker 在第二阶段 provider 失败、超时、崩溃或既有任务重试后，合理实现可从整个任务入口重新执行第一阶段，造成已成功口播重复调用、重复计费，并违反 AC-5；或因内存中的冻结口播丢失而无法合法只重做第二阶段。"
        }
      ],
      "needs_new_cycle": true,
      "restorable_receipt": "18361dc8c3c3",
      "restorable_event_hash_matches": true,
      "canonical_receipt": "18361dc8c3c3",
      "observed_foreign_snapshot_receipt": "f0e215103ddf",
      "drift_type": "foreign_snapshot_then_spec_drift_constitution_drift",
      "next_review_kind": "initial_in_new_cycle"
    },
    {
      "task_id": "T-819",
      "backlog_review": "0425ab7b87b8",
      "canonical_event_exists": true,
      "event_hash": "8cb26b1e42d23810b7e58fd06fb5f9aff100fa7d04944f4a3ca569306f125ae7",
      "cycle": 1,
      "round": 2,
      "spec_path": "docs/superpowers/specs/2026-08-13-natural-language-current-script-section-editing.md",
      "spec_sha256": "d89d457083d1d2d0dd132429b3f65b8a8470f3feca2f44284080833b4754eecb",
      "constitution_path": "orchestrator/SYSTEM_ARCHITECTURE.md",
      "constitution_sha256": "871570cc600267be82e2e1fbfa79d730fc51121810b8de262c5a49c876029b66",
      "review_path": "docs/superpowers/specs/2026-08-13-natural-language-current-script-section-editing.review.md",
      "verdict": "PASS",
      "current_spec_sha256": "b3f5b662689736181ccda4753f68d020c13954008318dc189c9ef309aebf09f8",
      "current_constitution_sha256": "eb1826d4c09054df622d9718c38ca372bd19833e72bd1a752757631a5747c1df",
      "canonical_spec_drift": true,
      "canonical_constitution_drift": true,
      "restore_commit": "b79e65908db0c2a531e6ec12f686e741fa606537",
      "old_findings": [
        {
          "id": "REV-001",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "历史版本存在多个缺失或重复段落 ID 时，按 §3 派生并在成功补丁后持久化规范 ID，会写入目标段之外的每个缺失/重复 ID 段落；这些段落的持久化字节随之改变。若不持久化则违反 FR-3，若持久化则违反 AC-6，因此同一用户采纳路径无法同时满足两项已确认结果。"
        }
      ],
      "needs_new_cycle": true,
      "restorable_receipt": "0425ab7b87b8",
      "restorable_event_hash_matches": true,
      "canonical_receipt": "0425ab7b87b8",
      "observed_foreign_snapshot_receipt": "a8879edf798f",
      "drift_type": "foreign_snapshot_then_spec_drift_constitution_drift",
      "next_review_kind": "initial_in_new_cycle"
    },
    {
      "task_id": "T-816",
      "backlog_review": "fb03de3a57d7",
      "canonical_event_exists": true,
      "event_hash": "04c7690bb634dad41e3a4a910e2bec60e686ccea618c7ebb9f23ed3e648d3f31",
      "cycle": 1,
      "round": 2,
      "spec_path": "docs/superpowers/specs/2026-08-13-current-script-truth-and-natural-language-section-editing.md",
      "spec_sha256": "b9490f4fac3f5f00ff1c32d26609e48d82b94b615ab3580f0b0d2a5df955548d",
      "constitution_path": "orchestrator/SYSTEM_ARCHITECTURE.md",
      "constitution_sha256": "871570cc600267be82e2e1fbfa79d730fc51121810b8de262c5a49c876029b66",
      "review_path": "docs/superpowers/specs/2026-08-13-current-script-truth-and-natural-language-section-editing.review.md",
      "verdict": "PASS",
      "current_spec_sha256": "76f70923f3e92a895a3f43beb741c767139bc5afcd4010b00339dd3aa10b47b3",
      "current_constitution_sha256": "eb1826d4c09054df622d9718c38ca372bd19833e72bd1a752757631a5747c1df",
      "canonical_spec_drift": true,
      "canonical_constitution_drift": true,
      "restore_commit": "b79e65908db0c2a531e6ec12f686e741fa606537",
      "old_findings": [
        {
          "id": "REV-001",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "实现者按该句让 frontend 直接依赖 backend service port，会绕过架构规定的 contract/RPC 边界；同时当前边界扫描只明确执行 R1–R3，因而该实现仍可能通过现有扫描，却不满足已确认的物理架构和 AC-8 的边界验收。"
        },
        {
          "id": "REV-002",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "规格要求 sectionRef“稳定”且在执行时必须属于重新读取的当前版本，但没有规定其来自何处、如何持久化或如何在同一 currentVersionId 的两次读取间确定性重建。合理实现可在每次快照读取时临时按序号或生成 UUID；模型提交的 sectionRef 随后在执行重读中即不再存在，导致本应唯一命中的“改第 7 段”无法产生候选，或错误映射到另一段。"
        }
      ],
      "needs_new_cycle": true,
      "restorable_receipt": "fb03de3a57d7",
      "restorable_event_hash_matches": true,
      "canonical_receipt": "fb03de3a57d7",
      "observed_foreign_snapshot_receipt": "7896d566ccf8",
      "drift_type": "foreign_snapshot_then_spec_drift_constitution_drift",
      "next_review_kind": "initial_in_new_cycle"
    },
    {
      "task_id": "T-768",
      "backlog_review": "3eb18966ea59",
      "canonical_event_exists": true,
      "event_hash": "6f21488e33ccbc81b3509df64e19defa20bde96b1d80d677474b1cb12a7534e8",
      "cycle": 1,
      "round": 3,
      "spec_path": "docs/superpowers/specs/2026-08-11-asr-universal-local-fallback.md",
      "spec_sha256": "f0771cc886f5f56646b8431bf2e939952ecaa7297a05c0b888e23f7ffdb4fec2",
      "constitution_path": "orchestrator/SYSTEM_ARCHITECTURE.md",
      "constitution_sha256": "871570cc600267be82e2e1fbfa79d730fc51121810b8de262c5a49c876029b66",
      "review_path": "docs/superpowers/specs/2026-08-11-asr-universal-local-fallback.review.md",
      "verdict": "PASS",
      "current_spec_sha256": "7b662918812be8cad4a05bee49ce23682164b26283f3e2721da6d337fcb2339b",
      "current_constitution_sha256": "eb1826d4c09054df622d9718c38ca372bd19833e72bd1a752757631a5747c1df",
      "canonical_spec_drift": true,
      "canonical_constitution_drift": true,
      "restore_commit": "63d5d04560d70ec404efc3168dd278c3715ca1c1",
      "old_findings": [
        {
          "id": "REV-001",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "在线 adapter 返回 text 字段但为空白时，它不是异常；当前 wrapper 只捕获 invoke 抛出的异常，而批处理和复用调用点在 wrapper 返回后才判空。因此一个在线空逐字稿可直接成为失败/空结果，而不消耗唯一的一次本地 Whisper 尝试。"
        },
        {
          "id": "REV-002",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "当前回退 wrapper 只返回转写结果 T，不返回实际执行的 spec/mode；调用方可在调用前保存 online spec 的 observableModel。在线失败、本地成功后，intelligence 路径会把 channel-managed 写入 asr 完成日志及返回的 provider/model，因而 AC-768-03 的真实文本和成功终态可以成立，同时违反“不得把本地成功记成云端成功”。"
        },
        {
          "id": "REV-003",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "“原样”可被实现为把本地 ffmpeg/ONNX/worker 异常正文写入任务失败或步骤；现有本地 adapter 会把 ffmpeg 路径、stderr 或模型加载异常拼进 Error.message，而批处理会将该 message 写入用户可见任务文本。这样既暴露内部错误结构，也会使同一失败在不同平台呈现不稳定的非本地化终态。"
        }
      ],
      "needs_new_cycle": true,
      "restorable_receipt": "3eb18966ea59",
      "restorable_event_hash_matches": true,
      "canonical_receipt": "3eb18966ea59",
      "observed_foreign_snapshot_receipt": "64f8010b2045",
      "drift_type": "foreign_snapshot_then_spec_drift_constitution_drift",
      "next_review_kind": "initial_in_new_cycle"
    },
    {
      "task_id": "T-726",
      "backlog_review": "2809820bf64a",
      "canonical_event_exists": true,
      "event_hash": "219feb0c4ff34b741ada21bc2d96a773bb9bfb824d2414bc41808cc516d49c34",
      "cycle": 1,
      "round": 2,
      "spec_path": "docs/superpowers/specs/2026-08-08-thesis-skeleton-retirement.md",
      "spec_sha256": "7e2e8d6b672ee2cea8f84c346ac23373f2fb15069bd8f32ab560370687b3e7c1",
      "constitution_path": "orchestrator/SYSTEM_ARCHITECTURE.md",
      "constitution_sha256": "871570cc600267be82e2e1fbfa79d730fc51121810b8de262c5a49c876029b66",
      "review_path": "docs/superpowers/specs/2026-08-08-thesis-skeleton-retirement.review.md",
      "verdict": "PASS",
      "current_spec_sha256": "4e03ba1b4410acafaf062a92574100f3b8f8ee92675d263998fc231d2d299aa7",
      "current_constitution_sha256": "eb1826d4c09054df622d9718c38ca372bd19833e72bd1a752757631a5747c1df",
      "canonical_spec_drift": true,
      "canonical_constitution_drift": true,
      "restore_commit": "cea33354718dc86c021b19eca8b5131149c87df8",
      "old_findings": [
        {
          "id": "REV-001",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "实现可以让旧 `planning.thesis` 入口和候选确认都 fail closed，从而通过 AC-726-02，同时仍由项目重建为变更后新项目物化 `thesis_tree`。这会造成用户看不见的新增 artifact/version 写入，直接违背“停止所有新写入”。"
        },
        {
          "id": "REV-002",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "AC-726-03 只执行 script context/runner。实现可以仅在该路径清空 `thesisBrief`，而 `planning.contract` 或 `planning.outline` 仍读取历史树并把它注入新结果；现有 AC 仍会通过，违反隐藏消费必须全部断开的用户结果。"
        },
        {
          "id": "REV-003",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "AC-726-04 没有把“新 B-roll inventory”绑定到两个独立消费者，且其共享素材同时属于 `materialLinks`，无法证明脚本明确点名但未进入 materialLinks 的素材仍被保留。实现可只修一个消费者或只保留项目用料链，仍通过该用例，却让另一个消费者继续隐藏读取 thesis refs 或丢失脚本点名素材。"
        }
      ],
      "needs_new_cycle": true,
      "restorable_receipt": "2809820bf64a",
      "restorable_event_hash_matches": true,
      "canonical_receipt": "2809820bf64a",
      "observed_foreign_snapshot_receipt": "39e3f41ca866",
      "drift_type": "foreign_snapshot_then_spec_drift_constitution_drift",
      "next_review_kind": "initial_in_new_cycle"
    },
    {
      "task_id": "T-707",
      "backlog_review": "06867c4bf60c",
      "canonical_event_exists": true,
      "event_hash": "69e8c24ad9a20bc47acd3b492a528477621d9c301080008ed93dd2bc6c909f11",
      "cycle": 1,
      "round": 2,
      "spec_path": "docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md",
      "spec_sha256": "381393efb2d2f63029b4d6df27522836b5bcbb7205429b9df13ccbd6d96f513e",
      "constitution_path": "docs/产品定位.md",
      "constitution_sha256": "86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800",
      "review_path": "docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.review.md",
      "verdict": "PASS",
      "current_spec_sha256": "95911e86fb467094feff7b2bd997d1b9ce2bd2e1cbe9dedc4862517ae5f7bdea",
      "current_constitution_sha256": "86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800",
      "canonical_spec_drift": true,
      "canonical_constitution_drift": false,
      "restore_commit": "cea33354718dc86c021b19eca8b5131149c87df8",
      "old_findings": [
        {
          "id": "REV-001",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "固定顺序把“没有可用逐字稿 -> 准备证据”置于“用户要求生成 -> 立即生成候选”之前。零逐字稿时，合理实现可能持续返回 PREPARE_EVIDENCE，而不进入 DRAFT_NOW，导致用户明确要求生成仍被证据准备拦截。"
        },
        {
          "id": "REV-002",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "第 4.5 节允许人群字段缺失时标记为待验证并先生成、采纳，第 8 节却要求每张方向卡都包含产品/服务及核心、高潜人群，第 12 节 AC-20 又要求至少形成完整核心人群。合理实现可能因此拒绝采纳信息不完整或纯人设候选，或者为通过验收而编造产品、高潜人群及未确认的场景字段；另一实现则允许空值，却无法满足 AC-20。"
        }
      ],
      "needs_new_cycle": false,
      "restorable_receipt": "06867c4bf60c",
      "restorable_event_hash_matches": true,
      "canonical_receipt": "06867c4bf60c",
      "observed_foreign_snapshot_receipt": "87de34262527",
      "drift_type": "foreign_snapshot_then_spec_drift",
      "next_review_kind": "recheck_in_existing_cycle"
    },
    {
      "task_id": "T-703",
      "backlog_review": "c1a3920aea71",
      "canonical_event_exists": true,
      "event_hash": "dc0a4a6a07946faf04ccca3c50bbbe2d3db6e0a2a699eb17def80f0feaadbb3f",
      "cycle": 1,
      "round": 2,
      "spec_path": "docs/superpowers/specs/2026-08-05-video-production-editing-loop.md",
      "spec_sha256": "70e49d3ae5a3e418fad77e80fa0a61054c42de5c0634cc20881cfd7a4f005320",
      "constitution_path": "PROJECT.md",
      "constitution_sha256": "2afb9684d1ef531f56c5def2185c6cc7086c00aa3105bff0ce87fc5c81fc5fad",
      "review_path": "docs/superpowers/specs/2026-08-05-video-production-editing-loop.review.md",
      "verdict": "PASS",
      "current_spec_sha256": "1624f50bb9f70d475bec8c633a7cc6f46d0d94f8fe4e01ecf6abfced36420460",
      "current_constitution_sha256": "e9085d32d6f91bbe1a251b502aeede8c338e95c87c9f809155c159b8b1b0ab13",
      "canonical_spec_drift": true,
      "canonical_constitution_drift": true,
      "restore_commit": "cea33354718dc86c021b19eca8b5131149c87df8",
      "old_findings": [
        {
          "id": "REV-001",
          "status": "resolved",
          "severity": "blocker",
          "failure_mode": "现有 outputs.production.put 接收完整 recordingConfig，repository 也直接替换整块 JSON，没有 namespaced 原子合并或版本前置条件；客户端即使先读后合并再 PUT，也可能被并发或滞后的录制配置写入覆盖，导致已确认方案刷新后消失，或反向覆盖现有录制配置。现有确认流程还会先创建 video.render，再把 Production 记账作为 best-effort 执行，因此合理实现可以让渲染继续而确认方案未持久化，直接破坏回顾与 Copilot 同源读取。"
        },
        {
          "id": "REV-002",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "SPEC 没有定义 Copilot 调整工具的输入、候选输出、确认身份、基准 plan/task 版本或确认后的更新与重跑结果。现有 ALL_CHAT_TOOL_NAMES 没有视频剪辑调整工具；现有“按意见重跑”只是把 retryFeedback 附加到原 execution spec，而 videoRenderParams 只解析 props，executor 继续使用原 props。合理实现可以展示一个看似真实的重跑动作却原样重渲染，或者绕过候选确认直接更新 Production，二者都会失败 AC-703-6 或违反 AI 不直接写库。"
        },
        {
          "id": "REV-003",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "AC-703-5 只验证合法任务的成功播放，没有验证跨账号、跨项目、非 manifest 路径、目录穿越或 symlink、非 video artifact、非 awaiting_confirmation 状态及丢弃后的失效；SPEC 也未固定 route 如何选择 task/artifact、如何从 RequestContext 派生归属以及缓存如何服从失效。实现可以通过成功路径测试，同时泄露其他项目沙箱文件或让已丢弃 URL 继续从缓存播放。"
        },
        {
          "id": "REV-004",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "SPEC 只规定段数不一致时进行文本匹配，却没有规定权威文本字段、规范化方式、命中阈值、并列判定或一段与多场的映射约束；AC-703-1 只覆盖可按序号映射的第 2 段。面对多个场景都包含相同关键词时，两个合理的“确定性”实现可分别选中不同场景，或一个补入、另一个判未采用，产生不同的用户可见时间线且都能通过当前 AC。"
        }
      ],
      "needs_new_cycle": true,
      "restorable_receipt": "c1a3920aea71",
      "restorable_event_hash_matches": true,
      "canonical_receipt": "c1a3920aea71",
      "observed_foreign_snapshot_receipt": "0662dafac8fa",
      "drift_type": "foreign_snapshot_then_spec_drift_constitution_drift",
      "next_review_kind": "initial_in_new_cycle"
    },
    {
      "task_id": "T-691",
      "backlog_review": "9444ca5b32a9",
      "canonical_event_exists": true,
      "event_hash": "e62296d83312eee0744b534c47ac4d9b4a68c0e530bda40972a27985a932036b",
      "cycle": 1,
      "round": 3,
      "spec_path": "docs/superpowers/specs/2026-08-04-copilot-project-lifecycle-tool-closure.md",
      "spec_sha256": "a4a57d75e372b01db3c0880f6791b98971a98d0abb44a3b29c07c1723752e232",
      "constitution_path": "PROJECT.md",
      "constitution_sha256": "6a04d0b0fa6c123f7990f02685afeed38858494cc2501ec4bfbc742050ab97fd",
      "review_path": "docs/superpowers/specs/2026-08-04-copilot-project-lifecycle-tool-closure.review.md",
      "verdict": "PASS",
      "current_spec_sha256": "a4a57d75e372b01db3c0880f6791b98971a98d0abb44a3b29c07c1723752e232",
      "current_constitution_sha256": "e9085d32d6f91bbe1a251b502aeede8c338e95c87c9f809155c159b8b1b0ab13",
      "canonical_spec_drift": false,
      "canonical_constitution_drift": true,
      "restore_commit": "cea33354718dc86c021b19eca8b5131149c87df8",
      "old_findings": [
        {
          "id": "REV-001",
          "status": "resolved",
          "severity": "blocker",
          "failure_mode": "SPEC 没有规定授权证明由谁签发、如何绑定 user/project/report/finding/version/当前轮次、是否一次性及如何防重放。若工具参数中的任意字符串即可充当 confirmationToken，模型可自行构造证明并直接触发写入；若仅把用户先前的自然语言视为证明，也无法确定显示建议后的最终确认是否真实发生。"
        },
        {
          "id": "REV-002",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "现有 L1/L2 finding 资源没有统一稳定 finding ID，报告也只有 artifactVersion 数字而没有 artifactVersionId；SPEC 的新读取输出仅写“结构化 findings”，未要求补齐可回传的 findingId。与此同时，批量合并没有规定重复 quote、重叠命中、同一 quote 多次出现、无 suggestion、quote 已不存在以及 contentText/contentData 同步时的唯一处理顺序。两个合理实现可能选择不同命中位置或覆盖次序，导致选错建议、静默漏改、结构化正文与纯文本分叉，仍可能各自声称完成 AC-6。"
        },
        {
          "id": "REV-003",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "生命周期输出逐项规定了 project、artifacts、creative、materials、cover、publication、metrics、reviews 和 retrospective，却没有 brief 字段、brief 指针或 brief 的 completeness 项。实现即使完全满足当前“输出至少包含”清单，也可以不返回 brief，从而直接失败 AC-3。"
        },
        {
          "id": "REV-004",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "正文允许账号不一致时自动纠正或返回错误两种结果，但 AC-2 唯一要求返回 ACCOUNT_CONTEXT_MISMATCH。实现若选择自动纠正会符合 §6 却必然失败 AC-2；不同实现还可能分别以 header、Cookie 或本地值为准，产生不同的用户可见项目数据。"
        }
      ],
      "needs_new_cycle": true,
      "restorable_receipt": "9444ca5b32a9",
      "restorable_event_hash_matches": true,
      "canonical_receipt": "9444ca5b32a9",
      "observed_foreign_snapshot_receipt": "2f2a131519e7",
      "drift_type": "foreign_snapshot_then_constitution_drift",
      "next_review_kind": "initial_in_new_cycle"
    },
    {
      "task_id": "T-694",
      "backlog_review": "2c7be136aea0",
      "canonical_event_exists": true,
      "event_hash": "3be70a1c76dd2fe118734970f8d2b32da04195588a131263e1435adf0b6ee10b",
      "cycle": 1,
      "round": 2,
      "spec_path": "docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md",
      "spec_sha256": "6ea31e784c68e7498c99f4bfd89f8231d3d4e545c345127acd6eeee961a3192b",
      "constitution_path": "docs/产品定位.md",
      "constitution_sha256": "86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800",
      "review_path": "docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.review.md",
      "verdict": "PASS",
      "current_spec_sha256": "bc30c20b81ec2878318b516384c23d76bc3bec396d0beb23ce0dc1d5e374cddb",
      "current_constitution_sha256": "86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800",
      "canonical_spec_drift": true,
      "canonical_constitution_drift": false,
      "restore_commit": "cea33354718dc86c021b19eca8b5131149c87df8",
      "old_findings": [
        {
          "id": "REV-001",
          "status": "resolved",
          "severity": "blocker",
          "failure_mode": "SPEC 未定义客户端初始信任的 root 公钥/指纹、其与 PackageIdentity 的不可变绑定，或 root 与 Tauri updater key 的独立性。合理实现可以从 package latest/keyset 获取 root 或复用 updater key；此时 CDN 或 updater 私钥失陷即可同时替换验证根与 envelope，无法证明 AC 要求的拒绝行为。"
        },
        {
          "id": "REV-002",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "runtime-only 路径直接进入 ReadyToRestart，未下载 Tauri artifact，但 §6.2 又要求 envelope root signature 与 Tauri artifact signature 均有效才允许安装。组合更新中 runtime 已进入 Pending 后再下载 shell，状态机没有 shell 下载或安装失败的转移，也未把 pending runtime 与所需 shell/protocol 绑定；重启时实现可能激活与旧 shell 不兼容的 pending runtime。"
        }
      ],
      "needs_new_cycle": false,
      "restorable_receipt": "2c7be136aea0",
      "restorable_event_hash_matches": true,
      "canonical_receipt": "2c7be136aea0",
      "observed_foreign_snapshot_receipt": "171b7c9ad2f2",
      "drift_type": "foreign_snapshot_then_spec_drift",
      "next_review_kind": "recheck_in_existing_cycle"
    },
    {
      "task_id": "T-656",
      "backlog_review": "5f6970ac76f2",
      "canonical_event_exists": true,
      "event_hash": "417ae43280b9c642bc3d6af8387550e6ffb11a80346b57244fe4c06135cb4885",
      "cycle": 1,
      "round": 3,
      "spec_path": "docs/superpowers/specs/2026-08-02-desktop-verdict-basic-hardening.md",
      "spec_sha256": "ca037dafc7b21ab04ce3ffe20502e7cc8862f14dc342a1e3db2437a67887f40e",
      "constitution_path": "PROJECT.md",
      "constitution_sha256": "d01469220b22455024bd58473a6ca9f307162b1317ba0fa5fe036b148f90362a",
      "review_path": "docs/superpowers/specs/2026-08-02-desktop-verdict-basic-hardening.review.md",
      "verdict": "PASS",
      "current_spec_sha256": "a6a56eb9bdb5c7b19e59fee6bef2c8f8fdbca2d4276f1b49d7a9c7ea049bc1ac",
      "current_constitution_sha256": "e9085d32d6f91bbe1a251b502aeede8c338e95c87c9f809155c159b8b1b0ab13",
      "canonical_spec_drift": true,
      "canonical_constitution_drift": true,
      "restore_commit": "73cd2e1ae734659dec694d17a11c36e048c36717",
      "old_findings": [
        {
          "id": "REV-001",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "为 smoke 签名而把 seed 放行给 `obfuscate.mjs` 后，现有 `spawn(..., { env: { ...process.env, ... } })` 会把该 seed 一并传给真正启动的 Sidecar。Sidecar 因而可从 `process.env` 读取签名私钥，违反“只含公钥”及“只有 smoke 签名进程得到”的边界；即使静态扫描全绿，运行时暴露面仍扩大。"
        },
        {
          "id": "REV-002",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "当前唯一的最终产物自检 `verifyPackagedTlsRuntime()` 在非 macOS 直接返回，且路径固定为 `.app`；SPEC 未定义 Windows 最终 shell/资源 tar 的定位、压缩 tar 成员内容的扫描方式，或该 Gate 的独立调用点。合理实现若在现有函数追加扫描，Windows 会继续零检查并仍可产出含 sentinel/bypass/私钥靶点的安装包，AC-656-04 却无从证明。"
        },
        {
          "id": "REV-003",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "现有共享解析器把 `[T451-BOUND]` 和换行视为合法输入，旧 SPEC 还将该 sentinel 描述为密钥宿主值的一部分。新 `build.rs` 若按 SPEC 严格拒绝，而打包前 `assertVerdictKeyMaterial()` 与 smoke helper 仍复用当前宽松解析，就会出现“前置校验通过、Cargo/真实冒烟失败”的断层；若保留宽松解析，又直接违背删除 sentinel/宽松解析的要求。"
        },
        {
          "id": "REV-004",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "现有 Windows 安装候选 Gate 不使用 `runtime-images/current` 目录或链接：它读取 `$INSTDIR/runtime-images/runtime-current.txt`，取得 runtimeId 后扫描 `$INSTDIR/runtime-images/$runtimeId/sidecar`。按新 SPEC 的 `runtime-images/current` 实现会在真实安装后找不到目标并 fail-closed，使 Windows NSIS 候选永远无法通过；若为绕过而跳过该读取，又无法满足对真实 current runtime 的验收。"
        }
      ],
      "needs_new_cycle": true,
      "restorable_receipt": "5f6970ac76f2",
      "restorable_event_hash_matches": true,
      "canonical_receipt": "5f6970ac76f2",
      "observed_foreign_snapshot_receipt": "bd8a6ac135f0",
      "drift_type": "foreign_snapshot_then_spec_drift_constitution_drift",
      "next_review_kind": "initial_in_new_cycle"
    },
    {
      "task_id": "T-652",
      "backlog_review": "待审",
      "canonical_event_exists": true,
      "event_hash": "df918506a6644d5aa3fe554bd87f958cbbeb65fa74dfed7c9835c67cbb380ac1",
      "cycle": 1,
      "round": 2,
      "spec_path": "docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md",
      "spec_sha256": "ef59b23c662a04c263266c4d0e9f0b98abc4d2ae3420f749211d226113ab35d6",
      "constitution_path": "docs/产品定位.md",
      "constitution_sha256": "86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800",
      "review_path": "docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.review.md",
      "verdict": "PASS",
      "current_spec_sha256": "95911e86fb467094feff7b2bd997d1b9ce2bd2e1cbe9dedc4862517ae5f7bdea",
      "current_constitution_sha256": "86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800",
      "canonical_spec_drift": true,
      "canonical_constitution_drift": false,
      "restore_commit": "73cd2e1ae734659dec694d17a11c36e048c36717",
      "old_findings": [
        {
          "id": "REV-001",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "当前文本只要求“追加版本并原子切换”，未规定重复确认、并发确认或基于过期候选确认时的唯一结果。两个合理实现可能分别创建重复版本，或让较早打开的旧候选覆盖用户刚采纳的新母版，破坏单一当前 profile 和历史完整性。"
        },
        {
          "id": "REV-002",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "SPEC 同时允许用户主动打开旧资料作参考、把证据实时放入证据板，并要求从零开始时旧资料不得进入候选上下文，但未定义“打开”“引用”“进入证据板”是否会改变生成输入。实现可以合理地把已打开旧作品随证据板一并提交，从而违反从零开始的已确认隔离结果。"
        },
        {
          "id": "REV-003",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "正文要求每题保留“其他，我补充”，并将可见选项设为默认交互，但验收只证明旅程可完成和视口可用；一个把多数问题实现为自由输入、或丢失自定义补充的实现仍可能满足现有 12 条验收，导致用户已确认的交互结果无法被拒收。"
        }
      ],
      "needs_new_cycle": false,
      "restorable_receipt": "b990448fbe2d",
      "restorable_event_hash_matches": true,
      "canonical_receipt": "b990448fbe2d",
      "observed_foreign_snapshot_receipt": null,
      "drift_type": "shared_review_ownership_and_missing_backlog_spec_link",
      "next_review_kind": "recheck_in_existing_cycle"
    },
    {
      "task_id": "T-645",
      "backlog_review": "5dfe24b42eb7",
      "canonical_event_exists": true,
      "event_hash": "ab61c3442f05c73c4febe511fa559717089235b244baad5920bd2186229eb6ac",
      "cycle": 1,
      "round": 3,
      "spec_path": "docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md",
      "spec_sha256": "c693c9a4ad1175d831512f493aabd4782603a21dda58f92fdca6c76e45989c4b",
      "constitution_path": "PROJECT.md",
      "constitution_sha256": "76e9fa0fa2408bd5f512b640d01ad5a0c550702875abeeb4ddb648a07e0e6bca",
      "review_path": "docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.review.md",
      "verdict": "PASS",
      "current_spec_sha256": "d2e9fbef2dcb8228b3652d5f269024eada6cafbf62c03ec61ba26ad6e4418fd1",
      "current_constitution_sha256": "e9085d32d6f91bbe1a251b502aeede8c338e95c87c9f809155c159b8b1b0ab13",
      "canonical_spec_drift": true,
      "canonical_constitution_drift": true,
      "restore_commit": "73cd2e1ae734659dec694d17a11c36e048c36717",
      "old_findings": [
        {
          "id": "REV-001",
          "status": "resolved",
          "severity": "blocker",
          "failure_mode": "SPEC 同时要求切换后旧 scope Key“不可调用”，又要求异步任务在执行期间从其启动时的相同 scope 取 Key，却未定义渠道切换后的在途任务应继续、取消还是重新授权，也未定义该例外的授权边界。实现者可合理地让旧任务继续读取旧 scope 密钥，违反“不可调用”；也可按当前 authority 拒绝读取，导致已启动任务无法按其 pin 的渠道执行。"
        },
        {
          "id": "REV-002",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "`scopeId` 是密钥隔离唯一键，但 SPEC 未规定对三项 identity 的规范化、无歧义编码、版本化及摘要算法。不同实现可对同一身份产生不同 scope，或因拼接/编码歧义使不同身份产生同一 scope，导致切换后不能读回原 Key，或跨渠道读取到错误 Key。"
        }
      ],
      "needs_new_cycle": true,
      "restorable_receipt": "5dfe24b42eb7",
      "restorable_event_hash_matches": true,
      "canonical_receipt": "5dfe24b42eb7",
      "observed_foreign_snapshot_receipt": "7ff0c3cb1906",
      "drift_type": "foreign_snapshot_then_spec_drift_constitution_drift",
      "next_review_kind": "initial_in_new_cycle"
    },
    {
      "task_id": "T-642",
      "backlog_review": "7728c9ed44bd",
      "canonical_event_exists": true,
      "event_hash": "b37a9f58b1d3de2270bb1262ace95eca8e3dab1b0c5dd5fd14619ac48666fc2a",
      "cycle": 1,
      "round": 3,
      "spec_path": "docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md",
      "spec_sha256": "e8c4568adfcd8dcf82c91468cd1dfde4c46899e128d1388c00001eddcb9b1442",
      "constitution_path": "docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md",
      "constitution_sha256": "07c9b61b58ca970feff57f1647c30a32c4af4fc92063c9a87952771403376950",
      "review_path": "docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.review.md",
      "verdict": "CONCERNS",
      "current_spec_sha256": "53794304623a79d9f7b7890edfd90b3e4bdc7c492d751b6ee50f4fb7b0455348",
      "current_constitution_sha256": "07c9b61b58ca970feff57f1647c30a32c4af4fc92063c9a87952771403376950",
      "canonical_spec_drift": true,
      "canonical_constitution_drift": false,
      "restore_commit": "73cd2e1ae734659dec694d17a11c36e048c36717",
      "old_findings": [
        {
          "id": "REV-001",
          "status": "resolved",
          "severity": "major",
          "failure_mode": "实现可仅按‘连续复用 + 语义相似’分数判高风险；当候选只复用了必要事实、专有名词或已标注引用时，语义检查仍可将其判为高风险并阻止采纳，导致已确认的例外验收无法成立。"
        },
        {
          "id": "REV-002",
          "status": "open",
          "severity": "major",
          "failure_mode": "实现可先提交 Project、promotion 和 reference，再在创建或写入初始 `output_script` 版本时失败；当前文本只要求读回 `topicSource` 与 reference，且只定义 reference attach 失败的半成功验收。用户刷新会看到已创建的内容雷达 Project 却没有应随之进入的右稿，重试还可能造成重复 promotion 或 artifact version。"
        }
      ],
      "needs_new_cycle": true,
      "restorable_receipt": "7728c9ed44bd",
      "restorable_event_hash_matches": true,
      "canonical_receipt": "7728c9ed44bd",
      "observed_foreign_snapshot_receipt": "9002b8dbeb4d",
      "drift_type": "foreign_snapshot_then_spec_drift",
      "next_review_kind": "initial_in_new_cycle"
    },
    {
      "task_id": "T-635",
      "backlog_review": "b8add273a494",
      "canonical_event_exists": true,
      "event_hash": "0c9c53ee3d4485a9223555c98cf5253a5dab545732375d3e0599decd558f73e2",
      "cycle": 1,
      "round": 3,
      "spec_path": "docs/superpowers/specs/2026-07-30-growth-product-identity-binding.md",
      "spec_sha256": "f00d4d7c0ecf1f7821fd336ce9278a12a168e1593417b1630527d458bcc929a3",
      "constitution_path": "PROJECT.md",
      "constitution_sha256": "89a36038833bdaed0d6de3ca353725643aff8aa53e6e0c53933b7ebdf4b1ad9b",
      "review_path": "docs/superpowers/specs/2026-07-30-growth-product-identity-binding.review.md",
      "verdict": "PASS",
      "current_spec_sha256": "5849ba840ce1352b97eb47a8d72b77397737242621d7e32170e2cd9e2a8d9402",
      "current_constitution_sha256": "e9085d32d6f91bbe1a251b502aeede8c338e95c87c9f809155c159b8b1b0ab13",
      "canonical_spec_drift": true,
      "canonical_constitution_drift": true,
      "restore_commit": "cfe0e4cc6725f6d7b318049df1a241dc51539d3f",
      "old_findings": [],
      "needs_new_cycle": true,
      "restorable_receipt": "b8add273a494",
      "restorable_event_hash_matches": true,
      "canonical_receipt": "b8add273a494",
      "observed_foreign_snapshot_receipt": "84661017fde5",
      "drift_type": "foreign_snapshot_then_spec_drift_constitution_drift",
      "next_review_kind": "initial_in_new_cycle"
    }
  ]
}
```

## 官方 Pi 诊断（独立代理 /root/t1408_pi_diagnosis）

来源：2026-10-25只读源码调查，未读用户DB、连接文件或密钥。原任务合法恢复至attempt2后仍http_402，真正上游业务原因尚未知；不再次消耗最后尝试。

- workbench-public.service.ts:28只列settled根模型调用，空calls不能证明未调用。
- pi-provider.ts:51、62–66捕获HTTP拒绝；本地预算是EXECUTION_BUDGET_EXHAUSTED，凭据端口故障收成WORKER_CREDENTIAL_UNAVAILABLE。因此http_402更符合模型HTTP拒绝路径，此为源码推断，不是账户原因证明。
- contract/src/provider-error-detail.ts原先只取error.code/message，遗漏字符串error和error.type，已定位确定性缺陷，但未证明现场body形状。
- provider-factory.ts的受管安全转换、execution/generation-error.ts与backend outcome会将402信息逐层收成泛等待提示。修复必须显式区分泛支付/权益拒绝与明确额度不足，禁止原正文透传。
- 官方额度入口为设置的“查看AI额度与消耗”，现公开CLI无钱包读取；credential()即使验证availableUnits，也只返回token+linked，元数据不能当余额证据。
- 排除：泛402直接判余额不足、换源/新建替代对话、透传任意脱敏正文、改钱包/放宽预算。主任务按真实授权与独评决定实现；本报告不是运行PASS。

2026-10-25现场补充：公开execution.tasks.command以稳定key恢复原execution一次，attempt1→2后再次402。已有官方额度浏览器页刷新后显示会话失效，旧缓存余额无当前证明力；已请用户完成正常登录，开发和其他检查继续。正常浏览器打开安装sidecar界面显示无权限，未读取或注入桌面握手凭据，不能将其标为真实UI验收成功。
