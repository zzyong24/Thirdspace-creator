# T-518 PLAN 独立规格评审

- review_mode: `cross-model-independent`
- model: `gpt-5.6-sol`
- round: `1`
- reviewed_artifact: `docs/superpowers/specs/2026-07-25-one-click-issue-feedback.md`
- verdict: `CONCERNS`
- finding_counts: `blocker=0, major=4, minor=0`

## 原始 JSON

```json
{
  "verdict": "CONCERNS",
  "summary": "方案与用户主动授权、本地优先和诚实错误原则总体一致，但 RAT 尚无实测结果，Windows 验收越过宪法支持边界，附件最长留存与 legal hold 的优先级未定，可选联系方式也缺少数据与验收落点。",
  "findings": [
    {
      "severity": "major",
      "category": "value-viability",
      "where": "§4.4「五大风险与 RAT」",
      "issue": "表格只列出“最便宜检验”，没有任何检验状态、结果或证据回填；其中“本地造包 + mock presign RAT”和“禁用 storage 的失败演练”直接关系到完整性与依赖失效时能否保住离线一等路径。量规要求致命且便宜可验的风险已检验并回填，当前文本无法区分已验证结论与待执行计划。",
      "suggestion": "为每个已经执行的 RAT 补充日期、输入、结果、证据位置和结论；至少先完成并回填本地造包/mock presign 与 storage 禁用演练。尚未执行的项目明确标为未验证，并在申请 PLAN 通过前说明为何不构成致命未检假设。"
    },
    {
      "severity": "major",
      "category": "fit-positioning",
      "where": "§16「验收与成功信号」AC-FDB-04",
      "issue": "AC-FDB-04 要求导出包在 macOS/Windows 路径可打开，但宪法 §2.3 明确“正式目标：macOS 桌面端”且“Windows：代码与打包证据不足，当前不得宣称支持”。把 Windows 写入本任务验收会形成宪法未授权的平台支持方向，现有 DEC 仅确认 support 归属和留存口径。",
      "suggestion": "将本任务发布验收限定为宪法支持的 macOS；如果确实要把 Windows 纳入交付范围，先以独立 DEC 更新平台范围、打包证据和验收责任，再保留该断言。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "§6 NFR-FDB-10、§7 FLOW-FDB-04、§15 ASM-FDB-02",
      "issue": "ASM-FDB-02 与 NFR-FDB-10 一方面规定未关闭附件“最长 90 天”，另一方面允许 legal hold 带独立到期时间，但没有说明 legal hold 是否可以突破 90 天硬上限、resolved/closed 后 30 天规则，或只能在这些上限内暂停删除。涉及敏感截图和日志时，两个规则的优先级不明确会让实现者得出相反的删除行为。",
      "suggestion": "明确唯一优先级：若已确认的 90 天是绝对上限，写明 legal hold 也不得突破该上限；若 legal hold 是例外，补充单独用户确认/DEC、允许延长的最大值、权限、复核和到期后的删除时限。"
    },
    {
      "severity": "major",
      "category": "traceability",
      "where": "§5 FR-FDB-02、§8 ENT-FDB-01、§16 验收项",
      "issue": "FR-FDB-02 引入“可选联系方式”，但 FeedbackReport 字段没有联系方式，隐私/留存条款未说明该个人数据的格式、用途和删除规则，AC 也没有覆盖填写、不填写或删除后的行为。该需求因此无法从 FR 追到数据落点和测试。",
      "suggestion": "要么从已确认范围移除联系方式；要么为其补充字段级模型、允许格式与长度、用途提示、访问权限、日志禁记、留存/删除规则，并增加填写与不填写两条验收。"
    }
  ]
}
```

## 作者处理记录（Round 1 findings）

日期：2026-07-25。以下处理均已回写 PRODUCT SPEC，等待独立 Round 2 复评：

1. **接受 RAT 缺口**：新增
   `docs/research/2026-07-25-t518-feedback-package-rat.md`。真实 2 PNG + 1 `.enc` +
   manifest 在空格/中文路径完成造包、解压与 3/3 checksum；模拟 storage 在网络前 fail closed
   后，原输入、draft、已导出包全部保留。报告明确仅为 macOS 协议层证据，不把 Tauri、Windows、
   presign、扫描和服务端留存补写为 PASS。
2. **接受平台范围问题**：AC-FDB-04 改为当前宪法正式支持的 macOS 发布验收；Windows 使用同一
   fixture 仅作候选平台契约证据，T-487/DEC-PKG 与产品宪法更新前不得宣称支持。
