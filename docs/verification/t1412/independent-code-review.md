# T-1412 独立代码与聚焦证据审查

日期：2026-10-25。审核者：`/root/t1427_pi_diagnosis`。本审核者未参与 T-1412 实现；曾进行只读预审并提出两项问题，本轮对实现者通知冻结后的代码与证据复核。源码 HEAD：`4db7b52b5e24ad5b5e2c3744546b17416e913e9a`，实际内容以下列 SHA-256 为准。

**结论：PASS，仅限本次代码变更与已提供聚焦证据的独立审核；未发现仍需阻断本补丁的代码问题。** 原两项预审问题均已关闭。此结论不表示 T-1412 全部验收完成，不表示原八组 timeout-policy、完整 full reconcile、官方 Pi 402 或产品验收通过。

本轮只读代码、历史原件和日志，核算 JSON 与哈希，并对证据所指的本轮临时根做存在性检查；未执行测试、原八组、full、用户业务或模型请求。唯一写入为本报告。

## 1. 审核依据与变更边界

已读取已审 SPEC `docs/features/t1412-full-reconcile-isolation.md`、任务包 §1–9、六个变更路径，以及必要只读依赖 `owned-postgres.ts/.test.ts`、现有旧快照、预算/PG/CLI 证据。未修改被审实现、状态、审核程序或控制面。

六个变更路径为预算配置、归档 wrapper/测试、HyperFrames 原测试和其隔离 helper/测试。比较 `before/reconcile.config.json` 后确认：55 条 lesson 数量、ID、顺序、check、what、onFail 与其他非预算配置完全相同；只增加 `lesson_execution` 与逐项 `timeout_ms`。六处失效测试引用没有被这项任务偷偷删去，属于 T-1413 已登记的后续缺口。

## 2. 原预审问题关闭依据

| 预审问题 | 冻结实现与证据 | 结论 |
| --- | --- | --- |
| 仅核 PGID，未证明 detached 后代不能逃出原组 | `hyperframes-cli-isolation.mjs:105` 改为原生 `(deny process-fork)`。138–140 行实际尝试普通 `spawnSync` 和 `detached:true` 的 Node 派生，只有 `status:null` 且 EPERM/EACCES 才算拒绝；不是捕获任意错误就通过。最终能力回执两项均 true。进程派生被禁止，而非依赖扫描其他 PGID 追认；只批准该“参数拒绝前无须派生”的锁定 CLI 路径。 | 关闭。该证据涵盖 Node 普通派生和 detached/setsid 派生，不泛化为任意程序/宿主。 |
| 原隔离 RED 只有静态源码正则 | `legacy-cli-planning-red.mjs` 读取保存的原 `before/hyperframes.test.mjs`，在 VM 内执行其真实旧 callback；fs、spawnSync、process.env、execPath 均为合成对象。`cli-dynamic-planning-red-v2.log` 记录 HOME/合成秘密继承、cwd 未设置、原生边界缺失，随后真实断言失败。没有启动旧 CLI 或任何真实子进程。 | 关闭证据缺口。此为本次补充回放旧快照所发生的动态规划 RED，不冒充早先实现前已发生的历史红测。原静态 RED 仍保留原性质。 |

补充回归并未用“能输出 EPERM”代替真实 CLI：最终 `focused-final.log` 包含锁定 CLI 的真实子进程结果 `status:1`、`signal:null`、`remainingOwnedProcesses:0`，stderr 为原 `Invalid browser-timeout` 与 120 秒下界提示，无 ENOENT/缺模块。

## 3. 预算与 owned PostgreSQL

### 3.1 预算

当前策略 `minimum_timeout_ms:120000`、`default_timeout_ms:900000`；逐项预算可由 `budget-inventory.json` 对照原命令、初始化、内部预算和余量。最终纯计划三项测试证明现有 runner 接受 55 项有限计划、整体预算覆盖串行执行/清理/结算，且缺预算、低于下界和外层不足仍拒绝。审核时再次静态比较 55 项及其他配置守恒，无删门或改命令。

这些证据证明配置可形成计划，**不证明所有命令实际能在预算内完成**。原 frontend/worker 默认重试等既有行为未被本任务改掉；最终全量运行须保留真实超时/失败，不把纯计划结果当 full PASS。

### 3.2 归档 wrapper 真实准入

`run-archive-guard.mjs:6`–12 在启动 pnpm 前，分别对两个测试 URL 调用既有 `assertOwnedPostgresUrl`，再要求相同 URL 和同一本轮管理库。没有新造只验 hostname/port 的替代守卫，没有绕过 nonce 或允许旧固定端口。原三个 Vitest 目标及 `--maxWorkers=2` 原样保留。

