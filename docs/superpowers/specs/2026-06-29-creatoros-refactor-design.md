# CreatorOS 彻底重构 — 设计文档(大白话版)

> 日期:2026-06-29 · 分支:`refactor/agent-and-structure` · 作者:用户 + Claude
> 风格约定:这份文档面向人读。术语只在第一次出现时解释一次,后面用大白话。

---

## 0. 一句话目标

把 CreatorOS 从「**后端塞在前端里、AI 只会发一段提示词**」改成:
**前后端各待各的房间;AI 是一个会一步步思考、会调工具、过程全程可见、模型可换、不绑任何厂商的「编导 Agent」。** 并且给脚手架(skill)立下规矩,以后不再犯同样的结构错误。

---

## 1. 为什么要改(现状的三个病)

1. **后端塞在前端里**:24 个业务模块全在 `frontend/src/server/modules/`。`backend/` 包几乎是空的,`ai-worker/` 包没人用(孤儿)。包边界是名义上的,代码摆放违反它。
2. **AI 是纯 LLM**:现在就是「发一段提示词、收一段文字」。没有工具、没有步骤、看不到过程、不能换模型。
3. **脚手架会重蹈覆辙**:它擅长逻辑设计(模块/契约/测试),但从不定义物理架构(谁住哪个房间、谁能调谁),也没有「门卫」拦截违规,所以结构会一直腐烂。

---

## 2. 改造分三块(互相独立,可分阶段)

| 块 | 干什么 | 价值 |
|---|---|---|
| **A. 立规矩** | 给脚手架 + 本项目加「房子图纸」+「门卫脚本」+「活文档/任务台账」+「大白话输出」 | 以后结构不再烂,新会话立刻懂项目、知道欠债 |
| **B. 理结构** | 把后端从 frontend 搬进 backend 包,三个房间(frontend / backend / worker)各就各位 | 前后端真正分离 |
| **C. 上 Agent Runtime** | 自研薄壳 Agent(Vercel AI SDK 中立层 + 函数工具 + ReAct 循环 + 步骤日志 + zod 卡输入输出 + 多模型),替掉现在分裂的两套 runner | AI 有了真 Agent 能力,可拓展、不绑厂商 |

---

## 3. 关键技术决策(已拍板)

- **模型中立层 = Vercel AI SDK**。注意:它**不是某厂商的 SDK**,而是「一个接口接所有厂商、随时换」的中立层(TS、原生支持工具调用 + zod 结构化输出)。借它省掉「翻译每家厂商工具格式」的脏活。**不上** Claude/Codex 的 Agent SDK(绑厂商),**不上** Python/LangChain/Pydantic(跨语言 + 框架锁定,零收益)。
- **工具机制 = 普通函数注册表**(先简单:`{name, 入参 schema, handler}` 的表)。以后真要 MCP 再包一层。
- **输入输出约束 = zod**(全项目已经在用),不引入 Pydantic。
- **多模型按「能力」配**:写文案→DeepSeek、做图→GPT、深推理→Claude……由每一步声明的 capability 决定(地基 `resolve.ts` 已有)。
- **统一 runner**:本项目里 `frontend/src/server/ai/*` 和孤儿 `ai-worker` 两套合并成一个 Agent Runtime。
- **保住的不变量**:AI 永远不直接写库,只产「候选」,用户采纳后由后端 service(带 ownership 守卫)落库。

---

## 4. 物理架构目标(SYSTEM_ARCHITECTURE 的核心)

三个房间 + 一份合同。**谁能 import 谁,是硬规则,由门卫脚本执行。**

```
contract(合同:zod 定义的操作/资源/工具 schema)
   ▲           ▲              ▲
   │           │              │
 frontend    backend        worker
 (页面/UI)   (24 模块 +      (Agent Runtime +
            service ports)   抓取/转写等后台活)
```

