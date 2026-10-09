# T1104 独立 SPEC 初审

结论建议：**PASS（0 findings）**。已审最小诊断方案成立，未发现当前范围必须修正的规格问题。正式reviewctl verdict由root录入packet后计算；本报告不写审核状态或事件，不代签实现、测试、安装或原首次根因关闭。

- 类型：`spec-review-round/v2`、`initial`。
- 审查时间：2026-10-09T03:57:18.551748+00:00
- 工作树：`/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator`；实际HEAD `070287024a99fdf810a03d0ff39a9c944a9775e7`。
- 范围：T1104 SPEC、原唯一Rust产品/同文件测试边界、实际消费者/固定tar源码、现有Gate配置。
- 已先读BACKLOG顶部T1104、SPEC、项目记忆、AGENTS、架构和product-to-code-orchestrator；技能与项目stamp均3.29.0。阶段为既有BUILD任务的SPEC前置审核，尚不能进入产品实现；无UI/契约/权限变更，不新增设计、授权或发布门。
- packet：同目录`spec-review-input.json`，SHA256 `20adb227c6509d2c893404538b5226b2262c82e8e3f4ca08983c4405b4d539af`。精确四字段schema/review_kind/summary/findings满足当前reviewctl packet格式，findings为空；没有在packet塞入未知字段。

大白话：失败时把真正原因留下来，清理失败时照实说。不是改变“如何解压”，也不是认定第一次失败一定由磁盘造成。

```mermaid
flowchart LR
 A[原tar实际展开] --> B[原I/O错误及嵌套原因]
 B --> C[有限遍历并保存真实码]
 C --> D[原一次temp清理]
 D --> E[如实说明结果 保留主错误]
 E --> F[原启动失败路径与旧runtime]
```

## 逐项审查

| 核查点 | 初审判断与源码依据 |
| --- | --- |
| 唯一写集与必要性 | 产品/测试仅`frontend/src-tauri/src/lib.rs`。原1808 Display立即转String；tar0.4.46的Display只给desc而source保存io，真实缺口成立。原三处remove_dir_all结果被丢弃，清理说明失真；修结果表达不新增删除行为。 |
| 真实tar RED可执行性 | tar::Builder先放server.js，再目录和同名普通文件；固定tar entry.rs的普通文件create_new→已存在时remove_file，对已存在目录会产生真实I/O错误，再由unpack及unpack_in嵌套包装。调用原extract函数；旧格式缺内层码，所以断言应真实RED。不是只拼假日志或填满磁盘。尚未运行，不能签RED已发生。 |
| source/get_ref边界 | 必须在io::Error转String前取链；包装层raw_os_error可能None，不能据此推断没有内层errno。遍历时对io::Error使用get_ref保留包装错误；再沿真实source前进、以层数硬限处理重复/循环。最多8层、每层1024 Unicode字符且明确截断，不按字节切坏UTF-8，不猜错误文本。规范已写这些边界；实施复核将核实际代码及边界断言。 |
| 主错误与清理真实性 | 原主错误持续返回Err，原unpack/缺入口/写stamp三处各保原一次temp删除；清理Err只附加真实信息，不覆盖主错误或称已清理。标准库公开源码文档明确remove_dir_all对非目录失败，所以“普通文件作为目录”能产生真实清理错误，避免依赖root/ACL环境的假权限红测。此清理测试验证私有helper的真实Result；完整extract失败测试另核旧dest/stamp和temp范围，不把helper当中途tar失败覆盖。 |
| 旧数据/运行时保护 | 原旧dest/server.js/stamp预置并逐字核保护；失败不能写新stamp。成功及二次复用、损坏重建、原promote/rollback/fallback与路径拒绝全部保留。源码指向仍是同盘temp；无用户库、激活、env秘密读取，无业务写入或费用变化。 |
| 平台兼容 | 新格式化与清理说明使用std通用边界，不增加平台依赖或改Cargo锁。errno测试只对真实诊断保存作断言，平台码/kind以真实目标和标准库行为为准，不把macOS号硬写成Windows事实。本机全lib不能代签cfg(windows)真实文件占用用例已运行；原平台条件和Windows安全fallback不改。 |
| 验证闭包 | 当前T1104 modules配置含精准runtime_cleanup_tests及全lib Cargo入口、diff、boundary、semantic、orphan、完整reconcile，与SPEC一致。须全部原断言保留、先真实RED再最小GREEN；长度/Unicode截断、真实清理失败、坏gzip读取、中途失败旧目录保护不能省略。独立外层不新增短人为上限，不改原生产预算。 |
| 交付事实 | T1102原首次根因仍UNKNOWN；同包恢复首页不被本SPEC追记为根治。当前App不退出，源码提交/包/安装分开留实际证据；全局原42及超时原27保留，不据数量自动签旧债，更不代签T1103 Pi联合候选成功。 |

