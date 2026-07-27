# T-501 模型配置体验重构 PAGE SPEC 独立评审

> 日期：2026-07-25  
> 被审工件：`2026-07-25-model-configuration-experience-redesign.page-spec.md`  
> 上游：已通过的 PRODUCT SPEC、SERVICE CONTRACT Round 4、`docs/产品定位.md`  
> review_mode：`homogeneous`（fresh-context subagent）  
> Reviewer：独立只读评审上下文；未参与本 PAGE SPEC 编写  
> WARNING：本轮未调用外部跨族 reviewer，属于同模型新上下文弱门；结论仍需作者逐条
> disposition 与用户裁决。  
> 修改边界：只新增本评审记录；未修改 PAGE SPEC、上游工件、代码、任务状态或 canonical
> 控制文件；未调用任何付费模型/provider。

## 结论

**FAIL（2 blocker / 3 major / 2 minor）**

PAGE SPEC 在定位、普通/高级接入、诚实状态、付费 fail-closed、1280×720 布局、键盘路径与
overview-first 人审纪律上总体扎实；尤其没有把 T-517 的文档状态误当 runtime readiness，也没有
提前生成逐屏或进入 Stitch/BUILD。

但当前不能生成系统总览图并申请视觉人审：本地 Whisper 的已确认下载/进度范围被无契约地删掉，
而 8 个配置 slot 的真实状态也没有可判定的 slot 级读契约。这两项分别触发 scope-reduction 与
“No API, no UI”硬门，必须先回 CONTRACT/PLAN 闭合。

## 逐维度判定

| 维度 | 判定 | 证据与结论 |
|---|---|---|
| 合定位 | PASS | 对齐宪法 P-03、P-04、R-COPILOT、R-SETTINGS；无 Key 托管、无虚假绿色、无新增远程遥测 |
| 方案合理性 | CONCERNS | 普通/高级/ASR/付费状态机主体合理，但 slot 级证据读回、免费测试历史和取消链路不闭合 |
| No API, no UI | FAIL | `API-MC-010` 不能唯一指向 8 个 slot；本地模型下载/进度没有 operation 却属于已确认范围 |
| 完整性/可执行 | FAIL | 本地 Whisper 下载、免费保存测试历史、in-flight cancel 和人工对账表单仍需补齐 |
| 可追溯 | CONCERNS | FR/AC 表齐全，但 `FR-MC-10`、`FR-MC-13`、`NFR-MC-04/05` 的文字映射不能由当前 binding 实现 |
| 视觉与 house style | CONCERNS | `tokens.css` 与 HOUSE_STYLE 一致，但缺 Gate 05 要求的项目级 DEC 来源行 |
| 1280×720 / 键盘 | PASS（待 BUILD 证明） | §15/16 对 viewport、单滚动容器、焦点、Esc、aria-live、文字+图标状态均明确；取消缺口另列 finding |
| overview-first 人审 | PASS | 只定义一张六区域总览；明确总览通过前禁逐屏、Stitch、BUILD，没有越过人审 |
| T-517 边界 | PASS | 006/远端 008 未 ready 时 503、provider call=0；007 与本地审计继续可用，未建第二状态机 |

## Findings（结构化）