3. **接受留存优先级问题**：90 天改为自 report 创建起算的绝对附件上限；legal hold 只能在
   上限内延迟 30 天常规删除，第 90 天无条件删除附件。更长期法务保存需要新决策且当前只留
   不含附件内容的最小元数据/deletion receipt。
4. **接受联系方式追踪问题，但不扩大采集**：从当前确认范围移除邮箱/手机号等可选联系方式；
   后续处理只以内部账号摘要与反馈编号关联，Out of scope 已明确不额外收集联系方式。
5. **RAT 新发现**：仓内没有固定 zip 依赖，macOS Info-ZIP 列表对中文 entry 有乱码警告。
   SPEC 已要求规范化 UTF-8 相对 entry、拒绝穿越/绝对路径/symlink、checksum 校验与原子替换；
   跨平台实现选择留给 CONTRACT，不以系统 `zip` 冒充发布方案。

## Round 2 独立复评

- review_mode: `homogeneous`
- warning: 当前采用同模型的新上下文独立 subagent，属于弱于跨家族复评的降级门；未把作者处理结论直接当成 PASS。
- round: `2`
- reviewed_artifact: `docs/superpowers/specs/2026-07-25-one-click-issue-feedback.md`
- evidence:
  - `docs/research/2026-07-25-t518-feedback-package-rat.md`
  - `docs/产品定位.md` §2.3、P-04、BR-03、NFR-SECURITY、NFR-PRIVACY
- verdict: `CONCERNS`
- finding_counts: `blocker=0, major=3, minor=0`

### Round 1 findings 关闭复核

1. **RAT 缺口：关闭。** RAT 给出了真实命令、输入、输出与 checksum，且把结论限定为
   macOS/Info-ZIP 的 protocol-only 证据；Tauri、Windows、presign、扫描、幂等和服务端留存仍
   明确为未验证，没有把本地模拟外推成发布通过。新增的 ZIP 裁决也符合 PLAN→CONTRACT 边界：
   PRODUCT SPEC 约束 UTF-8 相对 entry、拒绝穿越/绝对路径/symlink、校验与原子替换，并把固定
   跨平台实现及 Unicode normalization/故障注入留在 `HARD-FDB-03`，没有拿系统 `zip` 充当生产方案。
2. **Windows 越界：关闭。** AC-FDB-04 只把 macOS 作为当前发布验收；Windows 明确是候选平台
   fixture，且受 T-487/DEC-PKG 与宪法更新前置约束，与宪法 §2.3、§16、§17 一致。
3. **留存优先级：关闭。** NFR-FDB-10 已给出
   `min(resolvedOrClosedAt + 30 天, report.createdAt + 90 天)`，未关闭也以第 90 天封顶；
   legal hold 不能跨第 90 天，FLOW-FDB-04 与 ASM-FDB-02 同口径。
4. **可选联系方式：关闭。** FR-FDB-02 与 Out of scope 都明确不采集邮箱、手机号、微信号等
   联系方式，领域模型也没有留下孤儿字段。

### Round 2 原始 JSON

