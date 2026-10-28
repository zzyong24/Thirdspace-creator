# T-1412 原 full 的最小环境只读复核

2026-10-25；独立审核者 `/root/t1427_contract_review`。本轮仅读配置、测试和执行器源码、Git 跟踪清单及明确允许的两份测试观测基线；未读任何真实 `.env`、用户配置或凭据，未运行测试、模型、网络、PG、浏览器、依赖安装或 full。这里只给执行准备建议，不签安全运行或 full PASS。T-1412 SPEC SHA-256 为 `c7640f725a1d9db2780bb3cae662e2a91d9dc3cae207dca307f30ff7406bd1bf`；当前 reconcile 配置 SHA 为 `293009903af92bd378fc82defeb42d0e222c145c0ecc65e5918a794932e0a1cf`，尚不是 T-1413 合并后的最终配置。

**结论：原 full 无需全程设置 `DATABASE_URL`。** 采用明确 commit 的干净 managed worktree、子进程私有 HOME/缓存和精确环境投影可行；LED-052 只接收本轮 owned PG 的四个专用变量即可。不能把 T1246 启动器返回的 `state.env` 整包传入 full。frontend 的原内存 PGlite 用例应继续在 `DATABASE_URL`、`PGLITE_DATA_DIR` 均未设置的 Vitest 环境运行。当前还需准备两份未跟踪的 LED-061 基线、离线依赖及浏览器运行资产，并完成已要求的实现独审/单门；这些尚未被本报告验证。

| 已核源码 | 实际行为与执行含义 |
| --- | --- |
| `docs/verification/t1022/run-archive-guard.mjs:6–19` | 准入读取 `CREATOROS_TEST_POSTGRES_URL`、`CREATOROS_ISOLATED_PG_URL`，两者必须为同一 owned 管理库；随后原三个 Vitest 目标原样执行。没有读取 `DATABASE_URL`。 |
| `backend/src/test-fixtures/owned-postgres.ts:17–53` | marker/nonce、私有临时根、uid/PID/出生/二进制/dataDir/端口/管理角色校验；URL 不含密码，必须匹配本轮身份。`OwnedPostgresPool` 另验证真实服务器身份和 CREATE/DROP 登记。 |
| `backend/src/integration/startup-group-collectors.postgres.integration.test.ts:14–21` | 从专用测试 URL 连管理库，为每个 fixture 创建随机库；`createRuntimeDb({connectionString:...})` 显式传本轮子库 URL，不需要通用数据库环境。 |
| `execution-lease.service.test.ts:10`、`execution-call-ledger.service.test.ts:11` | 另外两份原目标直接 `createDb()`，保持内存 PGlite，不会因为保留 owned 专用变量改用 PG。 |
| `docs/verification/t1246/round-2/unit/owned-pg-runtime.cjs` 的 `start()` | 返回 env 包含专用变量，也包含 `DATABASE_URL`、`TEST_DATABASE_URL` 及 `PG*`；后者是其它 T1246 用途，不能直接继承到本 full。启动器还预建一个登记子库，保留其原 stop/cleanup 流程即可，不为省事修改启动器。 |
| `backend/src/db.ts:403–419,438–450` | `DATABASE_URL` 优先于 NODE_ENV/VITEST；其次 `PGLITE_DATA_DIR`；仅二者都未设置时测试选择 memory-pglite。全局设置 owned PG URL 虽不接触用户库，仍会改变原测试语义。 |
| `frontend/src/server/persistence-client.ts:1220,7711–7716` | `createConfiguredDb()` 装配服务；`__resetPersistenceForTests()` 只清 singleton/停止 worker，不 DROP 或清空 PG。artifacts/production 集成测试每例调用 reset，依赖新内存库；共享 PG 会残留前例数据、改变隔离并可能产生重复迁移/ID 竞争。 |
| `frontend/src/server/persistence-client.ts:1600–1616` | 有 `S3_BUCKET` 就先 `ensureBucket()`，然后才决定测试 mock storage；不能以 NODE_ENV=test 代替剔除 S3 配置。 |
| `orchestrator/process/lesson-runner.mjs` | 每项经 `/bin/bash -c` 串行启动，未覆盖 env，继承 full 的环境；本次没有必要为每条命令另建环境框架或修改 check。 |

最小执行准备顺序如下，由 root 操作；下面是未执行的方案。