补读的原 `owned-postgres.ts` 实际校验 marker/nonce、普通路径与 realpath、UID、0700 临时根、随机端口、独立管理角色、postmaster.pid 的目录/启动时刻/地址、进程出生时间/UID/二进制/dataDir。URL 拒绝密码、查询覆盖、非本轮管理身份及未登记库；Pool 在实际连接后再次核 current_user/current_database/port/data_directory。CREATE/DROP 仍按本轮 registry 登记，拒绝未登记 DROP。T-1412 没有修改这些约束。

证据表明：旧 wrapper 在合法本轮随机端口上因要求 55422 自然失败；修复后原三目标实际运行，wrapper 准入负例与既有守卫测试也执行。未通过 skip 获得结果。

## 4. CLI 隔离、安全失败与清理

- **真实依赖和身份。** 原 HyperFrames `0.7.54`、patch 与 CLI SHA 锁定断言保留。helper 核 CLI realpath 与 SHA，使用当前真实 Node；通过 otool 递归解析非系统原生库及 rpath，未解析即拒绝。准许只读本仓库 `.pnpm` 依赖、当前 Node/解析出的库、列出的系统库/Cryptex 和两个 package.json；没有授予真实 HOME、用户配置正文或 Keychain 读取。系统元数据可读是显式范围，不表述为“文件系统完全不可观察”。
- **环境。** 子环境是字面白名单，无 `...process.env`；HOME、cwd、TMPDIR、XDG 路径均落本轮 0700 根。OPENSSL_CONF/INCLUDE 指向本轮 0600 空配置，未开放宿主 OpenSSL 配置目录。三个 HyperFrames 开关正确设置，但网络保护由 deny-default/deny-network 原生策略承担。
- **实际能力。** 每个会话先运行合成探针；本轮 work 可写，根外合成敏感文件不可读、根外 canary 不可写、自有 loopback listener 零连接、普通与 detached 派生均被拒绝。任一探针或原生能力不能证明时，不允许后续真实 CLI。未用真实用户秘密或外网作为探针目标。
- **取消/超时。** `execute()` 检查有限安全整数且至少 120000ms；预取消先拒绝，运行取消或时间到期发送 SIGTERM，必要时按预算 SIGKILL/结束等待。组归属检查包括 UID、进程出生时间及原主进程 birth；不能证明则报错，不尝试清理任意同名进程。信号退出、超时、剩余组成员或收尾超预算不能返回成功收据。
- **失败回归。** 七项 helper 测试涵盖缺原生入口/错误 CLI、低预算、预取消、实际运行中取消、在途拒绝 dispose、外层 120 秒 timer 被 mock 推进后的真实进程收尾、根权限被改后拒绝删除及既有静态 timeout 守卫。120 秒测试是虚拟推进外层 timer，**不是等待了真实 120 秒**；进程启动和信号收尾是真实行为。
- **新 helper 的静态守卫。** `cli-static-budget-red.log` 明确保留两处 1000ms cleanup timer 被现有 inspectSource 拒绝的 6 PASS/1 FAIL。当前两个上界为 120000ms，最终第七项直接对 helper 源码执行原 inspectSource 并通过；没有修改 checker、放宽阈值或因文件未跟踪而跳过。
- **清理。** disposer 在途拒绝，清理前复核精确临时根的 realpath/UID/0700。正常 close 立即结束，不等待用尽 cleanup 上限。报告审核时仅对证据列出的四个 CLI 临时根和 PG root/home 做 exists 检查，全部已不存在；没有列举或读取用户目录。

本 helper 只用于原一秒参数拒绝入口，禁止派生浏览器是此测试的隔离条件，不代表一般 HyperFrames 渲染可以使用此 sandbox。没有把该策略扩到原 full 或需要 owned loopback/PG 的其他 lesson。

## 5. 已核验收据

| 证据 | 实际结果 | 边界 |
| --- | --- | --- |
| `budget-red.log` → `budget-green.log`，最终并入 focused | 原预算缺失 RED → 三项纯计划 GREEN | 不执行 lesson。 |
| `archive-red.log` / `archive-red-receipt.json` | 旧固定 55422 限制；exit 1 | 输入为本轮已启动 owned PG，未连接旧固定端口。 |
| `archive-green.log` / `archive-green-receipt.json` | 原三个目标 59 PASS；exit 0，signal null，完整关闭，无剩余 owned group | 不是只跑新 wrapper 单测。 |
| `archive-unit.log` / 对应 receipt | 5 PASS，0 skip，exit 0 | wrapper 真环境准入与合成拒绝。 |
| `archive-guard.log` / 对应 receipt | 原 owned-postgres 19 PASS，exit 0 | 既有归属边界。 |
| `owned-pg-start/.../server-identity.json` | 本轮管理角色、postgres、随机端口 49887、本轮 dataDir | 不借用户库。 |
| `owned-pg-start/.../stop-cleanup.json`、`owned-pg-stop.json` | stop exit 0、postmasterPidAbsent、cleanupOwnedRoot、root/homeGone | 原 owned 清理机制。 |
| `cli-isolation-red.log` | 静态源码断言 1 FAIL | 保留原性质，不称动态执行。 |
| `cli-dynamic-planning-red-v2.log` | 旧 callback 在纯合成输入下断言失败 | 本轮补充回放，真实启动进程 0。 |
| `cli-static-budget-red.log` | 6 PASS / 1 FAIL，原 checker 找到两处 1000ms | 新 helper 缺陷有真实 RED。 |
| `focused-final.log` | 13 PASS / 0 FAIL / 0 skipped / 0 cancelled：预算 3 + 隔离 7 + 原 HF 3 | 已读取完整测试终态及其中真实 CLI/隔离回执；不是完整八组。 |

