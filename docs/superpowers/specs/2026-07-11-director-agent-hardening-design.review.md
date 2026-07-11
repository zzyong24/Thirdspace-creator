# SPEC 审核记录:director-agent-hardening-design(T-239)

- **裁决**:⚠️ **CONCERNS→已处置→可开工 T-239a~g**
- **review_mode**:① cross-family(MiniMax-m2.1,`mmx text chat`)。注:第二次重跑输出截断,以第一次完整 findings 为准(1 major + 1 minor,无 blocker → verdict=CONCERNS by 规则)。
- **日期**:2026-07-11

## findings 逐条处置(内联 SPEC)
- **[gate-F1 major] S4 缺「不造轮子」节** → 补 §2-S4 核实段:仓内 33 工具错误处理分散无统一门(T-239 调研 grep 实证);Vercel AI SDK tool() 无 error-envelope 中间层,wrap execute 是官方模式;LangChain wrapper 绑运行时不适配。结论=薄包装非重造。
- **[gate-F2 minor] chars/3 token 估算误差未交代** → 补 §2-S3:工程近似对中文偏保守,阈值取有效窗口 80% 缓冲边距,超即截窗不贴边。

## 结论
方向合宪(稳定易用=商用产品底线;确认门/模型可配等铁律全守);全部落现有 Vercel AI SDK 栈内无架构迁移;不抄清单明确(7 项);调研双侧 file:line 实证。**可开工 T-239a(工具门先行)→ b/c/d/e/f 并行独立 → g 可选。**