1. 完成 T-1412 实现、聚焦回归、独审并冻结；串行完成 T-1413 已授权部分及覆盖证明，官方图片幂等缺资格仍保 unknown。提交完整候选并锁定 commit、配置/锁文件 SHA，按已有工具建立该 commit 的干净 managed worktree。不复制主树 ignored 目录、`.auth`、`.creatoros`、`.env*` 或已安装 App 配置；不把工作区目录/整个 node_modules 直接软链回主树，以免解析到主树业务源或写回主树构建产物。
2. 仅按文件名/元数据确认五个工作区及其配置解析根不存在活动 `.env`、`.env.local`、`.env.test`、`.env.test.local`；发现时停止该运行准备并按来源处理，不打开内容。当前五份 Vitest config 没有显式禁用 env 文件，frontend 的 setup 也不清除 DB/S3 环境。实际安装 Vite 8.0.16 的 `getEnvFilesForMode/loadEnv` 确实枚举并读取这四类文件；默认只导出匹配前缀的 key，同时处理 NODE_ENV/BROWSER。不能把它说成自动把每个 DATABASE_URL 赋给 process.env，但仍不能依赖前缀来避免读取主树秘密。干净检出且无这类输入才是本方案的证据。
   补充实际路径核查：本轮仅调用文件存在性检查，确认主树 `frontend/.env.local` 存在；其余四个工作区的上述四类文件均未发现，未读取任何正文。因此原八组 timeout-policy 单门也应在该冻结干净 worktree 执行，不能把主树已存在 env 文件的 cwd 当作本方案的干净输入。

3. 在本轮私有根建立 HOME、TMPDIR、XDG config/cache/data、包管理和 Rust 缓存/输出；通过子进程 env 对象传入，不修改宿主 shell 的 HOME。Node/pnpm 使用已核实的绝对可执行文件及版本（本仓 root 声明 Node `>=25 <26`、pnpm `10.32.1`），PATH 只包含这些工具目录和系统基础目录。必须在启动 owned PG **之前**确定 TMPDIR，并让 full 使用同一个真实 TMPDIR：owned marker 校验用 `realpath(tmpdir())`，中途更换会合法拒绝归属。
4. 从已锁依赖的本地缓存离线恢复工作区依赖，确保 workspace 链接指向该 worktree，核 pnpm-lock/patch/实际 HyperFrames CLI SHA。准备时禁止自动下载；`pnpm --offline` 只约束包管理取包，不能保证安装 lifecycle 脚本不下载。可先用 frozen-lockfile/offline/ignore-scripts 方式装配，再对必要原生产物逐个确认；缺 esbuild/原生包/完整离线缓存时保 NOT READY，不临时联网补齐或启用整套未审核脚本。不能把本方案描述为已经证明离线可装。
   现有 `pnpm-workspace.yaml` 的 onlyBuiltDependencies 是 `sharp/esbuild/protobufjs/@google/genai/onnxruntime-node`；其中存在下载或生成原生产物的安装脚本。两条可用准备路径：A）通过已确认位置的本地 pnpm store 执行 `pnpm install --offline --frozen-lockfile --ignore-scripts --store-dir <本轮已确认缓存>`，再验证所需二进制已齐；B）将锁文件一致的既有依赖树受控复制为 worktree 自有文件，包含根 `node_modules/.pnpm` 和工作区实际 node_modules 链接布局，保留已有且经核验的平台产物，复制前后记录 package/patch/关键二进制摘要。B 不能用整个目录软链，也不要为节省空间使用会使后续修改写回主树的可写硬链接；不复制 `.env`、用户配置、主树工作区源码或随手带入主树 dist。两条路径都不得临时开启未审 lifecycle 下载来填洞。

   已只读核实际链接：根 `.pnpm/node_modules/@creatoros/*` 使用 `../../../../<workspace>`，各工作区 `node_modules/@creatoros/*` 使用 `../../../<workspace>`。复制完整对应层级时这些相对链接有机会正确落到新 worktree，但仍需在目的地逐个 realpath 验证所有 workspace 包、`.bin` shim 与依赖链接没有回指主树或用户配置路径；此处没有做复制，也没有把“有机会”当作已成立。pnpm metadata 可能记录源 store 位置，必须记录实际解析后的 store/virtual-store，不从隐藏用户配置推断；若 A 离线重建缺包或 B 闭包不完整，停止准备并报精确缺件。