```json
{
  "verdict": "CONCERNS",
  "summary": "Round 1 的四项 major 与新增 ZIP 安全边界均已实质关闭，但自由文本描述没有明确的数据留存结局、本地导出是否始终可用存在核心路径矛盾，多截图排序也缺少持久化字段和验收落点。",
  "findings": [
    {
      "severity": "major",
      "category": "completeness",
      "where": "§5 FR-FDB-11、§6 NFR-FDB-10、§7 FLOW-FDB-04、§8 ENT-FDB-01",
      "issue": "90 天绝对上限只覆盖“附件”，而 FeedbackReport 的 description 是用户自由文本且可能包含同等敏感信息。FR-FDB-11/FLOW-FDB-04 删除对象后称只保留“反馈元数据/最小元数据”，但 ENT-FDB-01 仍保留 description，SPEC 没有说明 description 在 resolved/closed、report 第 90 天或用户删除请求后是删除、脱敏、摘要化还是永久保留。不同实现者会得出相反的数据生命周期，且这与宪法 NFR-PRIVACY 的删除说明要求直接相关。",
      "suggestion": "给 description 和内部备注分别定义明确的保留/删除口径，并与附件算法区分；若描述不允许长期保留，写出删除时点、删除后后台回显和 deletion receipt，补一条可验证 AC。若确需长期保留全文，必须把用途、权限、最长时限和用户可理解说明写成显式决策，不能把自由文本笼统称为最小元数据。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "§1 目标第 5 点、§3 SC-FDB-03、§5 FR-FDB-06、§7 FLOW-FDB-02",
      "issue": "目标承诺“网络不可用或不愿上传时”都能一键导出，但 SC-FDB-03 把导出写成上传失败后的动作，FR-FDB-06 又写成“在不联网时导出”。因此实现者可能只在断网/上传失败后显示导出，违背用户出于隐私主动选择仅本地导出的核心承诺。",
      "suggestion": "把本地导出明确为弹窗内始终可用、无需先尝试上传的并列一等动作；补充“网络正常但用户选择仅导出”的场景与 AC，并保证该路径不创建服务端 draft、presign 或任何 feedback 网络请求。"
    },
    {
      "severity": "major",
      "category": "traceability",
      "where": "§5 FR-FDB-03、§8 ENT-FDB-02、§16 AC-FDB-02",
      "issue": "FR-FDB-03 承诺多截图可排序，但 FeedbackAttachment 没有 ordinal/displayOrder，manifest 需求也只列 path/size/checksum，AC-FDB-02 只验证对象集合一致而不验证顺序。排序因此没有数据落点，上传、刷新或后台打开详情后可能丢失用户表达的问题顺序。",
      "suggestion": "在 manifest 与 FeedbackAttachment 增加不可歧义的 displayOrder/ordinal，规定删除或重排后的序号语义，并让 AC-FDB-02 验证本地清单、服务端附件和后台展示顺序一致；若排序没有用户价值，则从 FR 移除而不是保留假控件。"
    }
  ]
}
```

## 作者处理记录（Round 2 findings）

日期：2026-07-25。已回写 PRODUCT SPEC，等待 Round 3 独立复评：

1. **接受自由文本生命周期缺口**：description、内部备注正文与原始 route 使用和附件相同的
   `min(resolvedOrClosedAt+30d, report.createdAt+90d)` 到期日；到期后清空，只保留不含
   自由文本/附件内容的最小字段与 deletion receipt。新增 ENT-FDB-06 与 AC-FDB-08。
2. **接受仅本地导出路径矛盾**：新增 SC-FDB-06；FR/FLOW 明确“仅导出到本地”始终与上传并列，
   不要求先失败或断网，不创建 server draft/presign，也不发 feedback 请求。新增 AC-FDB-07。
3. **接受截图顺序落点缺失**：manifest 与 FeedbackAttachment 增加连续 `displayOrder`，删除/
   重排立即重编号，AC-FDB-02 验证本地、manifest、服务端和后台顺序一致。

## Round 3 最终独立复评

- review_mode: `homogeneous`
- warning: 当前采用同模型的新上下文独立 subagent，弱于跨家族复评；本轮重新读取宪法、最新
  PRODUCT SPEC、RAT 与前两轮完整历史，没有把 Round 2 作者处理记录直接当成通过证据。
- round: `3`
- reviewed_artifact: `docs/superpowers/specs/2026-07-25-one-click-issue-feedback.md`
- evidence:
  - `docs/research/2026-07-25-t518-feedback-package-rat.md`
  - `docs/产品定位.md` §2.3、P-04、BR-03、NFR-SECURITY、NFR-PRIVACY
  - `orchestrator/DECISION_LOG.md#DEC-BATCH-20260725-003`
- verdict: `CONCERNS`
- finding_counts: `blocker=0, major=2, minor=0`

### 前两轮 findings 关闭复核

1. **Round 1 四项 finding：全部关闭。** RAT 的 protocol-only 边界仍诚实；macOS 才是发布
   验收平台，Windows 只是受 T-487/DEC-PKG 与宪法更新约束的候选 fixture；90 天仍是 legal
   hold 不可突破的绝对上限；联系方式已从范围、模型和采集口径中一致移除。
2. **Round 2 自由文本生命周期：原 finding 的主体已关闭，但审计事件仍有相邻缺口。**
   description、内部备注正文与原始 route 已使用同一到期算法，AC-FDB-08 也验证不可读；
   `FeedbackEvent.reason` 的 append-only 与“到期后不留自由文本”仍冲突，见本轮 finding 2。
3. **Round 2 主动仅导出：入口与主流程已改为一等动作，但网络为 0 尚未闭合。**
   SC-FDB-06、FR-FDB-06、FLOW-FDB-02 已不再要求先上传失败；然而 FR-FDB-03 的 server policy
   仍可能在打开弹窗或选择截图时发 feedback 请求，见本轮 finding 1。