```json
{
  "verdict": "FAIL",
  "summary": "PAGE SPEC 的总体交互与付费安全边界正确，但本地 Whisper 已确认范围被无契约省略，且 8-slot 状态读回不具备可执行 binding；修订前不得进入 overview 人审。",
  "findings": [
    {
      "severity": "blocker",
      "category": "scope-reduction",
      "where": "PAGE SPEC §8.1、§20 FR-MC-10、§22；PRODUCT SPEC SC-MC-04、§4.5 本地 ASR、FR-MC-10、FLOW-MC-03",
      "issue": "PRODUCT SPEC 明确承诺本地 Whisper 展示下载大小/状态/预计速度，首次价值失败面包含下载进度与失败重试，流程包含“检查模型→需要时下载→样本转写”。PAGE SPEC 却以 CONTRACT 无下载/进度 operation 为由明确不画下载按钮和进度，也没有显式 deferral、owner 或用户确认。这不是诚实降级，而是把已确认范围静默缩成一次可能长时间无反馈的 API-MC-004 测试。",
      "suggestion": "先回 CONTRACT：定义本地模型 inventory/可用状态、下载或按需准备、进度/失败/取消/重试及重启读回；若坚持由 API-MC-004 隐式下载，也必须把分阶段进度、Abort、磁盘不足和最终状态写进其 wire 并在 PAGE SPEC 绑定。若产品决定不做，则回 PLAN 走显式范围变更、DEC、独立评审和用户确认，不能由 DESIGN 自行删掉。"
    },
    {
      "severity": "blocker",
      "category": "traceability",
      "where": "PAGE SPEC §4.2、§17“总览初始配置读回/能力卡证据摘要”、§20 FR-MC-13 与 AC-MC-12；CONTRACT §4.1、§6.1、API-MC-010、§10.3；当前 contract/src/operations/settings.ts:72-77 与 contract/src/resources/settings.ts:35-53",
      "issue": "页面承诺 default、chat.fallback、script.review 等 8 个 slot 都显示真实证据状态，但 API-MC-010 请求只有 measuredCapability，没有 slot。CONTRACT 的 slot→measuredCapability 表也没有给 chat.fallback/script.review 唯一投影；同一个 editorContent 无法区分 default、fallback、review。PAGE SPEC 同时把初始状态绑到“现有 settings.models.list”，而当前真实 wire 只有配置字段和 hasSecret，没有 lifecycle/verification。于是两个核心卡片无法读到自身的 ready/partial/stale 状态，违反 No API, no UI。",
      "suggestion": "回 CONTRACT 增加可唯一寻址的 `{slot, measuredCapability}` 读法，或定义一次返回 8 个 slot 的 overview operation/resource（包含 lifecycle、revision、每项 verification）；明确 chat.fallback/script.review 的测量集合与绿色条件。随后更新当前 Zod operation、PAGE SPEC binding、API/TEST 追踪并重跑合同独立评审。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "PAGE SPEC §9.2、§17“测试记录/筛选/分页”；CONTRACT §4.5 CapabilityTestResultResource、§6.1 TestHistoryItemResource、API-MC-012",
      "issue": "普通同步草稿通过后会 commit 测试摘要，NFR-MC-04 又要求至少 30 天或最近 50 次历史；但同步结果的 runId 可以为 null，而 API-MC-012 的每个 TestHistoryItemResource 必须包一个带 candidateId 的 CapabilityTestRunResource，点击又被 PAGE SPEC 统一导向 API-MC-007。当前 wire 无法表示“已保存的免费同步测试历史”，所以正常文本/ASR 配置的测试记录可能只剩付费 candidate run。",
      "suggestion": "把历史 item 定义为判别 union：saved-sync evidence snapshot 与 paid run 分开；免费项应能直接从 012 返回完整脱敏 step，或有明确 detail operation。PAGE SPEC 分别定义两类点击、空态、过期和 retainedUntil，TEST-MC-18 覆盖非空 canonical fixture，不能只测空数组。"
    },
    {
      "severity": "major",
      "category": "traceability",
      "where": "PAGE SPEC §4.1、§16、§18.3；PRODUCT SPEC NFR-MC-05“各步骤可取消”",
      "issue": "PAGE SPEC 的“取消”只描述退出向导/销毁草稿，运行中又只说禁用重复 effect 按钮，没有为 API-MC-003 模型发现或 API-MC-004 同步探测定义 in-flight cancel binding、Abort 后状态、草稿保留和结果未知处理。付费运行明确不能因关 UI 取消是正确的，但不能替代上游对同步步骤可取消的承诺。",
      "suggestion": "在 binding 表增加“取消模型发现/同步测试”：若采用本地 AbortController，写清 signal 必须贯通 backend→ai-worker/provider、Abort 后 draft 保留、无 evidenceToken、可能已到 provider 时显示 MC_SYNC_RESULT_UNKNOWN 且禁自动重试；若需要服务端 command，先补 CONTRACT。单独写明 paid queued/running 不提供误导性的本地取消。"
    },
    {
      "severity": "major",
      "category": "traceability",
      "where": "PAGE SPEC 头部、§3、§21；orchestrator/DECISION_LOG.md",
      "issue": "PAGE SPEC 正确引用项目 tokens 与 templates/HOUSE_STYLE.md，但 DECISION_LOG 没有 Gate 05 要求的“沿用 house style”来源记录。PRODUCT SPEC 的 ASM-MC-05 与 PAGE SPEC 自述不能替代项目级 DEC；因此 tokens traceability 尚不能通过 UI Gate。",
      "suggestion": "在生成 overview 前补一条 DESIGN DEC：明确沿用 HOUSE_STYLE.md 与 frontend/src/styles/tokens.css、无项目级偏离、视觉总览仍待用户人审；若后续总览要求改风格，再用新的 DEC 记录偏离与选中候选。"
    },
    {
      "severity": "minor",
      "category": "traceability",
      "where": "SERVICE CONTRACT §13“独立评审就绪清单与 Gate”与其文件头、Round 4 review、ARTIFACT_MANIFEST 的相互关系",
      "issue": "PAGE SPEC 按文件头/manifest 正确认定 CONTRACT 与确认②已通过，但 CONTRACT 正文末尾仍写 Round 4 PENDING、Gate 12/15b FAIL、确认②关闭、DESIGN 未授权。虽然 Round 4 review 和新文件头能还原真相，这个 canonical 内部矛盾会误导下一位 agent 的 stage-router。",
      "suggestion": "把 §13 的旧状态明确标成“Round 3 历史快照”，并在合同正文末尾追加当前 Round 4 PASS、确认②已记录、仅 paid runtime 继续被 T-517 阻断的现状；不要删除历史失败证据。"
    },
    {
      "severity": "minor",
      "category": "completeness",
      "where": "PAGE SPEC §11.4“登记供应商后台结果”",
      "issue": "页面只写“受控表单”，没有把 ReconcileEvidence 的 source、referenceRedacted、observedRemoteStatus、长度/敏感 query 禁止规则、校验错误与提交后焦点写进 PAGE SPEC。operation 存在，但另一位前端 agent 仍需回合同猜 UI。",
      "suggestion": "补字段级表单规格与错误/键盘状态；只允许 contract 枚举，referenceRedacted 显示敏感信息警告并做 1..256 校验，提交绑定 API-MC-008 record-manual-evidence。"
    }
  ]
}
```

