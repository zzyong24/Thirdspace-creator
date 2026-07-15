# CreatorOS 审查后架构与产品文档完善实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以当前源码为事实底座，建立 CreatorOS 可持续维护的数据地图、功能模块串联和产品 PRD，并把 T-326 审查缺口转成可验证的修复后目标。

**Architecture:** 文档采用“双态模型”：AS-IS 只描述代码已经做到的行为，TO-BE 描述 53 项审查问题关闭后的发布目标。三份主文档以稳定 ID 互相引用：数据实体用 `D-*`，功能域用 `F-*`，产品需求用 `R-*`，验收门用 `G-*`；任何目标能力都必须能回指代码证据或待实现验收。

**Tech Stack:** Markdown、Mermaid、Zod contract、Next.js App Router、backend service/repository、Drizzle schema/migrations、PGlite/PostgreSQL、Tauri sidecar。

---

## 文件结构

- Create: `docs/CreatorOS-data-model.md` — 83 张现役 schema 表的完整目录、归属维度、关系、生命周期、AS-IS/TO-BE 数据治理规则。
- Create: `docs/CreatorOS-module-and-workflow-map.md` — 页面、contract operation、backend 模块、异步 runtime、数据表和状态机的端到端串联。
- Modify: `docs/产品定位.md` — 从 71 行定位宪法补全为可验收 PRD，纠正两阶段、视频制作、Pi/Vercel Runtime 等已与代码冲突的旧口径。
- Modify: `docs/superpowers/specs/2026-07-03-two-stage-project-design.md` — 加入“已被取代”警示，防止历史方案继续被误当成现行架构。
- Reference: `docs/research/2026-07-15-prelaunch-full-engineering-data-audit-research.md` — 53 项上线审查证据，不复制后失去追踪。
- Modify: `BACKLOG.md`、`orchestrator/TASK_LEDGER.jsonl`、`PROJECT.md` — T-327 状态与生成记忆。

## Task 1：冻结代码事实快照

- [x] **Step 1：确认工作树与代码快照**

Run: `git status --short && git rev-parse --short HEAD`

Expected: 只出现 T-327 文档/台账改动；记录当前 HEAD，若审查期间 HEAD 变化则重新核验受影响章节。

- [x] **Step 2：重建代码图并确认索引可用**

Run: `codegraph index --force . && codegraph status .`

Expected: index exit 0，status 显示 up to date；后续符号定义、调用关系优先用 `codegraph query/callers/impact`。

- [x] **Step 3：机械统计公开面**

Run: `rg 'pgTable\\(' backend/src/schema | wc -l && rg 'id:\\s*"[^"]+"' contract/src/operations | wc -l && find backend/src/modules -mindepth 1 -maxdepth 1 -type d | wc -l && rg --files frontend/src/app | rg '/page\\.tsx$' | wc -l`

Expected: 文档必须解释统计口径，并列出全部表、operation 分组、模块目录和用户页面，不能只写总数。

## Task 2：建立完整数据地图

- [x] **Step 1：生成 83 表实体目录**

逐个读取 `backend/src/schema/*.ts` 与 `backend/drizzle/0000..0039`，在 `docs/CreatorOS-data-model.md` 按 Identity、Account/Positioning、Creation、Assets/Knowledge、AI/Execution、Publishing/Ingestion/Analytics、Review/Learning、Scheduling/Search/Settings 分组列出：表名、主键、归属列、父锚、关键状态、约束方式。

- [x] **Step 2：画出四层数据关系图**

图必须同时覆盖：`users → platform_accounts → projects → content_outputs` 主干；候选与素材支线；publication/metrics/review/learning 飞轮；AI/Execution 候选与人工采纳门。图内软引用用虚线，真实 FK/唯一约束用实线，并在图下解释图例。

- [x] **Step 3：写明 AS-IS 风险和 TO-BE 不变量**

至少覆盖：`userId + accountId` 双归属、publication 唯一锚与 re-parent、事务/幂等、删除级联、AI 不直写领域实体、build 只读、审计溯源、空值诚实、数据保留与恢复。每条 TO-BE 绑定 T-326 finding ID 和可执行验收。

- [x] **Step 4：校验完整性**

Run: `node -e 'const fs=require("fs");const schemas=fs.readdirSync("backend/src/schema").filter(x=>x.endsWith(".ts"));const source=schemas.map(x=>fs.readFileSync("backend/src/schema/"+x,"utf8")).join("\n");const tables=[...source.matchAll(/pgTable\\("([^"]+)"/g)].map(x=>x[1]);const doc=fs.readFileSync("docs/CreatorOS-data-model.md","utf8");const missing=tables.filter(x=>!doc.includes("`"+x+"`"));console.log({tables:tables.length,missing});if(missing.length)process.exit(1)'`

Expected: `tables: 83`，`missing: []`。

## Task 3：串联功能模块与真实业务链路

- [x] **Step 1：建立功能域目录**

在 `docs/CreatorOS-module-and-workflow-map.md` 为身份/激活、账号/定位、选题、项目稿面、知识/素材、制作/执行、发布/日历、采集/自动化、指标/复盘/经验、搜索/通知、设置/模型、桌面运行时定义稳定 `F-*` ID。

