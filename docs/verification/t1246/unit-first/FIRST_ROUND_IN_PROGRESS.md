# T-1246 全量单元/集成测试首轮（进行中）

冻结源码 `533224f334c43cdb81a344424e420cad93784dd1`；contract/ai-worker/backend 执行树 `/Users/zyongzhu/.codex/worktrees/integrated-unit-acceptance/Thirdspace-creator`；frontend 执行树 `/Users/zyongzhu/.codex/worktrees/integrated-frontend-unit/Thirdspace-creator`。各树独占本轮测试生成的 `dist/.next`，不与开发包/浏览器共用。每包开跑前实际核 HEAD 与 253 项源码 SHA；`pnpm install --frozen-lockfile` 实际 exit 0，Vitest 4.1.8 / Node 25.9.0。

| 包 | 实际首轮状态 | 文件 | 用例 | 原始回执 |
|---|---|---|---|---|
| contract | exit 1 | 74 PASS / 2 FAIL | 456 PASS / 43 FAIL / 0 SKIP | `contract.log/json/-exit.json` |
| ai-worker | exit 1 | 151 PASS / 8 FAIL | 1437 PASS / 25 FAIL / 0 SKIP | `ai-worker.log/json/-exit.json` |
| backend | 仍运行，未签最终计数 | 待整包返回 | 待整包返回 | `backend.log/-exit.json` |
| frontend | 实际 exit 1；独立冻结树、3648.322s | 520 PASS / 38 FAIL / 1 SKIP（559） | 4911 PASS / 158 FAIL / 8 SKIP / 1 TODO（5078），另原log未处理拒绝1项 | `frontend.log/json/-exit.json` |
| 四包 typecheck | 等四包 Vitest 全部结束后串行 | 未发生 | 不适用 | 后续留原始回执 |

CLI `testTimeout/hookTimeout/teardownTimeout=180000`、`retry=0`、`bail=0`、`allowOnly=false`、`no-file-parallelism`、`maxWorkers=2`、`maxConcurrency=1`；原显式测试预算不篡改。原断言、数据、测试发现范围、opt-in skip 均保留，无筛选重试、无提前修复。

contract 原失败为入口对 registry 数量 404 的冻结断言 42 项，以及注册表新增 `GET /accounts/:accountId/collection-plan-readiness` 一项；未因数量断言失败直接判为生产缺陷或既有债。ai-worker 的 25 条原断言保留于 `ai-worker-failures.json`，包括 ACP 通知尾队列、聊天浏览器研究、Pi HTTP 结算/unknown、generation replay、Pi bundle 初始化、搜索请求身份、编导方法装配与 Whisper worker 复用。均待完整首轮结束后逐项集中归因修复。

本轮独占 PG 仅 `127.0.0.1:50028`；历史 55422 属于另任务，Node Socket 护栏在真实 connect 前明确拒绝，绝不连接/修改/停止。护栏已独立审查，runner 实际删除 `NODE_PG_FORCE_NATIVE` 并在每包实际子进程核 `preloaded=true`、`nodePgForceNativeDefined=false`；原硬编码 55422 的环境拒绝单列 ENV，不能误报产品 FAIL 或把它改成 PASS。原 native CLI 不可达证明仅覆盖默认 Node pg、预加载不丢失的已审路径；此护栏不是系统防火墙。

这些结果属于冻结源码的真实测试消费者、临时数据库/隔离协议及子进程证据。用户暂不授权原生 App，App 验收仍未执行；不会把单元/集成测试替代官方账户模型、浏览器或原生 App 全流程。

2026-10-11 并发范围更新：主线程在源码实际核到 backend 32 / frontend 15 个测试文件共写原树 `ai-worker/dist` 后建立第三棵 exact-533 独立 frontend 树，实际 frozen install exit 0。原配置精确静态候选 559（src 528、scripts 31、spec 0；不是最终实际用例数），无新增 exclude/selector；原 opt-in 原生 host 未激活，`package-local.test.mjs` 安装/启动端口为注入假 spawn，未启动 App。机器实际 32 GiB、启动前 memory_pressure 空闲 33%。fresh frontend 真正 started 后，精确核原等待 controller PID/命令并仅停止该 controller，不动 backend；新 controller 等待同一 frontend 回执及 backend，再做四包类型检查（frontend typegen 仅该独立树）。详情 `controller-deduplication.json` / `frontend-frozen-discovery.json`，不签资源永久无竞争或新增原生验收。

contract 原 Vitest 配置覆盖 `tests/**/*.test.ts` 与 `tests/endpoint-bootstrap.test.mjs` 共 76 文件，已实际全部返回；另有 `contract/src/assistant-system.test.ts` 与 `contract/src/internal/execution-worker.test.ts` 两文件原配置不 include，记录原发现范围缺口，不能把 76 冒称整目录 78 全测。

主线程后续独立实际回执：原配置外两份 contract src 文件已用临时独立配置补验 30/30 PASS、exit 0（`contract-extra*`），不覆盖原配置 76 文件的 43 FAIL。Rust 合法资源补齐后的真实 lib 声明 280、267 PASS / 0 FAIL / 13 ignored、134.02s / exit 0（`../rust-first/SUMMARY.json`），保留前置 101/0tests 的原失败；conditional Python与子--exact前缀覆盖边界按主报告列出，不代签原生 App。

frontend 全量首轮于2026-10-11T16:12:07.126Z真实返回，原log含未处理拒绝 Cannot update an unmounted root；定位settings-interactive-region.test.tsx:303 stale tree.rerender 经后续router.refresh触发。原158FAIL与1error分别保留，不能把下游受污染的缺席断言当模型/原生成功。后端仍运行，四类型检查仍未发生。