## 实施与证据局限

本次没有产品代码、测试、配置、正式review或事件写入，未运行测试、App、DB、CLI、模型、构建、网络或进程操作；仅只读检索和计算SHA，创建本私有报告/packet。本文的RED与清理测试判断是基于固定实现和标准库合同的可执行性审核，尚非当场测试结果。

可进入root正式审核录入；只有审核实际PASS后才能按唯一写集实施。实施后仍须独立审当前源码SHA与真实RED/GREEN/全lib/Gate结果，不沿本初审代签。T1102、T1103及父T1062范围和当前安装版状态不受本结论替代。

## 实际SHA256绑定

| 项目文件/配置 | SHA256 |
| --- | --- |
| `docs/features/t1104-runtime-extraction-error-chain.md` | `4816c4dc9909837419b73061a0a6e5ff6687aef142c5caf8cbdfcc4c366830f9` |
| `frontend/src-tauri/src/lib.rs` | `b85d52ffce43dd10f3e6e82c242b9987ee0820ee5100abdc17f02e0d81f335eb` |
| `frontend/src-tauri/Cargo.toml` | `6fc6b92e179df84c1e597dd18b4829d921c005a292c14831b86fb15f6ebc766f` |
| `frontend/src-tauri/Cargo.lock` | `1f28d0b8440de395647f3852516a8a4acb913db7a290645a1fa84e8d8a1dcd6f` |
| `orchestrator/process/modules.config.json` | `00f64db5c8b56de2eac287681b33b452d48d7c943beae0f5a11090f1c6d3d9d6` |
| `orchestrator/process/reconcile.config.json` | `a2c053a86a919f401ff6f73c74598cff9e5df37be9316e864897b8e3855800af` |
| `orchestrator/process/reviewctl.mjs` | `dde682e0ad114048daa5cfd8686a1450ccf902a8ab56a48411e88399a51ccc15` |
| `orchestrator/ARTIFACT_MANIFEST.yaml` | `b6d36f09002159fd0ca2bbbc936c8c98e9aa3f553b1ba272fd6de640d9f4e1d3` |
| `orchestrator/SYSTEM_ARCHITECTURE.md` | `eb1826d4c09054df622d9718c38ca372bd19833e72bd1a752757631a5747c1df` |
| `docs/产品定位.md` | `86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800` |
| `AGENTS.md` | `c53bd9f14bb368cdf4d2462e36397c33d17463c5a0253cc7209cbf359c5c044a` |
| `PROJECT.md` | `526e7c7c163bec2f8e7bc9bbc1ac496bbde1973916c0d666cf4e8ae37504691c` |
| `PROJECT_CONTEXT.md` | `a74ec6498a8e06fe574f86ec96c51a99076672b717d103b26b25578bd2a1ed3c` |
| `orchestrator/process/.skill-version` | `059101410c6bd35df37979a7fc91d59aa840a79aa794736772fe04c45a43838d` |

| 已读外部依据 | SHA256 |
| --- | --- |
| `/Users/zyongzhu/.codex/skills/product-to-code-orchestrator/SKILL.md` | `5796cf1b3b9f3de2d45c8e754e3df2146735aa14b266b7c32e2cb4c8638f4c1f` |
| `/Users/zyongzhu/.codex/skills/product-to-code-orchestrator/VERSION` | `db8c5f26ffadff528c3c988af09e26339ee629b449372f4a62f0c357f7329dfc` |
| `/Users/zyongzhu/.codex/skills/product-to-code-orchestrator/prompts/stage-router.md` | `dd656d4b0d886aee9fafa10b61a1db9554e1d424c533dd79693f28ff7447cf1e` |
| `/Users/zyongzhu/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tar-0.4.46/src/entry.rs` | `b71f12aeb65903d8d3847756d56642b904d7b801946b7e756e948405c5343f15` |
| `/Users/zyongzhu/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tar-0.4.46/src/error.rs` | `a20813fbc52f1f2e3a79654f62de6001759f6504a06acee5b0819d4865398587` |
| `/Users/zyongzhu/.rustup/toolchains/stable-aarch64-apple-darwin/share/doc/rust/html/src/std/fs.rs.html` | `59777fc15ec133a22c74897d2ddf86234e1add6948b5103dd6f73cc7349cd71d` |
| `/Users/zyongzhu/CreatorOS-local-acceptance/main-installed-20261008/t1102/READONLY_DIAGNOSIS.md` | `6f2644cd2fb14cb49a445c7aa3402a95aa9b5d1f664d2c881ca2e49fc1c870e4` |
| `/Users/zyongzhu/CreatorOS-local-acceptance/main-installed-20261008/t1102/MECHANICAL_WRITE_SET.json` | `b5cfc8c35ebb8ad0c1941c0c9453a08ec808a130a10f74377161d20e095397a4` |