已审核 final 日志中的真实 CLI stdout/stderr 与能力回执，而非仅看“13 passed”。主线程于本轮审核中转交原工具完成记录：精确 argv 为 `node --test docs/verification/t1412/lesson-budget.test.mjs tools/timeout-policy/hyperframes-cli-isolation.test.mjs tools/timeout-policy/hyperframes.test.mjs`，输出重定向至 `focused-final.log`；原 exec session `81237` 完成、exit 0，与完整日志 13/13、0 skip、`duration_ms:3391.16225` 一致。外层退出码的来源是主线程转交的真实工具记录，不是本审核者重新运行或从日志尾部推导。当时没有独立外层开始/结束时间与退出 JSON，本报告不补造。PG 四类运行另有明确命令、退出码、信号和清理收据。

## 6. 冻结内容绑定

| 路径 | SHA-256 |
| --- | --- |
| `docs/features/t1412-full-reconcile-isolation.md` | `c7640f725a1d9db2780bb3cae662e2a91d9dc3cae207dca307f30ff7406bd1bf` |
| `orchestrator/process/reconcile.config.json` | `293009903af92bd378fc82defeb42d0e222c145c0ecc65e5918a794932e0a1cf` |
| `docs/verification/t1022/run-archive-guard.mjs` | `13e4294592182071d6c8e8c6f0e0a64e68305abcd0d6fd90fae0ef2a96c4272a` |
| `docs/verification/t1022/run-archive-guard.test.mjs` | `3deda4693815ae1c4710223ae9c6d68ed03d36d0ea008aba0e25fa60bd53c630` |
| `tools/timeout-policy/hyperframes.test.mjs` | `38d94f0154386f29c254fd367df009eef388ab22e7d10e7f645d0154d4b4fd7b` |
| `tools/timeout-policy/hyperframes-cli-isolation.mjs` | `9db2efd423c05b43f690180fbb4ddd46d5f0ce8d063e56f489c5e60dd8bb160a` |
| `tools/timeout-policy/hyperframes-cli-isolation.test.mjs` | `bef5768f7d303abdd255d3d9e4919214fc6759c22ebf4094c5a74ed720fd6a17` |
| `backend/src/test-fixtures/owned-postgres.ts`（只读依赖） | `4eb42679bdaf9cef93957472d91a69471f42ac6de57e32a81901d28e3fe61ad0` |
| `backend/src/test-fixtures/owned-postgres.test.ts`（只读依赖） | `fb34705959fbf9c6760bdcd853ddc28a0f05b25b907b6ac8b76b9fe9aecf6aff` |
| `docs/verification/t1412/focused-final.log` | `a66846a5f6068b860349d497beaef8c03625a1344504c07a0f43e3635375e233` |
| `docs/verification/t1412/budget-inventory.json` | `bb6d8a0d3825fc765f50a9ae809916eb6ae8f8d2f5da5dcf314a5e55888a2c95` |
| `docs/verification/t1412/legacy-cli-planning-red.mjs` | `5f8cdb35a67e6911c2820265fb49169a6e79b4e85ce3f5acbfaf5436d8f57cb4` |
| `docs/verification/t1412/cli-dynamic-planning-red-v2.log` | `d7ea74ed7ca2030573f82d2c1da0eca7ba8cfc96efcf92bb75ec5deefd59318f` |
| `docs/verification/t1412/cli-static-budget-red.log` | `d89c1e95c4f2798d130d65276314953e6464045a2a12087f0b5bf4fa504072dd` |

审核结论只对上述内容有效。后续再改实现或环境边界须针对变化复核，不能把本报告用于其他候选。

## 7. 后续仍须诚实保留

本次未执行原八组 timeout-policy、full reconcile、主线程流程收尾或真实产品验收；不能把本报告当作它们的 PASS。六处失效 filter/正式链语义缺口仍归 T-1413，官方同步图片幂等资格仍为当前未证，官方 Pi 402 的现场结论也不能由测试隔离修复替代。无需扩大本补丁来洗掉这些状态。