依赖规则(初版):
- `frontend` 只能 import `contract`(以及通过 RPC 调 backend)。**不准含业务模块。**
- `backend` 只能 import `contract`。模块之间只通过 service port,不准互相 import 对方的 repository。
- `worker` 只能 import `contract` + `backend` 的 service port。**写库必须经 backend service,不准直连 PG。**
- `contract` 谁都不 import(最底层)。
- Agent SDK / Vercel AI SDK 只准出现在 `worker`(或 backend 的 ai-runtime 子包),不准在 `frontend`。

> 关于「后端 vs worker」的部署:第一阶段 backend 仍可由 Next.js 进程内承载(改的是**代码归属**,不是马上拆进程);worker 作为独立进程引入。队列(Redis + BullMQ)列为**后续阶段**,不在第一波(YAGNI,等 worker 真跑起来再上)。

---

## 5. Agent Runtime 设计(C 块的核心)

四层,自下往上(对应给用户看过的那张图):

1. **模型中立层**:Vercel AI SDK,按 capability 解析到具体模型 + 用户 key(复用 `resolve.ts`)。
2. **工具箱(函数注册表)**:每个工具 = `{name, 入参 zod, handler}`。handler 调 backend 的 service port(读人设 / 搜热点 / 读知识 / 存候选 / 出可视化)。写类工具只产候选,不直接落库。
3. **Agent Runtime(自研薄壳)**:ReAct 循环 = 想 → 模型说要调哪个工具 → 执行 → 把结果喂回 → 再想,直到出最终结果。带护栏:最大步数、超时、最终输出用 zod 校验(不合格重试)。
4. **Skill(每个 AI 节点一个)**:= 提示词 + 允许用哪些工具 + 用哪个 capability + 输出 schema。换/加节点 = 加一个 skill 文件 + 注册几个工具,不动框架。

**步骤事件流(你要的「窗口日志」)**:Runtime 每一步发一个事件(想了什么 / 调了什么工具 / 看到什么结果),落 `ai_task_steps` 表 + 推给前端,窗口里实时显示「第 1 步读人设…第 5 步生成可视化」。今天的轮询(getTask)升级成步骤流。

**即时可视化**:Agent 最后产出一个「可视化 spec」(HTML/SVG/JSON),前端按 spec 渲染——每次现生成,不是写死的固定卡。

---

## 6. 脚手架闭环(A 块,立规矩)

机制进 skill(通用),数据进项目仓(实例)。五件事:

1. **房子图纸 gate**:实现前必须先产出 `SYSTEM_ARCHITECTURE.md`(三房间 + 依赖规则 + 谁写库),否则不准写实现代码。
2. **门卫脚本** `boundary-scan.mjs`:把依赖规则做成可执行检查(如「frontend 里出现业务模块 → 报错」),接进 `reconcile.mjs`,违规即 `✗ exit 1`。
3. **活文档 `PROJECT.md`**:新会话只读这一个文件就懂项目。一半生成(模块地图/ER/op 表/开放任务/架构漂移),一半人写(定位/为什么)。由 `pmem sync` 心跳重新生成 + 盖 SHA;落后 HEAD 太多没 sync 就报警。
4. **任务台账 `TASK_LEDGER.jsonl`**:落盘、跨会话。新会话立刻看到 open/wip/blocked。和会话内 Task 工具双向同步。
5. **大白话 + 配图输出规则**:skill 产出的设计/解释,必须有人能看懂的版本 + 一张图,不能只有术语 spec。(本文档即范例。)

---

## 7. 分阶段落地(每阶段都可独立验收)

> 原则:每阶段结束 `pnpm verify`(typecheck + 全测试)绿;门卫脚本从红逐步变绿;每步诚实置 0、不编。

