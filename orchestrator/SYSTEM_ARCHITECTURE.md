# SYSTEM_ARCHITECTURE — 物理架构(房子图纸)

> 这是 CreatorOS 的「房子图纸」:定义有哪些房间、谁住哪、谁能调谁、谁写数据库。
> **规则不是口号,由 `orchestrator/process/boundary-scan.mjs`(门卫)执行**——违反即报错。
> 实现前必读;改动拓扑必须先改这里(房子图纸 gate)。

---

## 1. 三个房间 + 一份合同

```
                contract  (合同:zod 定义的操作/资源/工具 schema,最底层,谁都不 import 它)
                  ▲             ▲                  ▲
                  │             │                  │
              frontend        backend            worker
             (页面 / UI)    (24 业务模块 +      (Agent Runtime +
                            service ports)       抓取 / 转写等后台活)
```

- **contract**(`contract/`):唯一真相源。zod 定义每个操作、资源、AI 工具的入参/出参。谁都不 import 它的上层。
- **frontend**(`frontend/`):只放页面、UI、交互。通过 contract client 走 RPC 调后端。**不准含业务模块。**
- **backend**(`backend/`):24 个业务模块(每个 = service / repository / schema / transport)。模块间只经 service port 协作。
- **worker**(`worker/` 或 backend 的 `ai-runtime` 子包):Agent Runtime(ReAct + 工具 + 步骤日志)、抖音抓取、文件转写等后台活。

> 部署说明:第一阶段 backend 仍可由 Next.js 进程内承载——这次改的是**代码归属**(模块搬出 frontend),不是马上拆进程。worker 作为独立执行体引入。持久队列(Redis+BullMQ)是后续阶段(Phase 6),不在第一波。

---

## 2. 依赖规则(谁能 import 谁)——门卫执行

| 规则 ID | 规则 | 门卫检查 |
|---|---|---|
| **R1** | 后端业务模块不准在 `frontend`(前后端必须分离) | `frontend/src/server/modules` 下不准有文件 |
| **R2** | Agent SDK / Vercel AI SDK 只准在 worker / ai-runtime | `frontend/src/app,features,components` 不准 import `@anthropic-ai/claude-agent-sdk`、`ai`、`@ai-sdk/*` |
| **R3** | 模块之间不准直接 import 对方的 repository | modules 内文件不准跨模块 import `*.repository` |

补充(尚未做成检查,但属硬规则):
- `contract` 不 import 任何上层。
- `worker` 写库必须经 backend 的 service port(带 ownership 守卫),**不准直连 PG**。
- **AI 永远不直接写领域实体**:只产「候选」,用户采纳后由 backend service 落库。

---

## 3. 谁写数据库(单写者)

- **唯一 schema 属主 = backend**(drizzle 迁移)。
- frontend 不写库(走 RPC)。
- worker 不直连库,经 backend service port 写。
- 这保住:多租户 ownership 守卫不被绕过 + 迁移单一来源 + AI 候选-采纳边界。

---

## 4. 当前状态(2026-06-29,重构起点)

门卫基线 **308 条违规**,目标随重构清零:
- R1:**276** —— 24 模块还在 `frontend/src/server/modules`,Phase 2 搬进 `backend/src/modules`。
- R2:**31** —— AI SDK 泄漏到前端,Phase 3/4 收口到 Agent Runtime。
- R3:**1** —— 一处跨模块 repo 引用,搬迁时一并改成 service port。

实时查:`node orchestrator/process/boundary-scan.mjs`
