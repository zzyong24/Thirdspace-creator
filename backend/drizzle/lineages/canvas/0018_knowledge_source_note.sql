-- T-079a 知识资产数据层(SPEC docs/superpowers/specs/2026-07-03-knowledge-asset-redesign.md §1):
-- ① knowledge_items 加 source_note(出处与可信度一等公民,从标题里解放);
-- ② 存量标题前缀拆解 —— 「金句：/数据：/评论区高频问题:」是标题文本前缀而非类型系统,
--    一次性迁成结构化 type(quote/evidence/qa)+ source_note。
--
-- 拆解规则(迁移前已在真 DB SELECT 逐行验证,30 条中命中 12 条;规则按顺序执行,
-- 前一条改写后的标题不再命中后续规则,重复执行为 no-op,幂等):
--   A. `金句：X — 出处`      → type='quote',    title=X, source_note=出处(按最后一个「 — 」切)
--   B. `金句：X`(无出处)     → type='quote',    title=X
--   C. `数据：X — 出处`      → type='evidence', title=X, source_note=出处(当前存量 0 行,规则对称保留)
--   D. `数据：X(出处)`       → type='evidence', title=X, source_note=括注内容
--      ⚠ 仅当「标题末尾括注」含拉丁字母(出处均为专有名词如 Stack Overflow / RescueTime)
--      才视为出处;纯中文/数字括注(如「(主观自评却报告快 20%)」「(即 4-10 倍提升)」)
--      是限定语不是出处,保留在标题里(该判别式已对 5 行数据逐行验证,精确二分)。
--   E. `数据：X`(其余)       → type='evidence', title=X(限定语括注留在标题)
--   F. `评论区高频问题:X`     → type='qa',       title=X(冒号兼容半/全角;存量为半角)
--   其余(transcript/note/snippet/钩子：/案例： 等 reference)一律不动。
--
-- 迁移前→后对照(真 DB 实查样本,12 命中行全量):
--   knowledge-f80c3125-45 reference「金句：用了 Copilot 后打字确实快了,但我花在审它代码上的时间,和原来自己写差不多。」
--     → quote  title=「用了 Copilot 后打字确实快了,…和原来自己写差不多。」 source_note=NULL          (规则 B)
--   knowledge-f80c3125-48 reference「金句：AI 不是让你省时间,是把时间从「写」挪到了「读、审、改」。」
--     → quote  title=「AI 不是让你省时间,…」 source_note=NULL                                        (规则 B)
--   knowledge-f80c3125-51 reference「金句：工具给你的速度,经常被环境、依赖和上下文切换偷回去。」
--     → quote  title=「工具给你的速度,…偷回去。」 source_note=NULL                                    (规则 B)
--   knowledge-f80c3125-54 reference「金句：省时间的关键不是用 AI,而是把 AI 嵌进能跑通的工程流程里。」
--     → quote  title=「省时间的关键不是用 AI,…」 source_note=NULL                                     (规则 B)
--   knowledge-d9d1c660-62 reference「金句：The account was suspended … — 摘自 r/ClaudeAI 2024-11 高赞帖,原帖获 1.2k 点赞」
--     → quote  title=「The account was suspended …」 source_note=「摘自 r/ClaudeAI 2024-11 高赞帖,原帖获 1.2k 点赞」(规则 A)
--   knowledge-d9d1c660-70 reference「金句：时区、UA、TLS 指纹…审核的阈值。 — Reddit r/ClaudeAI 用户 @sysadmthrowaway 原帖,需核实」
--     → quote  title=「时区、UA、TLS 指纹…审核的阈值。」 source_note=「Reddit r/ClaudeAI 用户 @sysadmthrowaway 原帖,需核实」(规则 A)
--   knowledge-f80c3125-30 reference「数据：92% 的开发者在工作中会用到 AI 编码工具(Stack Overflow Developer Survey 2024)」
--     → evidence title=「92% 的开发者在工作中会用到 AI 编码工具」 source_note=「Stack Overflow Developer Survey 2024」(规则 D)
--   knowledge-f80c3125-39 reference「数据：企业员工日常被「上下文切换」消耗的时间约耗去生产时间的 40%(转述自 RescueTime 及 Asana 历年报告)」
--     → evidence title=「企业员工…生产时间的 40%」 source_note=「转述自 RescueTime 及 Asana 历年报告」  (规则 D)
--   knowledge-f80c3125-33 reference「数据：在 METR 2024 年…平均慢 19%(主观自评却报告快 20%)」
--     → evidence title=「在 METR 2024 年…平均慢 19%(主观自评却报告快 20%)」 source_note=NULL          (规则 E,括注是限定语)
--   knowledge-f80c3125-36 reference「数据:普华永道在使用 Harvey 后,部分合规/审稿类任务耗时压缩约 75%-90%(即 4-10 倍提升)」
--     → evidence title=「普华永道…压缩约 75%-90%(即 4-10 倍提升)」 source_note=NULL                    (规则 E)
--   knowledge-f80c3125-42 reference「数据：GitHub 测算 Copilot 用户每日 PR 合并量平均增加 13%-26%(具体数字依任务而异)」
--     → evidence title=「GitHub 测算…平均增加 13%-26%(具体数字依任务而异)」 source_note=NULL           (规则 E)
--   knowledge-f8b95a7b-36 note「评论区高频问题:SKILL 接口什么时候开放」
--     → qa     title=「SKILL 接口什么时候开放」 source_note=NULL                                       (规则 F)
ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS source_note TEXT;
--> statement-breakpoint
-- 规则 A:金句 带「 — 」出处(贪婪组按最后一个分隔切,出处段自身不含「 — 」,已验证)。
UPDATE knowledge_items SET
  knowledge_type = 'quote',
  source_note = btrim((regexp_match(title, '^金句：(.*) — (.*)$'))[2]),
  title = btrim((regexp_match(title, '^金句：(.*) — (.*)$'))[1])
