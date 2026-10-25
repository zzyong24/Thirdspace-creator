# SPEC Review — current

- Task: T-642
- Verdict: CONCERNS
- Round: 3/3 (recheck)
- Spec receipt: e8c4568adfcd
- Review receipt: 7728c9ed44bd

## 当前有效问题

| ID | 严重度 | 需求锚点 | 失败模式 | 来源 |
|---|---|---|---|---|
| REV-002 | major | FR-CR-013 | 实现可先提交 Project、promotion 和 reference，再在创建或写入初始 `output_script` 版本时失败；当前文本只要求读回 `topicSource` 与 reference，且只定义 reference attach 失败的半成功验收。用户刷新会看到已创建的内容雷达 Project 却没有应随之进入的右稿，重试还可能造成重复 promotion 或 artifact version。 | changed-lines |

已销账：REV-001 (SPEC-LINE:160:8c186be8657f1ed1 明确排除必要事实、专有名词与清晰标注短引用的单独重合，并要求风险结果可解释；SPEC-LINE:202:ffa6c5e322fc317d 要求常规低/中/高风险测试覆盖三类允许样本及真实表达/叙事复用的升级情形。)

```spec-review-state
{
  "schema": "spec-review-state/v2",
  "task_id": "T-642",
  "round": 3,
  "max_rounds": 3,
  "review_kind": "recheck",
  "verdict": "CONCERNS",
  "summary": "REV-001 保持已解决；新增 1 项 major：改写初稿的 output_script 写入加入 promotion 原子链后，尚未定义其失败时的可观察全有或全无结果与验证。",
  "spec_path": "docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md",
  "spec_sha256": "e8c4568adfcd8dcf82c91468cd1dfde4c46899e128d1388c00001eddcb9b1442",
  "constitution_path": "docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md",
  "constitution_sha256": "07c9b61b58ca970feff57f1647c30a32c4af4fc92063c9a87952771403376950",
  "review_path": "docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.review.md",
  "review_mode": "cross-model-same-family",
  "model": "gpt-5.6-terra",
  "policy": "convergent-review/v2",
  "latest_event_hash": "b37a9f58b1d3de2270bb1262ace95eca8e3dab1b0c5dd5fd14619ac48666fc2a",
  "open_findings": [
    {
      "id": "REV-002",
      "status": "open",
      "severity": "major",
      "category": "data-integrity",
      "requirement_anchor": {
        "id": "FR-CR-013",
        "quote": "内容雷达确认的选题可进入现有 Project 创建流程，并把 item/source snapshot、canonical 视频 URL、选题 transform、定位版本及逐字稿哈希作为 Project 来源引用。"
      },
      "acceptance_anchor": {
        "id": "AC-CR-009",
        "quote": "Project 创建后，取消稿件候选不新增正式 artifact version；采纳只新增一次，重复提交幂等。"
      },
      "where": "§4.3 `candidates.promote` 中新增 `output_script` 初始版本的 promotion 一致性要求。",
      "failure_mode": "实现可先提交 Project、promotion 和 reference，再在创建或写入初始 `output_script` 版本时失败；当前文本只要求读回 `topicSource` 与 reference，且只定义 reference attach 失败的半成功验收。用户刷新会看到已创建的内容雷达 Project 却没有应随之进入的右稿，重试还可能造成重复 promotion 或 artifact version。",
      "evidence_kind": "spec-contradiction",
      "evidence_ref": "2026-08-01-content-radar-creative-handoff.md#§4.3,§7",
      "risk_class": "confirmed-requirement",
      "disposition": "mitigate",
      "remedy_type": "constraint",
      "scope_effect": "none",
      "origin": "changed-lines",
      "origin_ref": "SPEC-LINE:164:871214776df7798b",
      "suggestion": "把 `output_script` 初始版本及其 provenance 纳入与 Project/reference 相同的可观察原子后置条件：其写入、provenance 或读回失败时，刷新后不得留下本次新建的 Project、promotion、reference 或初始版本；幂等重试后恰有一组完整记录，并加入 artifact 写入失败注入测试。",
      "resolution_evidence": "",
      "parent_id": ""
    }
  ],
  "resolved_findings": [
    {
      "id": "REV-001",
      "resolution_evidence": "SPEC-LINE:160:8c186be8657f1ed1 明确排除必要事实、专有名词与清晰标注短引用的单独重合，并要求风险结果可解释；SPEC-LINE:202:ffa6c5e322fc317d 要求常规低/中/高风险测试覆盖三类允许样本及真实表达/叙事复用的升级情形。"
    }
  ],
  "receipt": "7728c9ed44bd"
}
```

## 用户裁决增量（2026-08-01）

- 用户明确否决“为了 100% 完整才显示”的全量强校验，确认创作型工具采用分段生成、阶段检查点、
  局部失败保留和用户编辑后采纳，见 `DEC-AI-025`。
- `REV-002` 指向的“promotion 同时创建正式 output_script”已由当前 SPEC 移除：promotion 只携带
  `adaptedDraftSeed`，首次用户保存才沿用既有编辑器创建正式 artifact。原三轮评审 receipt 原样
  保留，不补写第 4 轮 PASS；后续以失败注入测试和 BUILD Gate 证明新约束。