## 现状与 house-style 核验

- `codegraph query SettingsDialog` 定位现有 Settings 外壳为
  `frontend/src/features/settings/settings-interactive-region.tsx:267-510`；当前仍是
  `max-w-4xl`、左侧模型自由字段卡和兼容 `settings.models.put/list/test`，因此 PAGE SPEC 是目标
  设计，不应把现状代码误记为已实现。
- 当前 Settings 模型分组仍把 `web.search` 放在模型页
  (`settings-interactive-region.tsx:415-487`)；PAGE SPEC 把它移到“联网与数据源”，与
  PRODUCT SPEC 和宪法 R-SETTINGS 一致。
- `frontend/src/styles/tokens.css:1-46` 已存在 canvas/surface/brand、四色语义状态、8/12/16px
  圆角、24/20/16px 间距和 Noto Sans SC，能支撑“白底紫魂”；不是新发明视觉 token。
- 当前 `settings.models.list` 的 Zod response
  (`contract/src/operations/settings.ts:72-77`、
  `contract/src/resources/settings.ts:35-53`) 没有 PAGE SPEC 所需 verification/lifecycle，
  因此 blocker 2 不是对未来实现的猜测，而是实际 contract binding 缺口。
- `node orchestrator/process/orphan-scan.mjs`：`0 error(s)`，T-501 链双向存在；本评审 findings
  针对的是“ID 有登记但 wire 不能实现该语义”，不与机械 orphan 结果冲突。

