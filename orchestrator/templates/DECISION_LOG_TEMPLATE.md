# Decision Log

## Purpose

Record confirmations, assumptions, tradeoffs, accepted risks, and skipped stages so future agents do not need chat history.

## Decision Entry

```text
ID: DEC-001
Date: <date-or-run-id>
Stage: <stage id and name>
Type: user-confirmation | default-assumption | tradeoff | accepted-risk | stage-skip | scope-change
Decision: <what was decided>
Rationale: <why this is reasonable>
Pattern-Ref: <借鉴/复用的 PAT-NNN,或 none(并说明为何是新取舍)>
Asset-Ref: <复用的 assets/ 资产 id(MOD-NNN / PAT-NNN),或 none>
Source: <user message, artifact path, or evidence>
Affected Artifacts: <paths or IDs>
Invalidates: <stage IDs, artifact paths, or none>
Owner: <user | agent | team>
Revisit Trigger: <when this must be reconsidered>
Status: active | superseded | deprecated
```

## Completion Standard

- Any A-level question answer is recorded.
- Any default assumption that affects product behavior, data, cost, security, user trust, contracts, or release scope is recorded.
- Any accepted risk includes the user's explicit acceptance and revisit trigger.
- Any skipped stage includes reason, risk, and downstream impact.
- 借/建决策必须填 `Pattern-Ref`(借鉴优先的留痕,reuse 反链统计 + 模式遥测的锚点);若复用了 `assets/` 资产则填 `Asset-Ref`。

## Prohibited

- Do not hide decisions only in chat.
- Do not record vague decisions like "looks good"; name the artifact, scope, and consequence.
- Do not overwrite old decisions; append superseding entries.
