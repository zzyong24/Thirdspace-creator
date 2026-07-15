# 评审记录 — 账号全域隔离 SPEC

- **review_mode**: cross-family(MiniMax，与作者 Claude 跨家族独立评审）
- **模型**: MiniMax（mmx text chat，api-key）
- **verdict**: **PASS**
- **日期**: 2026-07-15
- **传递纪律**: 只喂宪法(产品定位.md)+被审 SPEC，以第三方框架呈现，未暴露作者身份/自评/结论。

## Summary（评审官原话摘要）
SPEC 结构严谨、裁决清晰、与宪法 P-02/R-ACCOUNT 完全对齐。83 张表逐一裁决、9 个争议点显式标注待 gate、风险与不做清单完备。需注意：9 个 gate 未裁决前 S3/S4/S6 实施需 hold；§3.1 `project_target_platforms.account_id` 幽灵列需与 schema 作者确认。

## Findings（5 条，全 minor；无 blocker/major）

| # | severity | where | issue | 裁决 |
|---|---|---|---|---|
| 1 | minor | §3.1 project_target_platforms | 「幽灵列」建议删除但缺 grep/codegraph 实证 | **接受**：S1 开工前先 codegraph 实证该列引用，无引用才删，有引用则保留补 account 维 |
| 2 | minor | §9 C-01~C-09 | 9 争议点未裁前 S3/S4/S6 依赖悬空 | **接受**：C-01/C-07 等交用户拍板后回填 SPEC；S3/S4/S6 hold 至裁决完成（S1/S2 不依赖，可先行） |
| 3 | minor | §4.5/§6.2 深链 404 | by-id 号一致性 404 空态文案未列入空态矩阵 | **接受**：S4 实现时补 404 空态文案「该内容属于其它账号」+可选跳转，不做红屏/白屏 |
| 4 | minor | §3.2 knowledge C-01 | 推荐 A 案引 T-136 OQ1(2026-07-05)裁决，早于本拍板且未登记冲突 | **接受**：C-01 交用户确认（本轮已问）；确认后在 §10 冲突登记宣告覆盖关系 |
| 5 | minor | §4.1 analytics strict 聚合 | lenient→strict 后 GROUP BY 聚合空数据返回 NULL 的边界需逐条确认 | **接受**：S2 改 analytics.repository 聚合读时逐条验空账号聚合语义（返回空集非 NULL 崩） |

## 人的裁决
verdict=PASS，5 条 minor 全部接受并已转为各切片的实施约束（见上表「裁决」列）。**S1(schema)/S2(backend strict 门) 不依赖 9 个争议点，可在用户确认 C-01/模型配置后立即开工**；S3/S4/S6 待 C-01~C-09 全部裁决回填 SPEC 后开工。
