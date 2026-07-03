# spec-review: 2026-07-03-copilot-skill-native-design

- review_mode: cross-family(MiniMax)
- verdict: PASS
- summary: 三块功能(brief.fill / 技能管理面 / 技能自感知)均指向宪法 §6 编导对话化与 §9.3 Skill 三位一体铁律,T-040 已交付的 prompts.put 零新增契约即插即用,确认门到位,范围完整无缩水,仅 minor 精度可提升。

### F1 [minor] §1.3 skillsBrief 注入
- issue: "约 10 行" 是模糊量词,无格式约束。不同 surface 白名单工具数不同(如 project surface vs. 其他),10 行是否适用全部存疑。
- suggestion: 明确格式约定,如:"按 `工具名 | 中文名 | 一句话用途` 三列输出,行数 = 白名单工具数,上限不超过 20 行(超长截断)",或改为"每工具一行,超出 20 行时分页/折叠"。
- 处置: 接受,已内联 [gate-F1]。

### F2 [minor] §1.1 技能详情 - facets 占位符说明
- issue: "facets 占位符 `{{xxx}}` 带说明清单"——"说明清单"语义模糊:是指 textarea 内已有 placeholder 文本,还是另起说明区,还是 tooltip?落地形态不明确。
- suggestion: 明确 UI 形态,例如:"facets 区域显示只读 JSON 小卡,每个字段旁 tooltip 解释含义;template textarea 内 `{{xxx}}` 自动高亮,鼠标悬停显示对应 facet 名称与含义"。这样实现 agent 不需自推断。
- 处置: 接受,已内联 [gate-F2]。

## 裁决

PASS(2 minor 全内联)。可开工 T-077a/b/c。