## Gate 判定

```text
Gate: 06-page-spec-gate（独立预评）
Status: fail
Evidence:
  - PAGE SPEC §4..20
  - PRODUCT SPEC FR-MC-10/13、NFR-MC-04/05
  - SERVICE CONTRACT API-MC-010/012 与现有 settings.models.list Zod wire
Findings:
  - 本地 Whisper 下载/进度已确认范围被无 operation 省略
  - 8-slot 真实状态无法由当前 API 唯一读回
  - 免费保存测试历史与取消链路不闭合
Decision:
  - 回 CONTRACT/必要时 PLAN 修订并独立复评；修订前不得进入 overview 人审
```

```text
Gate: 05-ui-gate（流程检查）
Status: not-run / blocked
Evidence:
  - PAGE SPEC §3/§15/§16/§21
  - frontend/src/styles/tokens.css
  - templates/HOUSE_STYLE.md
Findings:
  - overview-first 顺序正确，尚未越过人审
  - 缺 house-style 项目级 DEC 来源行
  - 尚无用户通过的 overview、逐屏 mock、DESIGN.md 或 Stitch 对照证据
Decision:
  - 先关闭 Gate 06 blocker 并补 DEC；之后才生成一张 overview 供用户审核
```

## 作者/用户裁决区（待主 Agent 回填）

| Finding | 作者 disposition | 用户裁决 |
|---|---|---|
| B1 本地 Whisper 下载/进度范围缩减 | PENDING | PENDING |
| B2 8-slot 状态读契约不可唯一寻址 | PENDING | PENDING |
| M1 免费保存测试历史 wire 不闭合 | PENDING | PENDING |
| M2 同步发现/探测无取消 binding | PENDING | PENDING |
| M3 house-style DEC 缺失 | PENDING | PENDING |
| m1 CONTRACT 末尾状态漂移 | PENDING | PENDING |
| m2 人工证据表单字段不完整 | PENDING | PENDING |

## 作者处置记录（2026-07-25；非新一轮评审）

| Finding | 作者 disposition | 修订证据 | 用户裁决 |
|---|---|---|---|
| B1 本地 Whisper 下载/进度范围缩减 | ACCEPTED / FIXED-IN-DOC | CONTRACT 新增 ENT-MC-08、API-MC-015/016；PAGE SPEC §8.1/§17 补大小、真实进度、磁盘预检、取消/重试与重启重扫 | 待修订契约复评后重新确认② |
| B2 8-slot 状态读契约不可唯一寻址 | ACCEPTED / FIXED-IN-DOC | API-MC-010 改为 `{slot,capability}`；新增 API-MC-014 唯一八槽 overview；PAGE SPEC §17 改绑 014 | 同上 |
| M1 免费保存测试历史 wire 不闭合 | ACCEPTED / FIXED-IN-DOC | API-MC-012 改为 saved-sync/paid-run 判别 union；PAGE SPEC §9.2 分开详情行为 | 同上 |
| M2 同步发现/探测无取消 binding | ACCEPTED / FIXED-IN-DOC | 新增 API-MC-017；PAGE SPEC §4.4/§16/§17 补草稿保留、dispatch 状态与禁自动重试 | 同上 |
| M3 house-style DEC 缺失 | ACCEPTED / FIXED-IN-DOC | 新增 `DEC-MC-001`，明确 HOUSE_STYLE + tokens、无视觉偏离且不替代人审 | 不需要新增产品选择 |
| m1 CONTRACT 末尾状态漂移 | ACCEPTED / FIXED-IN-DOC | CONTRACT §13 区分修订前历史 PASS 与当前 invalidated/re-review pending | 同上 |
| m2 人工证据表单字段不完整 | ACCEPTED / FIXED-IN-DOC | PAGE SPEC §11.4 补 source/referenceRedacted/observedRemoteStatus、校验、错误和焦点 | 不需要新增产品选择 |