- [x] **Step 2：建立页面到数据的追踪矩阵**

每个功能域必须列出：用户入口、前端页面/feature、route/RPC、contract operation、backend service、repository/schema、异步 runner、成功状态、失败/恢复状态、当前成熟度。成熟度只允许“已实现 / 部分实现 / 未实现 / 发布阻断”，不使用模糊百分比。

- [x] **Step 3：写出九条端到端序列**

至少覆盖：首启与账号、定位到选题、选题立项到稿面、知识/素材喂料、四决策到渲染确认、登记发布、每日采集、复盘到 learning 回流、自动化任务。每条以 Mermaid sequence/flow + 大白话步骤 + 异常补偿说明呈现。

- [x] **Step 4：明确状态机**

把 project/output、AI task、production/export、publication、ingestion/job run、review/learning、execution task 的合法状态与恢复动作列清；状态来源必须回指 contract/schema/service，禁止从旧 SPEC 猜测。

- [x] **Step 5：校验公开 operation 覆盖**

Run: `node -e 'const fs=require("fs");const files=fs.readdirSync("contract/src/operations").filter(x=>x.endsWith(".ts"));const ids=files.flatMap(x=>[...fs.readFileSync("contract/src/operations/"+x,"utf8").matchAll(/id:\\s*"([^"]+)"/g)].map(m=>m[1]));const doc=fs.readFileSync("docs/CreatorOS-module-and-workflow-map.md","utf8");const groups=[...new Set(ids.map(x=>x.split(".")[0]))];const missing=groups.filter(x=>!doc.includes("`"+x));console.log({operations:ids.length,groups,missing});if(missing.length)process.exit(1)'`

Expected: 所有 operation 顶级命名空间都有归属；未被 UI 使用的 operation 明确标为内部/遗留/待下线。

## Task 4：补全产品 PRD

- [x] **Step 1：重写文档状态与事实规则**

`docs/产品定位.md` 顶部写明：这是产品单一真值；代码是实现事实；冲突时先标红差异，不把代码 bug 升格成需求，也不把未实现设计写成已上线。

- [x] **Step 2：补齐产品骨架**

PRD 必须包含：目标用户/JTBD、核心价值与飞轮、成功指标和反指标、信息架构、项目生命周期、功能域需求、业务规则、异常/空状态、权限与数据归属、非功能要求、明确不做、版本范围、发布门槛、验收矩阵。

- [x] **Step 3：纠正旧口径冲突**

明确处理：当前三工作面“脚本 → 制作 → 复盘”与底层七值兼容状态并存；产品已恢复制作/渲染能力，因此旧“绝不做视频编辑器”改为“不做通用 NLE，但做编导决策驱动的受控成片”；Runtime 已同时存在 Vercel AI SDK 与受控 Pi 引擎，因此旧“只准 Vercel、禁 Agent SDK”改为能力路由与安全边界要求。

- [x] **Step 4：把 53 项审查发现纳入发布门**

不在 PRD 重复 53 段 bug 文字；按安全、数据正确性、可靠性、UX 诚实、桌面可分发、工程质量六类定义 `G-*` 门，并建立 `G-* → T-326 finding → 验证命令/场景` 矩阵。

## Task 5：一致性、自审与归档

- [x] **Step 1：交叉引用检查**

Run: `node -e 'const fs=require("fs"),path=require("path");for(const p of ["docs/产品定位.md","docs/CreatorOS-data-model.md","docs/CreatorOS-module-and-workflow-map.md"]){const s=fs.readFileSync(p,"utf8");for(const m of s.matchAll(/\\]\((?:<([^>]+)>|([^)]+))\\)/g)){const target=(m[1]??m[2]).split("#")[0];if(!target||/^[a-z]+:/i.test(target))continue;const q=path.resolve(path.dirname(p),target);if(!fs.existsSync(q)){console.error(p,"missing",target);process.exitCode=1}}}'`

Expected: 无 missing link。

- [x] **Step 2：禁止占位与模糊完成态**

Run: `rg -n '\b(TBD|TODO)\b|待补|以后再说|基本完成|应该可以' docs/产品定位.md docs/CreatorOS-data-model.md docs/CreatorOS-module-and-workflow-map.md`

Expected: 0 命中；确实未实现的能力使用“未实现”并绑定任务/验收，不用占位话术。

- [x] **Step 3：运行项目收尾**

Run: `node orchestrator/process/pmem.mjs set T-327 done && node orchestrator/process/pmem.mjs sync && node orchestrator/process/reconcile.mjs && codegraph index --force . && codegraph status . && git diff --check`

Expected: T-327 done，reconcile 0 error/0 warning，CodeGraph up to date，diff check exit 0。

- [x] **Step 4：提交**

Run: `git add BACKLOG.md PROJECT.md orchestrator/TASK_LEDGER.jsonl docs/产品定位.md docs/CreatorOS-data-model.md docs/CreatorOS-module-and-workflow-map.md docs/superpowers/specs/2026-07-03-two-stage-project-design.md docs/superpowers/plans/2026-07-15-creatoros-post-audit-architecture-documentation-plan.md && git commit -m 'docs(architecture): 补齐数据地图、功能链路与产品 PRD'`

Expected: 提交只包含 T-327 文档与台账，不包含产品源码。