5. Rust 的 `CARGO_HOME`、工具链和 target 输出绑定本轮目录或明确的只读依赖资产，不能整包继承用户 Cargo 配置/credentials；设 `CARGO_NET_OFFLINE=true`，原 cargo check/test argv 不改。选用已锁工具链、核 Cargo.lock 前后一致；该环境约束不等价于给原命令追加 `--locked`。缺缓存时正常失败，不切在线。现 `build.rs` 的 debug 测试允许没有 verdict seed，并读取仓库 product-identity；不需要也不应提供真实签名 seed、PackageIdentity 路径或发行账号配置。
6. 在上述私有环境内复用现有 T1246 `start()`；保持它原归属验证和 stop。给 full 的 env 从零构造，只从返回值挑选四个专用 PG 字段，绝不 spread `process.env` 或 `state.env`。原两个单门、实际原生隔离证明、独审与安全输入检查满足后，再以固定 cwd/commit 执行原 `node orchestrator/process/reconcile.mjs --profile full`；记录真实退出、信号、配置和环境键名/路径边界。运行前后核 owned 资源与受保护文件，随后原 stop 只清本轮根。

下面仅表达所需环境投影，不是新 runner，也没有执行。`paths` 均须由 root 为本轮创建或验证；不同工具的只读依赖路径仍需准确绑定。

```js
const childEnv = {
  PATH: paths.verifiedToolPath,
  HOME: paths.privateHome,
  TMPDIR: paths.sameTempRootUsedToStartOwnedPg,
  XDG_CONFIG_HOME: paths.privateConfig,
  XDG_CACHE_HOME: paths.privateCache,
  XDG_DATA_HOME: paths.privateData,
  LANG: 'C', LC_ALL: 'C',
  CARGO_HOME: paths.privateCargoHome,
  RUSTUP_HOME: paths.verifiedRustToolchains,
  CARGO_TARGET_DIR: paths.privateCargoTarget,
  CARGO_NET_OFFLINE: 'true',
  PLAYWRIGHT_BROWSERS_PATH: paths.verifiedBrowserAssets,
  // CFT_ROOT 仅在真实浏览器 fixture 及配套 Rust 构建已准备时加入。
  CREATOROS_OWNED_PG_MARKER: state.markerPath,
  CREATOROS_OWNED_PG_NONCE: state.nonce,
  CREATOROS_TEST_POSTGRES_URL: state.env.CREATOROS_TEST_POSTGRES_URL,
  CREATOROS_ISOLATED_PG_URL: state.env.CREATOROS_ISOLATED_PG_URL,
};
// 不传 DATABASE_URL / TEST_DATABASE_URL / PGLITE_DATA_DIR / PG*。
// 不传 S3_* / AWS_* / 模型密钥 / 真实端点 / 桌面握手与激活变量。
// 不传 NODE_OPTIONS / NODE_PATH / BASH_ENV / ENV / LD_PRELOAD / DYLD_*。
// npm/pnpm/git 的用户配置入口另绑定本轮空配置，不能继承用户路径。
// spawn(verifiedNode, ['orchestrator/process/reconcile.mjs', '--profile', 'full'],
//       {cwd: worktree, env: childEnv, stdio: 'inherit', shell: false});
```

顶层无需人为设置 `NODE_ENV=production` 或假装整个 full 是 test；Vitest 自行设置测试环境，有些测试会显式模拟生产生命周期。不得全局设置关闭 worker/scheduler 等产品行为的开关来“隔离”，因为那可能把真实断言短路。npm/pnpm 用户配置可用本轮空 `NPM_CONFIG_USERCONFIG`/`NPM_CONFIG_GLOBALCONFIG`；Git 全局/系统配置可绑定本轮空文件（本地仓库 Git metadata 仍正常使用）。不要从宿主复制代理、证书注入、service file 或任意预加载器。私有 HOME 和环境白名单不能单独证明 OS 无网络/无任意读取；HyperFrames 仍必须通过现有独立 OS 能力探针，其他真实子进程按实际行为核查，不新增全 full 沙箱，也不放开任意 localhost 来补洞。

**两份 LED-061 基线已完整做敏感内容核查，可以精确 provision。** 两者当前存在但 `git ls-files --error-unmatch` 均返回未跟踪。全文都是 JSON 数组，字段仅为 `label/returnedBuffers/liveBuffers/retainedMiB/externalMiB`，parallel 另有 `firstCompletedAudio/lastCompletedAudio`；值为固定阶段名与数值。没有账号、URL、文件路径、进程环境、token、密钥或用户正文。本结论仅适用于下列字节 SHA，不是对整个 ignored evidence 目录的背书。

| 精确文件 | 当前 SHA-256 | 内容 |
| --- | --- | --- |
| `docs/verification/t1073/worker/ipc-memory-serial-observation.json` | `dfc479002442577b7076eb81f33b2480ea1bac89ae6780382a8c499ba6b1d305` | 6 条内存采样，从 baseline 到 after-stopped，最终 100 个回执、0 个 live Buffer。 |
| `docs/verification/t1073/worker/ipc-memory-parallel-observation.json` | `a08b03fdb7c9c412a322da547e21dcfa6df07a4a2c88fa8949c433462197e1ef` | 3 条采样，含逆序完成索引 99/0。 |

