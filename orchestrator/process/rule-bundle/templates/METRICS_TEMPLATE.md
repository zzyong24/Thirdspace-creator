# METRICS（进化引擎度量·诚实面板）

> 每个 run 收口(`reconcile --consolidate`)append 一行。**只这两个指标有真分母**;其余随分母出现点亮,未校准标 `calibrating N/M`。**禁止**把 LED/rule 总数当成长指标(Goodhart)。

| run_at | totalRuns | repeat-failure-rate | guard-hit-rate | stale-rule-ratio | reuse-hit-rate |
|---|---|---|---|---|---|
<!-- append-only;calibrating 期后两列恒为 calibrating N/M -->