作者没有自行改写本轮 FAIL，也没有启动新评审。由于修订新增 API/实体并改变 wire，修订前
CONTRACT Round 4 PASS 与确认②已失效；正确下一步是独立 CONTRACT 复评，而不是直接出 overview。

---

## Round 2 独立复评（2026-07-25）

> 审查者：独立 Agent `t501_page_spec_r2`  
> 审查快照：用户已通过 `DEC-BATCH-20260725-004` 重新完成 CONTRACT 确认②后的 PAGE SPEC  
> 审查边界：只检查 Gate 06 的 No API, no UI、付费确认顺序和已确认诊断范围；未修改上游工件，
> 未生成 overview，未进入 BUILD，也未调用付费 provider。

### Verdict

**FAIL（2 blocker / 0 major / 0 minor）**

```json
{
  "verdict": "FAIL",
  "summary": "页面总体信息架构可以继续沿用，但诊断字段与付费确认顺序仍有两处运行时不可兑现的契约错位；关闭前不能生成 overview。",
  "findings": [
    {
      "severity": "blocker",
      "category": "no-api-no-ui",
      "where": "PAGE SPEC §9.1/§9.3；PRODUCT SPEC §8 ENT-MC-04；CONTRACT CapabilityTestRunResource、SavedSyncHistoryItemResource、API-MC-007/012",
      "issue": "已确认的脱敏诊断必须包含 providerProductId、protocol、modelId，但 API-MC-007 的 run detail 与 API-MC-012 的两类 history item 不能稳定返回这三项。页面若按 §9.3 复制，只能从其他页面状态猜测或遗漏字段，隔天打开历史时尤其无法兑现。",
      "suggestion": "在 CONTRACT 为 paid run 和 saved-sync history 增加可判别的 provider/product/protocol/model/endpoint 诊断上下文，补 006/007/008/012 canonical fixture 与 TEST；PAGE SPEC 只从当前 DTO 白名单复制，不从草稿、DOM 或缓存拼接。"
    },
    {
      "severity": "blocker",
      "category": "paid-confirmation-order",
      "where": "PAGE SPEC §11.2；CONTRACT §5.2、API-MC-005/006",
      "issue": "PAGE SPEC 先展示费用确认面，用户点击主 CTA 后才“先确保 API-MC-005 返回 candidate，再调用 006”；但权威 costDisclosure/version 只由 005 返回。用户因此可能在没看见本次确切披露版本时就触发 006，违反先披露、再确认、后 effect 的门禁。",
      "suggestion": "进入确认面前先调用无 provider effect 的 API-MC-005 创建 pending-inactive candidate；005 成功后才渲染其原样 costDisclosure，并启用“确认并执行一次真实测试”。API-MC-006 必须携带用户刚看见的 acceptedCostDisclosureVersion；草稿或 candidate revision 变化后作废确认并重新 prepare。"
    }
  ]
}
```

### Gate 06 判定

```text
Gate: 06-page-spec-gate（Round 2 独立复评）
Status: fail
Evidence:
  - PAGE SPEC §9.1/§9.3/§11.2
  - PRODUCT SPEC ENT-MC-04
  - CONTRACT CapabilityTestRunResource / SavedSyncHistoryItemResource / API-MC-005..008/012
Decision:
  - 回 CONTRACT/PAGE SPEC 关闭两项 blocker；
  - 修订仍属于已确认产品范围内的契约补齐，不新增产品能力；
  - 修订后必须由非作者做 Round 3 复评，PASS 前禁止 overview 与 BUILD。
```

## Round 3 定向独立复评

