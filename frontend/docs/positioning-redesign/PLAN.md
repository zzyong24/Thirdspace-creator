# 定位中心重设计 + AI 生成定位 实现计划

> 用户审了 Stitch 出的 v1 设计稿并认可方向(2026-06-28)。照稿在真 React/shadcn 里重构,
> 并把审计发现的 1 级缺口「AI 生成定位」做成真功能(不能放假按钮)。

## 设计稿(Stage-07 工件,不直接塞进 frontend/src)
- `frontend/docs/positioning-redesign/redesign-v1.png` / `.html`
- Stitch:project `14030062683780995938`, screen `6f565bebc5bc481abc589aef7d4ab767`, design system `assets/0bef5224d6f6463db25f0ae1d849d9a8`
- 布局:① 页头 +「新建定位版本」② 英雄区 当前定位母版(一句话定位放大 + 8 facet 2×4 网格)③ AI 赋能带(✨AI 生成定位建议 + 校准 + 查冲突)④ 下游影响 可折叠 ⑤ 历史版本紧凑表;9 字段草稿表单移进「新建/编辑」抽屉

## 现状(已审计)
- positioning 后端 100% 真(creator_profiles + positioning_statements 表、user-scoped repo/service/transport、7 个 contract op、契合度 scorer)
- 读/写侧真:pages.positioning.get、profile.upsert、statements.create/list、gate.evaluate
- 下游消费真:每个 AI runner 经 CreativeContext 读 positioningBrief
- **缺口:无「AI 生成定位」** —— createdByType:'ai' 字段预留但无源;persistence-client:~1306 注释提到 positioning_revise runner 待补(OQ2)
- UI:`features/positioning/positioning-center.tsx` + `positioning-interactive-region.tsx`(两表单岛)+ `positioning-fit-badge.tsx`

## Phase A —— AI 生成定位后端切片(先做,补缺口)

照现有 AI-task 模式做(mirror topic/script/research-material runner:create task → 后台 runner 调 LLM → 落 result → FE 轮询 → 用户采纳)。

- A1 契约:新增定位生成 AI 能力。优先复用现有 `ai.tasks.*`(create/get/results/confirm),加一个 task type(如 `positioning.generate` 或 `positioning_revise`)。若需新 op 则补,registry 同步。
- A2 runner:`positioning-runner`(或在 ai 模块加分支)—— 读用户 CreativeContext(已有 positioningReader)+ 抖音账号数据/历史内容 → resolveLlmConfig(走 item A 可配置 LLM)→ 真 LLM 生成结构化建议 `{persona, field, audience, differentiation, capabilities[], oneLiner, keywords[3]}`(用 parse.ts 的 JSON 宽松解析)。
- A3 落地/采纳:result 结构化呈现;用户「采纳」→ positioningService.upsertProfile + createStatementVersion(**createdByType:'ai'**, 带 aiTaskId)。
- A4 装配:persistence-client 把 runner 接进 task 调度(去掉那条 OQ2 注释)。
- A5 测试:runner 单测(mock LLM provider,断言 prompt 含 positioning/抖音上下文、解析容错)+ 契约/transport 测 + createdByType:'ai' 落库。
- 验证:全测绿 + typecheck;真链路冒烟(设置里配好 LLM key 后,点生成 → 真 LLM 出建议 → 采纳 → DB 出 createdByType:'ai' 的 statement)。无 key 时按缺凭据优雅报错(不假装)。

## Phase B —— positioning UI 照稿重构

- B1 `positioning-center.tsx` 重排为:页头 → 英雄区(当前定位母版,一句话放大 + 8 facet 网格)→ AI 赋能带 → 下游影响(可折叠)→ 历史表。读真值不变(pages.positioning.get)。
- B2 草稿/编辑表单移进**抽屉/侧panel**(点「新建定位版本/编辑」打开),不再常驻。复用现有 profile/statement 表单逻辑(真 op)。
- B3 **AI 赋能带接 Phase A 的真功能**:「✨AI 生成定位建议」按钮创建 positioning.generate task → 轮询 → 展示建议 → 采纳。校准/查冲突按需(能做真就做,不能就先不放——不留假按钮)。
- B4 下游影响面板:展示**真实**的"这套定位如何约束下游"(从 profile 派生的说明,或链到下游),不编造假"规则"。
- B5 历史版本表:版本号/一句话/修改原因/时间/状态 pill/操作(设为当前·查看·复制为草稿)——设为当前/复制为草稿要么接真 op 要么不放。
- 视觉:严格用现有 shadcn 设计 token(SectionCard 等),对齐 Stitch 稿的层级,但用真组件,不抄 Stitch HTML。
- 验证:feature 测绿 + typecheck + 真链路(登录看页面、新建/编辑抽屉、AI 生成走通)。

## 不在范围
- 校准飞轮的"帮我修正定位"完整闭环(B3 先做生成;修正循环可下一步)
- 把 Stitch HTML 直接搬进 frontend/src(违反 Stage-07→Stage-11 分离)