- **Phase 0 — 清理**(已完成):分支/worktree 清干净,转圈修复并入 main,开 `refactor/agent-and-structure`。
- **Phase 1 — 立规矩地基**:写 `SYSTEM_ARCHITECTURE.md`(房子图纸)+ `boundary-scan.mjs`(门卫,先红)+ `TASK_LEDGER.jsonl` + `PROJECT.md` 生成器骨架 + `pmem sync` 壳(包住已有 reconcile + codegraph sync)。**不动 24 模块**,低风险。
- **Phase 2 — 理结构**:把 24 个业务模块从 `frontend/src/server/modules/` 搬进 `backend/src/modules/`;frontend 通过 contract/RPC 调;门卫脚本对应规则转绿。分模块小步搬,每搬一批 `pnpm verify` 绿。
- **Phase 3 — Agent Runtime 地基**:在 `worker`(或 backend 的 ai-runtime 子包)搭薄壳:Vercel AI SDK 接入 + 函数注册表 + ReAct 循环 + zod 输出校验 + 步骤事件 + `ai_task_steps` 表。先用「选题」一个节点端到端打通(含窗口步骤日志)。
- **Phase 4 — 节点迁移**:把现有 ~13 个 runner 逐个改写成 skill + 工具,跑在新 Runtime 上;删掉孤儿 `ai-worker` 和旧 `frontend/src/server/ai/*`。
- **Phase 5 — 多模型 + 即时可视化**:按 capability 配 DeepSeek/GPT/Claude;Agent 产可视化 spec、前端按 spec 渲染。
- **Phase 6(后续,YAGNI)**:Redis + BullMQ 持久队列 + worker 独立进程;DB 写属主收口。

---

## 8. 不做什么(YAGNI 边界)

- 第一波**不**拆独立后端进程、**不**上队列(等 worker 真跑起来、确有并发/重试需求再上,即 Phase 6)。
- **不**引入 Python/Pydantic/LangChain/Dify(除非某个工具真离不开 Python,且只作为被调用的工具)。
- **不**做可视化 builder UI(Agent 现生成 spec 即可)。
- **不**删远程 `origin/*` 分支(用户自理)。

---

## 9. 风险与对策

- **大搬迁打断现有功能**:分模块小步搬 + 每批 `pnpm verify` 绿 + 门卫脚本逐条转绿;随时可回退分支。
- **Agent Runtime 自维护成本**:薄壳 + Vercel AI SDK 扛掉厂商差异;护栏(步数/超时/zod)防跑飞。
- **文档腐烂**:`pmem sync` + staleness 检查让「忘更新」变 CI 失败,而非悄悄烂。
- **范围过大**:严格按 Phase 推进,一阶段一验收,绝不一次性推倒。

---

## 附:Phase 2 搬迁配方(已在 taxonomy 验证到绿)

一次性地基(已做):`backend/package.json` 加 subpath 导出 `"./modules/*"` → `./src/modules/*/index.ts`。
**关键:`backend/src/index.ts` 不回引模块,所以模块内 `@creatoros/backend` self-import 无循环。**

每个模块的机械步骤:
1. `git mv frontend/src/server/modules/<m> backend/src/modules/<m>`(测试一起搬,自动归 backend vitest 跑)。
2. 改所有消费方:`@/server/modules/<m>` → `@creatoros/backend/modules/<m>`(多数只有 persistence-client)。
3. 验证四件套全绿:backend typecheck + backend test + frontend typecheck + dispatch/persistence 组合测试。
4. `node orchestrator/process/boundary-scan.mjs --update-baseline` 收紧基线(R1 递减)。

**搬迁顺序(由依赖图决定,不能乱搬):**
- ✅ `taxonomy`(0 个 `@/` 引用,真叶子,已搬,门卫 R1 276→266)。
- ⚠️ 先安家**共享依赖**,否则叶子模块的 `@/` 引用会断:
  - `identity`(几乎所有模块 re-export 它的 `OwnershipError` + RequestContext 基座;它自身还 import `@/server/mock-backend/store`)。
  - `@/fixtures/canonical`(seed fixtures)、`@/server/persistence-*`。
  - 建议:把共享的 `OwnershipError` 等错误类下沉到 `backend/src/errors`(让模块从 `@creatoros/backend` 取,不再依赖 identity 模块),再搬其余。