4. **Round 2 截图排序：关闭。** FR-FDB-03、ENT-FDB-02 与 AC-FDB-02 已共同定义从 0 开始、
   删除/拖动后连续重排，并覆盖本地清单、manifest、服务端持久化与后台展示，顺序不再是孤儿。
5. **ZIP/path 与平台边界：本阶段通过。** FR-FDB-06 已约束规范化 UTF-8 相对 entry、拒绝
   `..`/绝对路径/symlink、逐项 size/checksum 与同目录原子替换；RAT 没有把系统 Info-ZIP
   外推为生产实现，Unicode normalization、磁盘满/取消与固定跨平台库仍明确归
   HARD-FDB-03 的 CONTRACT/BUILD Gate。AC-FDB-04 没有宣称 Windows 已支持。

### Round 3 原始 JSON

```json
{
  "verdict": "CONCERNS",
  "summary": "前两轮的截图顺序、平台边界、ZIP 安全约束和主要内容留存规则已闭合，但“仅导出”仍可能因服务端 policy 查询产生 feedback 出网，append-only 审计 reason 也与到期后不得保留自由文本的规则冲突。",
  "findings": [
    {
      "severity": "major",
      "category": "completeness",
      "where": "§3 SC-FDB-06、§5 FR-FDB-03/FR-FDB-06、§7 FLOW-FDB-02、§16 AC-FDB-07",
      "issue": "SC-FDB-06/FLOW-FDB-02 承诺主动“仅导出”不发任何 feedback 请求，但 FR-FDB-03 又规定截图数量和大小由 server policy 返回。若弹窗打开或选择截图时读取该 policy，用户即使随后只导出，也已经访问 support/feedback 服务；AC-FDB-07 只枚举 draft、presign、PUT、submit 为 0，没有覆盖 policy GET。实现者可同时自称满足两条互相冲突的要求，且这直接关系宪法 P-04/NFR-PRIVACY 的可解释最小出网。",
      "suggestion": "明确本地导出使用随应用签名发布或已本地持久化的保守 policy，打开弹窗、选择附件和完成仅导出都不得为了本功能访问 support、对象存储或 policy endpoint；只有用户点击“上传反馈”后才允许拉取并重新校验 server policy。把 AC-FDB-07 改为对该完整交互期间所有 support/feedback/object-storage 请求计数为 0，而不只列四类写请求。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "§5 FR-FDB-11、§6 NFR-FDB-10、§7 FLOW-FDB-04、§8 ENT-FDB-04/ENT-FDB-06、§16 AC-FDB-08",
      "issue": "FR-FDB-11/NFR-FDB-10 要求到期后不保留任何自由文本，但 ENT-FDB-04 把含 `reason` 的 FeedbackEvent 定义为 append-only，legal hold、状态变化和内部备注审计都可能把自由文本复制进该字段；ENT-FDB-06 还写明正文清空后“仅留审计事件”。SPEC 没有说明 reason 是受限枚举还是会同步清空，因此一种实现会永久保存敏感原文，另一种实现会修改所谓 append-only 事件，二者都能从当前文字找到依据。",
      "suggestion": "将永久审计事件限定为 ASCII `reasonCode`/状态/actor/时间等结构化字段；任何可输入的 reason/body 单独落到有 `contentExpiresAt` 的内容字段并按同一到期算法清空，且审计/APM 不复制正文。扩展 AC-FDB-08，逐表证明 FeedbackEvent、legal-hold 记录、InternalNote 和 deletion receipt 在到期后均不含自由文本或附件内容。"
    }
  ]
}
```

## 作者处理记录（Round 3 findings；三轮 STOP）

日期：2026-07-25。两项已回写 PRODUCT SPEC，但依流程不追加第四轮、不把 PLAN 伪写为 PASS：

1. 本地选择/仅导出改用签名随包的保守 local policy；只有用户明确点击“上传反馈”后才允许读取
   server policy。AC-FDB-07 现在验证从开弹窗到导出完成的全部
   support/feedback/object-storage 请求（含 policy GET）为 0。
2. append-only FeedbackEvent 只保留 ASCII `reasonCode`/actorRole/状态/时间；可输入理由正文拆到
   有 `contentExpiresAt` 的 ENT-FDB-07，并和 description/InternalNote/原始 route 同期删除。
   AC-FDB-08 要求逐表与 audit/APM 证明没有自由文本残留。

当前裁决：Round 3 的已知文字冲突已修订，但三轮最终 verdict 仍为 `CONCERNS`。T-518 保持
PLAN Gate 未通过、禁止进入 CONTRACT/BUILD，等待人的 Gate 裁决或后续明确授权的复评重开。
