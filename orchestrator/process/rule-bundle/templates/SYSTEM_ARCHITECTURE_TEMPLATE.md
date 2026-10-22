# SYSTEM_ARCHITECTURE — 物理架构(房子图纸)

> 这是本项目的「房子图纸」:定义有哪些房间、谁住哪、谁能调谁、谁写数据库。
> **规则不是口号,由 `orchestrator/process/boundary-scan.mjs`(门卫)执行**——违反即报错。
> 逻辑流程(spec→contract→design→build)管"做什么";本文件管"代码住哪 / 谁 import 谁 / 谁写库",二者正交。
> 实现前必读;改动拓扑必须**先改这里**,再改 `boundaries.config.json`(房子图纸 gate,见 `gates/02-architecture-boundary-gate.md`)。
> 适用 M / L 类；S 类使用 DEC-000 记录的紧凑物理形态，不创建空架构仪式。

---

## 1. 房间 + 合同(填你项目的真实拓扑)

```
                <contract>   (合同:schema 真相源,最底层,谁都不 import 它)
                  ▲             ▲                  ▲
                  │             │                  │
              <frontend>     <backend>          <worker>
             (页面 / UI)   (业务模块 +         (后台活:队列 /
                            service ports)      抓取 / 转写 / AI runtime)
```

- **contract**(`<dir>/`):唯一真相源(如 zod schema),定义每个操作/资源/AI 工具的入参出参。谁都不 import 它的上层。
- **frontend**(`<dir>/`):只放页面、UI、交互;经 contract client 走 RPC 调后端。**不准含业务模块。**
- **backend**(`<dir>/`):业务模块(每个 = service / repository / schema / transport);模块间只经 service port 协作。
- **worker**(`<dir>/`):后台执行体(Agent Runtime、抓取、转写等)。

> 部署说明:(填——如"第一阶段 backend 由 X 进程内承载,改的是代码归属不是拆进程")。

---

## 2. 依赖规则(谁能 import 谁)——门卫执行

> 每条对应 `boundaries.config.json` 的一条 rule。下面是通用范例(前后端分离 + AI SDK 隔离 + 模块间只走 port),按你项目改。

| 规则 ID | 规则 | 门卫检查(config rule) |
|---|---|---|
| **R1** | 后端业务模块不准在 frontend(前后端必须分离) | `forbidden-paths`:`frontend/src/server/modules` 下不准有文件 |
| **R2** | Agent SDK / AI SDK 只准在 worker / ai-runtime | `forbidden-import`:`frontend/{app,features,components}` 不准 import `@anthropic-ai/claude-agent-sdk`、`ai`、`@ai-sdk/*` |
| **R3** | 模块之间不准直接 import 对方 repository | `forbidden-import`:modules 内不准跨模块 import `*.repository`(`allowSameModule`) |

补充(尚未做成检查,但属硬规则,写清以便日后可执行化):
- `contract` 不 import 任何上层。
- `worker` 写库必须经 backend service port(带 ownership 守卫),**不准直连 DB**。
- **AI 永远不直接写领域实体**:只产「候选」,用户采纳后由 backend service 落库。

---

## 3. 谁写数据库(单写者)

- **唯一 schema 属主 = <backend>**(迁移单一来源)。
- frontend 不写库(走 RPC)。
- worker 不直连库,经 backend service port 写。
- 这保住:多租户 ownership 守卫不被绕过 + 迁移单一来源 + AI 候选-采纳边界。

---

## 4. 当前基线(重构起点)

门卫基线 **<N> 条违规**(`boundary-baseline.json`),目标随重构清零(ratchet 只降不升):
- R1:**<n>** —— (一句话:现状 + 哪个阶段清)
- R2:**<n>** —— …
- R3:**<n>** —— …

实时查:`node orchestrator/process/boundary-scan.mjs`
消减后收紧基线:`node orchestrator/process/boundary-scan.mjs --update-baseline`(必须伴随 DEC 记录理由;升基线接纳新违规 = 结构回归洗白,禁止)。

---

## 5. Agent 初始化（仅适用时填写，不适用删除）

### 内核与复用决定

- 真实任务、运行位置和恢复要求：<约束>。
- 选定内核/公开 API/版本：<选择及依据链接/核查日期>；未采用候选：<关键原因>。
- 原生能力复用：<模型、运行时与宿主分别提供什么>；产品补足：<必要缺口>。
- 唯一执行循环（所有 Agent 必填）：<内核/owner、工具结果回注、继续/完成、预算与取消；禁止裸 API 替代>；若有外层工作流：<各自状态、重试与生命周期>。

### 目录与依赖所有者

| 真实路径 | 职责与 owner | 允许依赖 / 公开 port | 禁止依赖 | 对应机器检查或人工检查 |
|---|---|---|---|---|
| <path> | <职责> | <方向> | <方向> | <证据> |

- 业务数据、候选、会话/checkpoint、产物的写入与生命周期：<分别说明>。
- 内核依赖的引入位置、lockfile、许可证与升级命令：<实际内容>。
- sidecar/工具进程（如有）的分发、启动、权限和清理：<实际内容>。

### 初始化验证

- 最小真实链路：<启动→内核→工具→结果/产物→业务读回>。
- 本项目适用的故障场景：<取消、重启、未知结果、权限或打包>。
- 命令与证据：<PROJECT_CONTEXT / 测试记录引用>。
- 未验证项及影响：<mock 与真实验证明确区分；无则写无>。