- 其余模块 0~1 跨模块耦合,共享依赖安家后可批量(workflow 一 agent 一模块,worktree 隔离)。

发现的隐藏 bug(已修):backend `project-repository.test.ts` 缺 `briefDetail` 字段——旧 `pnpm verify` 没跑 backend typecheck,被新结构揪出。

---

## 附:Phase 3 构建计划(Agent Runtime,已验证真实 API)

**已装真包**:`ai@7.0.4` + `@ai-sdk/openai@4` `@ai-sdk/anthropic@4` `@ai-sdk/deepseek@3` `@ai-sdk/openai-compatible@3`(进 `ai-worker` 包)。
**API 取自 node_modules 真实 .d.ts(非猜)**:
- 工具:`tool({ description, inputSchema: zodSchema, execute })`(导出自 `ai`)。
- Agent 循环:`generateText({ model, system, prompt, tools, stopWhen: stepCountIs(N), onStepFinish })` —— `stopWhen`/`stepCountIs`/`onStepFinish`/`hasToolCall` 均确认存在;另有 `Agent`/`ToolLoopAgent` 类可选。
- 结构化输出:`generateObject({ model, schema })` 或 `generateText({..., experimental_output: Output.object({ schema }) })`(`Output` 确认导出)。
- 测试可注入:`MockLanguageModelV4`(from `ai/test`)+ `simulateReadableStream` —— 不用真 key 跑确定性单测。
- Provider 工厂:`createOpenAI/createAnthropic/createDeepSeek/createOpenAICompatible({ apiKey, baseURL })`(用户自带 key + relay)。

**现状(架构地图)**:`frontend/src/server/ai/` 有 **13 个 runner**,两套执行路径——A) `runClaudeAgent`(订阅 SDK,topic/research 用,不可换模型)B) `llmCompleter`(provider 网关,其余 11 个)。`ai-worker` 是**孤儿包**(已有 state-machine/ports/agent-runner-factory/fake-agent-runner/candidate-schemas + 各节点 SKILL.md)。触发在 `persistence-client.ts:1602–1964` 的 `void runX()` fire-and-forget。`ai.service` 状态机:queued→running→awaiting_confirmation→succeeded/failed/cancelled;唯一写口 `recordCandidate`。

**构建步骤**:
1. **复活 `ai-worker`** 当 Agent Runtime 家(它已有 skills + 状态机骨架);新增 `provider-factory.ts`:把现有 `ResolvedLlmConfig`(apiFormat/baseUrl/model/token,resolveLlmConfig 已按 capability 解析)映射成 AI SDK `LanguageModel`。
2. **工具注册表** `tools/`:`{ name, inputSchema(zod), execute }` → 包成 `tool()`。execute 调 backend service port(读人设/搜热点/读知识/存候选);写类工具**只产候选**不直接落库(保不变量)。复用 creative-context 的 reader。
3. **AgentRuntime**(薄壳):`generateText` + `stopWhen: stepCountIs` + `onStepFinish`→写 `ai_task_steps`;最终输出 `Output.object({ schema })` 校验,不合格重试。护栏:最大步数/超时。
4. **`ai_task_steps` 表**(新迁移)+ 契约 `ai.tasks.steps.list`(后续加 SSE 流):字段 taskId/stepNo/kind(think|tool_call|tool_result|final)/label/data jsonb/createdAt。
5. **先打通「选题」一个节点**端到端跑在新 Runtime,发步骤事件;`MockLanguageModelV4` 写确定性单测 + 真链路冒烟。
6. **迁移其余 12 节点** → skill+工具;删 `frontend/src/server/ai/*` 与旧 `runClaudeAgent` → **门卫 R2 清零**(AI SDK 离开前端)。
7. **前端步骤日志 UI**:把现在的转圈换成实时「第1步读人设…第5步生成可视化」。
8. **多模型(Phase 5)**:按 capability 配 DeepSeek写文案/GPT做图/Claude推理 —— 就是 provider-factory + 现有 resolve 的几行配置。
