# SPEC 审核记录:daily-topic-autopilot-design(T-235)

- **裁决**:⚠️ **CONCERNS→已处置→可开工 T-235a~e**
- **review_mode**:① cross-family(MiniMax-M2.7,`mmx text chat`;注:reviewer 输出里自标 homogeneous 系其角色文件描述干扰,实际执行为 mmx 跨家族调用)
- **日期**:2026-07-11

## verdict: CONCERNS(方向合宪·复用合理·无缩水;1 major + 4 minor)

逐条处置(全部内联 SPEC):
- **[gate-F1 major] S-D 归因×learnings 集成机制未明确** → 补 §2.4 边界段:两体系维度不同(选题级 vs 脚本级)/消费方不同(选题池·验证库 vs 脚本生成·复盘)/**不共写同一表、不互相触发**(发布实绩触发 vs 复盘编辑触发)/不去重(各答各的问题);关联锚=projectId 溯源,实验候选附归因引用。
- **[gate-F2 minor] S-C 对 T-225 依赖未标前置** → 已标注:T-225 已完成 ✅ 2026-07-11(三层修复真机跑通),非阻塞。
- **[gate-F3 minor] 归因枚举值未在 SPEC 内列出** → 补 §2.4:topic_type/hook_type/structure_formula 三组枚举全列(dy-- 模板为底可调);自由文本字段带逐字稿引用、无稿不产(T-224 诚实门同源)。
- **[gate-F4 minor] UI 预览确认节点未给出** → 补 §2.5:T-235e 开工前产 UI 预览稿交用户拍板,拍板后才写前端;a~d 后端切片不受此门约束。
- **[gate-F5 minor] 平台内证据「可选强化」无降级定义** → 补 §2.2:S-B 验收以 RSS+web 并行为准;平台内证据条件=sidecar 登录态+限流额度,失败降级纯 RSS+web。
- dy-- 外部引用无 codegraph 证据 → 接受(外部参照物,file:line 由 T-235 调研 subagent 实读产出)。

## 结论
方向合宪(飞轮复利/复盘反向沉淀/AI 出草稿人确认/防茧房硬前置);复用全在现成骨架(调度/出题装配/RSS 适配器/护栏/teardown 范式/逐字稿/蒸馏门,file:line 齐);边界清晰(6 项不抄+自动≠无门)。**可开工 T-235a→b→c→d→e(e 先预览)。**
