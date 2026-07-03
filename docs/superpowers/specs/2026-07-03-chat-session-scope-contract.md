# AI 助手会话作用域契约:入口级隔离与延续

> SPEC 日期:2026-07-03 · 任务:T-096 · 状态:✅ PASS(2026-07-03 MiniMax 审,0 findings:scope/surface 解耦、服务端一等公民、三层隔离+双路恢复+迁移完整、10 条回归红线)——可开工
> 用户硬约束原话:「通过左下角的打开AI助手,这个每次就新建对话(这是 bug/错误行为)。每个按钮所启用的 AI 助手,它的上下文、记忆、历史记录都是隔离的,这个你一定要保证。比如我通过蒸馏进了 AI 助手,它能看到上一次的历史记录、上一次的对话详情。但通过选题进入的 AI 助手,绝对不能传入蒸馏的对话以及蒸馏的上下文。」
> 宪法依据:§6 编导对话化(统一 ChatBox,按页面/按钮注入 skill+数据)· §5 原则 4「诚实数据」。本 SPEC 不改产品方向,只给既有 ChatBox 补一层**会话归属契约**。
> 上游:T-055b/T-068(稿面右栏 `project:<id>` 会话隔离,已落地)· T-080(深链残参随关闭清除,已落地)· T-094(蒸馏改走 Copilot,**依赖本契约留的隔离位**)。

## §0 问题与目标

现状的 ChatBox 会话归属是「借来的」:会话延续靠**客户端 localStorage 单指针**,归属键 `persistKey` 兼任两职(既定技能装配的 surface,又当会话桶名),服务端 `ai_conversations` 表**没有任何作用域字段**。后果正是用户点名的两条:

1. **左下角全局入口没有自己的会话桶**——它回落到选题桶(`topics`),延续与否取决于一个易失的 localStorage 指针,断链即表现为「每次新建对话」。
2. **入口之间零隔离保证**——「历史记录」面板列的是**该用户全部会话**(不分来源),任何入口都能看到并切入其它入口的会话;蒸馏一旦走 Copilot(T-094),蒸馏会话会直接混进选题入口的历史列表。

目标:定义正式的**会话作用域(scope)契约**——scope 成为服务端一等公民字段;每个入口映射到唯一 scope;同 scope 再进 = 恢复最近会话 + 只见本 scope 历史;跨 scope 历史/上下文/恢复三层面零泄漏;测试矩阵锁死。

## §0.5 现状盘点(实锤,全部查证于当前代码)

### A. 会话存储与 key 机制

| 层 | 事实 | 位置 |
|---|---|---|
| DB 表 | `ai_conversations(id, user_id, project_id nullable, title, created_at, updated_at)`——**无 scope/surface 字段**;`ai_messages` 子表经 requireConversation 归属门到达 | `backend/src/schema/ai.ts:31-49`(DDL 同文件 `AI_DDL`,init 时应用,无迁移 runner) |
| 契约资源 | `aiConversationResource` 同上字段,无 scope | `contract/src/resources/ai.ts:9-16` |
| 契约 op | `ai.conversations.list`(仅 paginationQuery,**无 scope 过滤**)/ `ai.conversations.create`(body 仅 title+projectId)/ `messages.list` / `messages.create` | `contract/src/operations/ai.ts:18-57` |
| 流式入口 | `POST /api/chat`:body 带 `conversationId` 则续接;缺省 **lazy 建新会话**(title=首条用户消息前 24 字),响应头回 `x-conversation-id` | `frontend/src/app/api/chat/route.ts:91-100,134-136` |
| 前端指针 | localStorage 键 `copilot:conv:<persistKey>` 存「当前会话 id」;`persistKey = embed?.persistKey ?? surface` | `frontend/src/features/copilot/conversation-persistence.ts:17-22`;`ai-copilot-content.tsx:620` |
| 读回 | 挂载/persistKey 变化时读指针 → `listMessages` 读回填充;**读回失败即清指针、降级空会话** | `ai-copilot-content.tsx:792-820`(清档在 `:804-811`) |
| 历史面板 | 「历史记录」按钮 → `listConversations({page:1,pageSize:20})`——**全用户、不分来源的前 20 条**;点某条即切入该会话 | `ai-copilot-content.tsx:828-856` |
| 新对话 | 清指针+清消息,下轮 `/api/chat` lazy 建新会话(无 scope 概念) | `ai-copilot-content.tsx:859-866` |
| surface→skill | `SURFACE_SKILL`:topics/calibration/positioning/review/project;未知 surface 回落 `chatbox.topic` | `frontend/src/server/ai/chat-context.ts:75-90` |