它们的生产者 **可以真实重跑**：已跟踪的 `backend/src/modules/execution/worker-supervisor.memory.test.ts:35–43` 调用 `ipc-memory-probe.ts`，再通过实际 supervisor/Worker IPC 生成 stdout 并写到这两个固定路径；`ipc-memory-probe.ts`、`ipc-fixture.ts`、`ipc-replay-fixture.ts` 也都已跟踪。数据来源为合成 Buffer、GC/进程内存采样，provider 分支明确不运行模型，没有真实业务 I/O。可复现的是行为和新观测，不能承诺 `externalMiB` 等内存数字逐字复现历史 SHA。

但**原 LED-061 wrapper 不能在空检出里先自举它们**：`verify-resource-lifecycle.mjs:20` 在启动 backend Vitest 前就 `readFile` 保存两份原件，缺文件会先 ENOENT，生产者没有机会运行。保持原 driver/check 不变的最小做法是将上述非秘密历史原件精确纳入冻结候选，或按双 SHA 精确复制到本轮 worktree 后记录 provision manifest；必须保留“历史基线”身份，不倒填成新运行结果。也可先独立运行原生产测试生成新观测，再运行 wrapper，但这是新增准备执行、会产生新数据且须另记实际结果，不能伪造空数组占位。root 已倾向提交原件，故推荐第一种。wrapper finally 会输出本轮观测后还原基线；外层强杀可能跳过 finally，仍须保留 run 前副本并核 worktree 原件 SHA，不能回写主树覆盖历史。

**剩余条件与实际边界：**

- 干净 worktree 没有 node_modules、浏览器缓存和 Cargo 缓存的天然保证。LED-024 的 `verify-t794-motion-card-preview.mjs:24` 真正 `chromium.launch({headless:true})`，然后仅浏览本轮生成的 file HTML；需要与 Playwright 锁版本匹配的浏览器资产。私有 HOME 下无资产会失败，不应让它自动安装。它不是已安装 App UI 或模型验收。
- LED-054 的 `workbench-browser-host.test.ts:367` 只有 darwin 且 `CREATOROS_TEST_CFT_ROOT` 有值才启用 `realTest`；当前有 **5 个**此类声明。无该变量会产生原有 skip，不能描述为已验证真实 Rust/Chromium 链或全量 0 skip。若要执行，必须提供已核浏览器 bundle（而非用户 profile）；测试自己建立临时 profile/socket。部分测试调用 `--locked --offline` Cargo，另一路可选 fixture binary 也须由本候选源码和锁定工具链产生；不能指向不明旧可执行文件。是否存在完整本轮资产，本次未实测。
- LED-018/057 原 cargo 命令未带 offline；上述 `CARGO_NET_OFFLINE=true` 防其取依赖，但不保证任意 build.rs/子进程自身不联网。pnpm install 同理。真实依赖、锁文件与生成物未准备完整时保持未就绪，不拿环境变量替代副作用核查。
- LED-054 的 chat-worker-entry 及 LED-060 会构建 ai-worker/dist；必须写本轮 worktree，不能链接回主树。该新增 worktree 的 Node、包/patch、原生依赖和临时资源能力需要重新核验，不能直接继承主树某次运行成功。
- full 除 55 项 lesson 还调用 asset-check/assets-runner、治理/receipt 审计，并在具备 program 配置及 ship 声明时启动 program audit。当前 `program_completion_required=false`、`orchestrator/program/program.config.json` 不存在，默认 `orchestrator/decisions/assets` 也不存在；不能把这些当前观察外推到最终 commit。full 不会遍历执行 config 中所有 frontend/research verify_commands，不能因此引入真实账号 E2E。
- 当前配置仍含 T-1413 待迁移的失效目标；最终只允许已独审的准确迁移，逐文件非零收集和全部相关预算重核是前置。最终 commit 要包含受其测试/控制审计实际引用的所有非秘密文件；本报告只指出已证实的两份缺件，不承诺未冻结候选的全部传递文件已查全。
- repo 配置 `work_branch=main` 使 reality probes 检查本地 main。root 应记录候选 HEAD 与被检查 main 的关系，不能在旁支 worktree 上声称所有 Git probe 已针对候选 SHA；不要为消警报修改检查或暗改引用。