> 日期：2026-07-25
> Reviewer：独立只读 reviewer；不是 PAGE SPEC / CONTRACT 作者
> 复评边界：只复核 Round 2 的两项 blocker，并顺带做 Gate 06 “No API, no UI” 定向回归；
> 不扩大新问题扫描，不生成 overview，不进入 BUILD，不调用付费 provider

### Verdict

```text
PASS
0 blocker / 0 major / 0 minor
```

### Round 2 blocker 关闭结果

| Round 2 finding | Round 3 结论 | 当前 PAGE SPEC / CONTRACT 证据 |
|---|---|---|
| B1：诊断缺 `providerProductId/protocol/modelId/endpointRedacted` | CLOSED | PAGE SPEC §9.3 以 `saved-sync provider`、`saved-sync local-whisper`、`paid-run` 三个判别分支读取 012/007 DTO；CONTRACT 的 006/007/008 run 与 012 history 已携带完整上下文，fixtures 与 TEST-MC-18 闭合；明确禁止 frontend 从草稿、DOM、缓存或其他配置猜 |
| B2：权威 disclosure 产生前就允许确认 | CLOSED | PAGE SPEC §11.2 已冻结“准备候选 → 展示本次披露 → 用户确认 → 执行”；005 pending 时确认 CTA 不渲染，005 成功后才展示 response，用户看见后才以该 version 调 006；旧/错 version 和草稿/revision 变化均作废确认且 provider call=0 |

### Gate 06 “No API, no UI” 定向回归

只读 binding 审计结果：

```text
PAGE SPEC §17 binding rows: 38
real operation / local+operation rows: 27
referenced API-MC ids: 17
referenced ids existing in SERVICE CONTRACT: 17/17
empty operation bindings: 0
planned / 规划中 rows: 0
paid path 005/006 bindings: present
diagnostic path 007/012 bindings: present
```

既有 compatibility seam 与 route 仍明确绑定
`settings.models.list/put/test`、`GET/POST /api/v1/settings-transfer/models`；其余真实交互均指向
API-MC-001..017 或明确的 local/static 行为。本轮指定的诊断复制与付费确认没有假按钮、无
frontend 猜测，也没有因 transport metadata 补齐而出现 binding 回归。

### Gate 与下一步

```text
Gate 06 page-spec-gate（Round 3 定向复评）: pass
Gate 12 / Gate 15b（确认②后定向机械复验）: pass
Gate 05 ui-gate: not-run
Overview visual confirmation③: REQUIRED / 尚未执行
BUILD: 不由本 review 授权
T-517 paid runtime readiness: NOT READY / HARD
Paid provider effect: readiness=false 时继续 fail closed，provider call=0
```

下一步只能按 PAGE SPEC §21 先生成一张系统总览图，取得用户视觉确认③；在该确认前仍禁止逐屏
mock、Stitch 与 BUILD。即使视觉确认通过，T-517 的 handler/broker/三态 receipt/reconcile/
cutover/conformance 机器证据未齐前，API-MC-006 与 API-MC-008 远端动作仍必须关闭。

### 验证记录

- `git diff --check -- <CONTRACT> <PAGE SPEC>`：exit 0；两文件当前均为 untracked，因此另做
  no-index 内容检查。PAGE SPEC 内容无 whitespace error；CONTRACT 仅有文件头 Markdown hard-break
  尾随空格，已在 CONTRACT 定向复验记为 minor。
- 只读 Node mapping audit：17/17 exact method/path/params/query/body，17 个 ID 与
  `(method,path)` 均唯一，GET body 与 path/body placement 无违规。
- 只读 Node diagnostic/order audit：006/007/008/012 四字段、判别 union、fixtures、
  TEST-MC-18、PAGE SPEC DTO 白名单，以及 005→披露→确认→006、TEST-MC-10 全部通过。
- 未运行 build、真实 Zod/TypeScript 实现测试、taskctl、reconcile、真机 E2E 或付费调用；
  本结论只覆盖当前文档的定向 Stage 2/3 Gate。