### B. 现有入口清单与当前会话行为(穷举)

| # | 入口 | 深链/挂载 | 当前 persistKey(=会话桶) | 位置 |
|---|---|---|---|---|
| 1 | 左下角侧栏「打开 AI 助手」 | `?copilot=open`(无 surface) | **`topics`(借选题桶)** | `frontend/src/components/shell/sidebar.tsx:310` |
| 2 | 首页底部 AI 助手条「开始对话」 | `?copilot=open` | 同上 `topics` | `frontend/src/features/dashboard/dashboard-page.tsx:131` |
| 3 | 「⌘K 全局唤醒」徽标 | **假承诺**:⌘K 实际绑定 /search(T-051),浮层徽标无监听 | n/a(死入口,T-048 审计已记) | `components/overlays/ai-copilot-dialog.tsx:60-62`;`components/shell/global-search-hotkey.tsx:18` |
| 4 | 选题页一键岛(4 种出题依据) | `?copilot=open&surface=topics&fn=topic.generate&prefill=…` | `topics`(**与 #1/#2 同桶,互相覆盖**) | `frontend/src/features/topics/topic-generate-island.tsx:93` |
| 5 | 校准「在对话里诊断」 | `surface=calibration&fn=calibration.diagnose&selKind/selId/selTitle` | `calibration` | `frontend/src/features/calibration/calibration-interactive-region.tsx:1018` |
| 6 | 定位「生成定位提案」 | `surface=positioning&fn=positioning.generate` | `positioning` | `frontend/src/features/positioning/generate-positioning-island.tsx:28` |
| 7 | 复盘「在对话里复盘」 | `surface=review&fn=review.analyze&selKind=project&selId=<id>` | `review`(**与右栏 #9 的 project:<id> 不同桶**——同一条作品两套会话) | `frontend/src/features/review/review-analyze-island.tsx:26` |
| 8 | 经验「记一条经验」 | `surface=experience&prefill=记一条经验:` | `experience`(SURFACE_SKILL 未注册,技能回落 chatbox.topic) | `frontend/src/features/experience/experience-interactive-region.tsx:127` |
| 9 | 稿面右栏「编导对话」(常驻内嵌) | embed props(非 URL) | `project:<id>`(T-055b 已隔离) | `frontend/src/features/draft-workbench/draft-chat-rail.tsx:32` |
| 10 | 复盘页右栏(同一 rail) | StageChatWrapper 包 review 子页 | `project:<id>`(与稿面同源延续,T-068 用户裁决认可) | `frontend/src/app/(creator)/projects/[projectId]/stage-chat-wrapper.tsx:20-43` |
| 11 | 稿面选题卡「让编导帮你填」 | `surface=project&fn=brief.fill&selKind=project&selId=<id>` | **`project`(裸 surface,BUG:与右栏 `project:<id>` 不同桶)**——深链打开的是浮层而非右栏,同一项目对话断成两条 | `frontend/src/features/draft-workbench/topic-card.tsx:100-105` |
| 12 | 知识库倾倒场「蒸馏」 | 当前**非 Copilot**(传统输入框 → POST /api/knowledge/distill + 批量确认门);T-094 将改走 Copilot 对话 | 无会话(**本契约必须预留隔离位**) | `frontend/src/features/knowledge/knowledge-dump-zone.tsx:4-13` |

### C. 「左下角每次新建对话」根因链(file:line)

左下角的延续机制是「借桶 + 客户端单指针」,链上四个断点,任一断裂即表现为「每次打开都是新对话」:

1. **无自有作用域**:`sidebar.tsx:310` 的 href 是裸 `?copilot=open`,不带 surface → `ai-copilot-content.tsx:609-610` 回落 `DEFAULT_SURFACE="topics"`(`:509`)→ 全局入口的会话桶 = 选题桶。它没有「全局会话」这个概念,谈不上延续全局历史。
2. **同桶互相覆盖**:选题一键岛(#4)同样写 `copilot:conv:topics` 指针——从选题岛点「新对话」或开新会话,左下角的「上次会话」指针即被覆盖/清除(`ai-copilot-content.tsx:859-866` 清的是同一个键)。
3. **延续只有客户端单指针,服务端无恢复路径**:`ai_conversations` 无 scope 字段(`backend/src/schema/ai.ts:31-38`),没有「按入口取最近会话」的读法。localStorage 一旦缺失(清缓存/换浏览器/隐私模式——`conversation-persistence.ts:28-36` 全部静默降级为 null)→ 必然 lazy 新建(`app/api/chat/route.ts:93-99`)。
4. **读回失败即毁档**:`ai-copilot-content.tsx:804-811` 指针读回失败(网络错/会话删)直接清指针降级空会话——之后永远新建,无服务端兜底可自愈。

### D. 「历史记录」按钮当前列的范围

**该用户全部会话的最近 20 条,不分任何来源**(`ai-copilot-content.tsx:833-838` → `listConversations` 无 scope 参数,`backend/src/modules/ai/ai.transport.ts:59` 仅按 user 过滤)。即:今天从任何入口打开历史面板,都能看到并一键切入其它入口的会话——与用户硬约束「选题入口绝对不能传入蒸馏的对话」直接冲突。

## §1 设计

### §1.1 核心概念:scope(会话归属)与 surface(技能装配)解耦

现状 bug 的总根源是 surface 兼任两职。本契约把二者拆开:

- **surface** 继续只管「装配哪个 skill + 注入哪些 facets」(`chat-context.ts` 现职,不动)。
- **scope** 是新概念:**会话的归属命名**,决定「历史列给谁看、恢复恢复哪条、新对话开进哪个桶」。服务端一等公民字段。

**scope 文法**(字符串,三段式,冒号分隔):

```
scope := "global"
       | "project:" <projectId>
       | "surface:" <name>
       | "surface:" <name> ":" <entityId>    // 扩展位,本期不启用
```

### §1.2 入口 → scope 总表(规范映射,穷举)

| 入口(§0.5 B 表编号) | scope | surface(技能装配,不变) | 说明 |
|---|---|---|---|
| #1 左下角侧栏 | `global` | topics(回落) | **修 bug 主体**:深链改带 `scope=global`,延续全局会话 |
| #2 首页 AI 助手条 | `global` | topics(回落) | 与 #1 同一桶(同为「无特定任务的全局助手」,产品语义一致) |
| #3 ⌘K 徽标 | n/a | n/a | 死入口:本期**摘掉假徽标**或标注真实行为,不接 copilot(⌘K 已属 /search,T-051 裁决) |
| #4 选题一键岛 | `surface:topics` | topics | 与 global 分桶——**左下角闲聊不再混进出题会话** |
| #5 校准诊断 | `surface:calibration` | calibration | 诊断对象经 selection 注入,不另分桶 |
| #6 定位提案 | `surface:positioning` | positioning | |
| #7 复盘一键岛 | `project:<id>` | review | **归并**:深链 selection.kind=project 时 scope 归 `project:<id>`,与右栏(#9/#10)同源——同一条作品的编导对话是一条线(T-068 既定语义),不再 review 桶/项目桶两套 |
| #8 记一条经验 | `surface:experience` | experience | |
| #9 稿面右栏 | `project:<id>` | project | 现状即此,持平 |
| #10 复盘页右栏 | `project:<id>` | project | 现状即此,持平 |
| #11 选题卡 brief.fill 深链 | `project:<id>` | project | **修裸 `project` 桶 bug**:带上 projectId,与右栏同一条对话 |
| #12 倾倒场蒸馏(T-094 Copilot 化) | `surface:knowledge-distill` | knowledge-distill(T-094 注册 skill) | **为 T-094 预留的隔离位**:蒸馏历史只在此 scope 可见 |

**映射规则**(供未来新增入口判定,写进代码注释与本表同源):
1. 入口聚焦某个具体项目(selection.kind=project 或宿主是项目页)→ `project:<id>`;
2. 入口聚焦某个工作面/功能 → `surface:<name>`;
3. 无任务的全局唤醒 → `global`;
4. 需要比 surface 更细的对象级隔离时才启用 `surface:<name>:<entityId>`(本期无此需求,YAGNI,只定文法)。

### §1.3 契约与存储改动

1. **DB**:`ai_conversations` 增列 `scope TEXT NOT NULL DEFAULT 'global'` + 索引 `idx_ai_conversations_user_scope (user_id, scope, updated_at)`。DDL 追加进 `AI_DDL`(`ALTER TABLE … ADD COLUMN IF NOT EXISTS` 幂等写法,与现有 init-DDL 机制一致,不引迁移 runner)。
2. **契约**(只加不删,gate-F3 契约零删除):
   - `aiConversationResource` + `scope: z.string()`;
   - `ai.conversations.list` query + `scope: z.string().optional()`——**传了按 scope 过滤,不传维持全量**(旧调用不破);
   - `ai.conversations.create` body + `scope: z.string().optional()`(缺省 `global`);
3. **/api/chat**:`ChatRequestBody.chatContext` + `scope`(必带,前端 resolver 保证);lazy 建会话时落 scope;**续接校验**:body 同时带 `conversationId` 与 scope 时,服务端核对该会话的 scope 与声明一致,不一致按 OwnershipError 语义拒绝(4xx)——把隔离锁在服务端,前端 bug/手工请求都穿不透。
4. **repository/service**:`listConversations` 增 scope 过滤参数;`createConversation` 落 scope。ownership 门(user_id)原样,scope 是其内层过滤。

### §1.4 延续语义(同 scope = 一条记忆线)

- **恢复**:进入某入口 → 前端 `resolveChatScope(入口参数)` 得 scope → 恢复顺序:
  1. localStorage 指针 `copilot:conv:<scope>`(快路,现机制保留,键名从 persistKey 换成 scope);
  2. 指针缺失/读回失败 → **服务端兜底**:`ai.conversations.list?scope=<scope>` 第一条(updatedAt 最新)即「该入口最近会话」,读回其消息。——这是对根因链断点 3/4 的根治:清缓存、换浏览器、指针毁档都不再失忆。
  3. 两路皆空 → 诚实空会话(该入口真的从没聊过)。
- **「新对话」按钮** = 同 scope 内新开一条:清指针清消息,下轮 lazy 建会话仍落**当前 scope**。绝不跨 scope、绝不影响其它 scope 的指针。
- **「历史记录」按钮** = 仅列当前 scope 的会话(`listConversations` 带 scope);点某条在同 scope 内切换。面板标题注明范围(如「本入口的历史会话」),不再假装是全局列表。
- **深链预填/预调**(fn/prefill/selKind…)语义不变:只影响本次打开的输入框与工具置顶,不参与 scope 判定(selection.kind=project 除外,见 §1.2 规则 1)。

### §1.5 隔离语义(三层面)与「系统注入 vs 会话历史」边界

按 scope 隔离的三层面:

| 层面 | 隔离要求 |
|---|---|
| 会话恢复 | 只恢复本 scope 最近会话;`/api/chat` 服务端校验 conversationId 属本 scope(§1.3-3) |
| 历史列表 | 只列本 scope;跨 scope 会话在列表中**不可见**(不是置灰,是不出现) |
| 上下文注入 | 另一 scope 的 `ai_messages` 历史绝不进本 scope 的模型上下文;深链参数(surface/fn/prefill/selKind/selId)随浮层关闭清除(T-080 已修,`overlay-controller.tsx:134-138`,列回归测试) |

**明确不算泄漏的全局共享(防过度隔离把产品做残)**:系统装配注入是**账号级事实底座**,对所有 scope 一视同仁地注入,与「会话历史」是两类东西:

- 定位 brief(positioningBrief)、经验库(learnings)、真实信号(signals)、知识库 facets、技能清单(skillsBrief)、诚实约束(honestyBlock)等 CreativeContext facets(`app/api/chat/route.ts:113-121` 的 runtime.context 展开);
- 用户在本次会话中主动 @ 的项目、主动带的 selection(用户亲手给的,不是别的入口漏进来的);
- `ai_tasks` 全局任务 feed(最近任务/继续任务卡)——它本来就是跨项目任务台账,不是对话记忆。

**判定准则一句话**:凡是「另一 scope 的对话消息/深链残参」流入 = 泄漏;凡是「账号级事实 + 用户本次亲手指定」= 共享。

### §1.6 迁移(存量会话归 scope)

- 增列时 `DEFAULT 'global'` 先兜底全部存量;
- 一次性 backfill(幂等 SQL,随 DDL init 执行):`UPDATE ai_conversations SET scope = 'project:' || project_id WHERE project_id IS NOT NULL AND scope = 'global';`——有项目归属的历史会话(稿面右栏产生的)回到 `project:<id>` 桶;
- 其余存量(topics/calibration/… 各浮层产生的,DB 里无从考据来源)**一次性归 `global`**:诚实取舍——旧会话仍可从全局入口的历史里找到,不假装能还原它们的来源;各 surface 入口从契约生效日起干净起步;
- localStorage 旧键:`copilot:conv:topics` 等旧 persistKey 键**不迁移、自然废弃**(新键按 scope 命名;服务端兜底恢复让旧指针丢失无感)。

## §2 切片(每片 0→1 做完,拆 BACKLOG 任务)

- **T-096a 契约+存储+服务端隔离门**:scope 列/索引/backfill DDL、契约三处加字段、repository/service/transport 的 scope 过滤与落库、`/api/chat` 的 scope 落库+续接校验。含 backend 单测/契约测/集成测。
- **T-096b 前端 scope 解析与入口改造**:`resolveChatScope` 单一纯函数(§1.2 总表即其真值表,单测穷举)、§1.2 表 12 个入口逐一改造(#1/#2 带 scope=global、#7/#11 归并 project:<id>、#3 摘假徽标)、恢复双路(指针→服务端最近)、历史面板按 scope、新对话同 scope、localStorage 键切 scope。含组件交互测试。
- **T-096c 防泄漏测试矩阵锁死 + T-094 预留位**:§3 矩阵全量落测试(跨层:backend service + /api/chat 路由 + 前端 interactions + overlay 残参回归);注册 `surface:knowledge-distill` scope 常量与 resolver 分支(T-094 到位即插)。

## §3 防泄漏测试矩阵(锁死,回归红线)

| # | 场景 | 断言 | 层 |
|---|---|---|---|
| 1 | scope A(surface:knowledge-distill)建会话后,scope B(surface:topics)拉历史 | B 的 listConversations 结果不含 A 的会话 | backend service + 前端 interactions |
| 2 | 伪造请求:/api/chat 带 A 的 conversationId + B 的 chatContext.scope | 4xx 拒绝,不续写、不读回 | 路由测试 |
| 3 | 左下角开→聊→关→再开 | 恢复同一会话(消息读回);不新建 ai_conversations 行 | 前端 interactions |
| 4 | 清 localStorage 后从左下角再开 | 服务端兜底恢复 global 最近会话(根因链 3/4 根治验证) | 前端 interactions(mock 契约) |
| 5 | 选题岛「新对话」后,左下角再开 | global 会话不受影响(不同桶,指针互不覆盖) | 前端 interactions |
| 6 | 深链(fn/prefill/selKind/selId)打开→关闭→左下角再开 | URL 无残参(T-080 回归)、输入框无残留预填、chatContext 不带上一入口 selection | overlay-routing 回归 + interactions |
| 7 | 复盘一键岛与稿面右栏同一项目 | 同一条会话(scope 均 project:<id>),消息互见——**同源是特性** | 前端 interactions |
| 8 | 存量迁移:projectId 非空/为空两类旧行 | 分别归 project:<id> / global;DDL 重复执行幂等 | backend 集成测 |
| 9 | 「历史记录」面板在各入口 | 仅列本 scope;条目数与 DB 按 scope 计数一致 | backend + 前端 |
| 10 | 系统注入不受隔离影响 | 任意 scope 会话的 system prompt 仍含定位 brief/skillsBrief(不过度隔离) | chat-runner 装配测试 |

## §4 全局约束

- 契约**只加不删**(list query/create body/resource 均为可选新增,旧调用零破坏);
- 不新增一级导航/页面,全部改动在既有 ChatBox 机制内(宪法 §10.5 撤回案后现行 IA 不动);
- 中文文案规范(历史面板范围提示等可见文案);诚实数据:空会话/空历史给诚实空态,不摆假行;
- 不写实现代码于本 SPEC;T-094(蒸馏 Copilot 化)开工前本契约须先落地 scope 预留位。

## §5 验收标准

1. **左下角延续(用户硬约束①)**:左下角打开 → 聊两轮 → 关闭 → 重开:看到上次对话全文;清浏览器 localStorage 后重开:仍恢复(服务端兜底);「历史记录」只列全局入口的会话。
2. **入口隔离(用户硬约束②)**:蒸馏入口(T-094 落地前用 surface:knowledge-distill 的测试桩)聊一轮 → 从选题入口打开:对话区空/或仅选题自己的历史,历史面板不含蒸馏会话,模型上下文(prompt 抓包)不含蒸馏消息;反向同样成立。
3. **同源归并**:同一项目的复盘一键岛与稿面右栏共享一条对话;选题卡「让编导帮你填」深链落进该项目会话而非裸 `project` 桶。
4. **服务端硬门**:手工 curl /api/chat 携他 scope 会话 id → 4xx;DB 中每条会话 scope 字段与其入口一致。
5. **§3 矩阵 10 条全部有对应测试且全绿**;`pnpm test` 全仓通过;真机走查 §1.2 表 12 个入口逐一核对 scope 行为。