报告作成时读过的关键源 SHA：`run-archive-guard.mjs` = `13e4294592182071d6c8e8c6f0e0a64e68305abcd0d6fd90fae0ef2a96c4272a`；`owned-postgres.ts` = `4eb42679bdaf9cef93957472d91a69471f42ac6de57e32a81901d28e3fe61ad0`；T1246 `owned-pg-runtime.cjs` = `393f88771f732e57959ce948a61104fe616c6090faa3e21808186a6df7df3dea`；`backend/src/db.ts` = `82420403de832caeae7a981e3677dd0c8ad062535da5115731c4a4f70411e6f6`；`persistence-client.ts` = `a5e9ea2735b7ec182b3f23a56060bf350002f3e87f23be6264335feb824f9675`；`pnpm-lock.yaml` = `c8cda15d07ebe8355d85916cb2e93f7d81ce5a38057ad2af2c3161338b3f888e`。这些是只读快照，最终执行须重新绑定冻结候选。

**依赖准备补充：APFS 克隆加受控重链接可作为当前首选，原离线安装方案保留为备选。** root 报告现有六目录已枚举 4998 个符号链接，absolute/outside/broken 均为 0；这是 root 的准备观察，本审核者没有重复完整枚举。审核者已只读确认六个目录本身均不是符号链接且 st_dev 相同，位于 `/System/Volumes/Data`，diskutil 报 APFS，检查时容器可用约 27.2 GB（约 25.4 GiB）。目标 managed worktree 尚未创建，不能提前证明其同卷或实际克隆成功。

六个精确源为根 `node_modules` 及 `frontend/backend/ai-worker/contract/mcp-server` 各自的 `node_modules`。在同一 APFS 卷用本机 `/bin/cp` 的递归 clone 模式复制为独立目录树、保留符号链接而不跟随，可避免重新执行 lifecycle；禁止 `-l` 硬链接或将目标整个目录软链回源，不沿 `-L` 将 workspace 源复制进依赖树。普通文件克隆是写时复制：本机 `man clonefile` 明确任一副本后续写入只影响自身，适合本场景。仍需先确认不存在 FIFO/socket/device 等非普通依赖输入、目标精确且未预存混杂文件，记录每目录真实退出；`cp -R` 遇错可能继续并留下部分目标，不可将部分复制视为依赖闭包。

本机 `man cp` 也明确：`-c` 在目标不支持 clonefile 时会回退 copyfile。因此 `cp -c` exit 0 不能单独证明每文件都用了克隆；复制前核源/目的同一支持克隆的卷，执行后记录真实存储占用/剩余空间和副本独立性，不以“APFS”假定后续 Cargo/worker 构建有充足空间。写时复制后追加写入仍可能 ENOSPC。不得为保空间删除主树依赖或用户缓存；不够就保持准备未完成。

**原 clone 不能直接跑门：已独立读到 shim 回指。** `frontend/node_modules/.bin/vitest` 和 `ai-worker/node_modules/.bin/esbuild` 的脚本在两分支都写入主树绝对 NODE_PATH；即使父 env 不含 NODE_PATH，它们仍会注入主树依赖目录。现 `.modules.yaml` 的非秘密字段确认为 `layoutVersion=5`、`nodeLinker=isolated`、`packageManager=pnpm@10.32.1`、`virtualStoreDir=.pnpm`、`storeDir=/Users/zyongzhu/Library/pnpm/store/v10`。root 拟在完整 clone 后，用已确认 Node25/pnpm10.32.1、私有 HOME、空用户/全局 npmrc，运行 `pnpm install --offline --frozen-lockfile --ignore-scripts --store-dir /Users/zyongzhu/Library/pnpm/store/v10` 来重链接，方向合理；源 store 仅作为明确依赖缓存，不读取其旁边的用户配置/凭据。若启动入口是 Corepack shim，须同时禁止网络并确认本版本已缓存可用，不能让 package-manager 自动切换隐式下载。

此 install 仅是准备动作，不保证 pnpm 一定重写所有旧 shim，也不保证保留全部原生文件。必须在其后再次枚举目标所有链接、检查全部 `.bin` 的主树绝对路径残留为 0，并确认 workspace 包实际解析只到 worktree 内的工作区和其依赖；锁文件与已审 patch 不变。将 clone 前的实际必要原生文件清单及 SHA 和重链接后逐一比较，验证 esbuild 在目标环境真实可执行；HyperFrames CLI 必须仍为锁定 SHA，Pi 包及补丁同样绑定。遇到缺失、摘要漂移、残留回指或 install 提议下载/开启脚本时立即停，不能拿 ignore-scripts 装出的空原生产物当完整运行时。此计划不修改 checks 或产品、不新建隔离框架；本审核未执行 clone、install 或二进制验证，实际成功及全部剩余条件仍由准备收据证明。
