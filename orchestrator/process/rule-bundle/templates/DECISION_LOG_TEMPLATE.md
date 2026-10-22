# 决策记录

记录有影响的确认、假设、取舍和风险，普通实现细节不逐条造决定。以下字段由脚本读取，保留原名，填写内容使用中文。

```text
ID: DEC-001
Date: <日期或运行编号>
Stage: <阶段编号与名称>
Type: user-confirmation | default-assumption | tradeoff | accepted-risk | stage-skip | scope-change | technical-decision-candidate | technical-decision
Decision: <具体决定>
Rationale: <依据>
Pattern-Ref: <借鉴/复用的 PAT-NNN,或 none(并说明为何是新取舍)>
Asset-Ref: <复用的 assets/ 资产 id(MOD-NNN / PAT-NNN),或 none>
Source: <用户消息、产物路径或证据>
Affected Artifacts: <路径或编号>
Invalidates: <阶段、路径或 none>
Owner: <user | agent | team>
Revisit Trigger: <重新考虑的条件>
Status: needs-user-confirmation | active | superseded | deprecated
```

风险接受须符合 `rules/orchestrator-state-machine.md`，包含 `Violation`、`Why needed`、`Simpler alternative rejected because`、`Gate-Attempt`、`Gate-Evidence`，由用户明确接受并绑定具体阶段；不能把风险当作普通通过。

维护模式重新开启评审周期时，另需 `Authorization-Kind: process-review-cycle`、`Task-ID`、`Previous-Spec-SHA256`、`Previous-Constitution-SHA256`、`Allowed-Change-IDs`、`Max-Cycles: 1` 和唯一 `Nonce`。同一授权不可重放；范围和威胁批准仍使用各自结构化授权。

研究建议使用 `technical-decision-candidate`、`Owner: agent` 和 `Status: needs-user-confirmation`；超出授权的实际决定在用户回答后追加用户所有的有效决定。研究证据本身不是批准。

从建设切换维护需用户所有的决定与 `Delivery-Phase: maintenance`，由 `delivery-phase.mjs promote` 绑定干净提交。实际借用模式或资产时填写对应引用，不为普通复用制造额外决策。保留旧决定，使用新条目替代，不覆盖历史。