WHERE title ~ '^金句：.* — .';
--> statement-breakpoint
-- 规则 B:剩余 金句 前缀(无出处)。
UPDATE knowledge_items SET
  knowledge_type = 'quote',
  title = btrim(regexp_replace(title, '^金句：', ''))
WHERE title ~ '^金句：';
--> statement-breakpoint
-- 规则 C:数据 带「 — 」出处(存量 0 行,与规则 A 对称保留)。
UPDATE knowledge_items SET
  knowledge_type = 'evidence',
  source_note = btrim((regexp_match(title, '^数据：(.*) — (.*)$'))[2]),
  title = btrim((regexp_match(title, '^数据：(.*) — (.*)$'))[1])
WHERE title ~ '^数据：.* — .';
--> statement-breakpoint
-- 规则 D:数据 末尾括注含拉丁字母 → 括注是出处(专有名词判别式,对存量 5 行精确二分)。
-- 括号兼容半角/全角(存量为半角)。
UPDATE knowledge_items SET
  knowledge_type = 'evidence',
  source_note = btrim((regexp_match(title, '^数据：(.*)[(（]([^()（）]*[A-Za-z][^()（）]*)[)）]$'))[2]),
  title = btrim((regexp_match(title, '^数据：(.*)[(（]([^()（）]*[A-Za-z][^()（）]*)[)）]$'))[1])
WHERE title ~ '^数据：.*[(（][^()（）]*[A-Za-z][^()（）]*[)）]$';
--> statement-breakpoint
-- 规则 E:剩余 数据 前缀(限定语括注留在标题)。
UPDATE knowledge_items SET
  knowledge_type = 'evidence',
  title = btrim(regexp_replace(title, '^数据：', ''))
WHERE title ~ '^数据：';
--> statement-breakpoint
-- 规则 F:评论区高频问题 → qa(冒号兼容半/全角;存量为半角)。
UPDATE knowledge_items SET
  knowledge_type = 'qa',
  title = btrim(regexp_replace(title, '^评论区高频问题[:：]', ''))
WHERE title ~ '^评论区高频问题[:：]';
