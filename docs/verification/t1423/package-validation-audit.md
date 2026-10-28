# T-1423 本地打包、保数据安装与原生验收路线审计

2026-10-23。仅准备性只读审计；本轮没有构建、安装、退出/重启 App、原生激活、绑定释放、模型调用或生产写入，也未读取任何模型密钥或构建私钥内容。结论不代产品规格或实现评审。

## 结论

既有官方本地入口可以承接后续**已提交、干净、准确获准**的候选，先产包再安装，沿 T1395 的保数据方法验收。当前主目录仍有未提交控制面/规格内容，不能立即把主目录当冻结打包源。

当前桌面 CLI 实际连接且访问已开启，但没有许可升级、原生点击或截图能力；Native CUA 已禁用，旧 Appium 临时运行时也不存在。因此，后续真正原生按钮验证目前需要用户在安装版中明确点击，Root 记录前后脱敏证据。不能用内部 HTTP、浏览器 localhost、私有 IPC 注入或新调试端点代替原生验签和按钮验收。无需重复要求用户开启已经开启的 CLI。

## 本轮实际检查

| 项目 | 只读结果与限制 |
| --- | --- |
| 主目录来源 | HEAD `9c585dd4db5f263d228bb71bb832700dfd81f64e`；检查时工作树非空。后续必须在最终候选重新检查，不能沿用这次 HEAD 当交付来源。 |
| 四处版本 | `frontend/package.json`、`tauri.conf.json`、`Cargo.toml` 和 Cargo.lock 中的 `creatoros-desktop` 均为 `1.2.0`。只是当前一致，不证明未来候选已冻结。 |
| 当前安装 | `/Applications/CreatorOS.app` 存在，Info.plist 标识 `cloud.aitongban.creatoros`、版本 `1.2.0`。相同版本名不能证明它包含本次修改，仍需实际二进制/sidecar 摘要和来源绑定。 |
| 构建环境 | 当前 Node 为 `v25.9.0`；本机 verdict 签名文件、公钥文件及既有 sidecar 根 PEM 路径均存在。只检查存在性，未读取内容，不能据此代签密钥配对预检或构建成功。 |
| 正式公开 CLI | 按当前用户 PATH 发现 `creatoros`，`--version`、`help`、`status`、`access status`、`operations list` 均实际 exit 0 / `ok:true`；CLI `0.1.0`、contract `0.4.0`，`connected:true`、`enabled:true`。440 个公开 operation 中没有 license/activation/model-benefit 升级或 UI click/screen operation。没有调用业务 operation。 |
| 原生自动化 | 当前工具声明禁用 Native CUA；`appium`、`tauri-driver` 未在 PATH 命中，已知旧 `/tmp/t1246-appium` 不存在。仓库历史准备/doctor 回执不等于当前有可运行 session；本轮未安装工具、触发 XCTest/TCC 认证或调用替代 GUI 自动化。 |

CLI 发现遵循 `.agents/skills/creatoros-cli/SKILL.md` 与 `references/cli.md`，没有读取连接文件、凭据存储或业务数据。公开 CLI/connector 的普通业务接口不是 Tauri 原生许可命令的代理。

## 冻结与固定打包入口

使用 `.agents/skills/packaging-creatoros-release/SKILL.md`。该文件第 10–12 行要求把打包视为冻结期，第 31–45 行要求干净工作树、已提交且获准的精确 HEAD、四版本一致、候选提交/秘密审查和四个打包基本测试；失败即停止，不在打包阶段修改产品、文档、脚本、workflow 或测试来消除失败。这里是正式流程要求，不能误称 `package-local.mjs` 本身已经替调用者检查 Git 干净。

后续实现与必要审核/提交完成后，Root 才能执行当前候选的四个原测试：

```bash
pnpm -C frontend exec vitest run \
  scripts/desktop/package-local.test.mjs \
  scripts/desktop/desktop-release-workflow.test.mjs \
  scripts/desktop/notarize.test.mjs \
  scripts/desktop/tauri-signing-config.test.mjs
```

随后使用已有入口分离产包与安装：

```bash
CREATOROS_LOCAL_SKIP_INSTALL=1 pnpm -C frontend desktop:package-local
```

这是 `package-local.mjs:231–235` 的正式已有选项，也是 T1395 实际路径；不是关闭 T1246 环境或许可守卫。该入口默认 `CREATOROS_PACKAGE_BUILD_ONLY=1`（`:18–21`），会省略额外构建验收；必须如实记录，不能用它代替本任务产品回归、安装和真实按钮验收。本地 ad-hoc 包不能描述为 Developer ID 已签名、已公证或正式双平台发布。

固定 sidecar 信任根的检查见 `frontend/scripts/desktop/sign-sidecar.mjs:16–27`：正式要求成立时，既有 Ed25519 根公钥及私钥必须配对，不能生成新根、换公钥或改守卫凑通过。实际构建时仅让既有入口在进程内使用材料，日志与工件不得输出秘密。此次没有运行该预检。

产物需记录本轮唯一包路径、完整 SHA256、`hdiutil verify`、DMG 内 App 与构建 App/安装 App 的摘要及 `codesign --verify --deep --strict` 结果。不得沿用 T1395 的旧包摘要或 58 个测试结果冒本轮通过。

## 保数据安装：复用流程，重新取证

T1395 SPEC 与 `docs/verification/t1395/RESULT.md` 证明过一条可行路线：正常退出、确认无原库写者、私有冷快照、对副本实际迁移/重开并核关键数据、备份旧 App、沿现安装器替换并显式启动 `/Applications/CreatorOS.app`，再核实际进程路径、日志和真实窗口。

**旧完整备份已清理。** T1395 RESULT 第 3 行明确记载 T1396 后来删除旧 App、旧 DMG、`app-data` 和本次数据库副本；这些不能作为本轮仍存在的回滚点。实施前必须重新取得当前 App/必要产物和完整应用数据的私有备份，保原许可、设备身份、偏好及钱包，不运行 activation reset/workspace reset。敏感备份不进 Git。

现安装器 `frontend/scripts/desktop/package-local.mjs:163–181` 会调用正常 quit，再 `pkill` 同名二进制；先 `ditto` 到隐藏暂存目录，随后删除旧目标并 rename。它不是业务数据备份器，也不能替 Root 证明旧 sidecar 已完全退出或冷快照一致。应在调用前保存工作、正常退出并确认无写者，完成备份与副本检查；安装失败保留真实阶段，不盲目反复替换。

运行 App 时不得再打开原 PGLite 目录做独立数据库校验。需要数据库内容比较时，先正常退出后取新的冷副本，或只使用明确合法的公共只读读回。安装后出现正常后台记录，不以全库总行数必须不变代替业务数据保留；原授权期限/永久属性/次数、原钱包与唯一首赠应分别核真实前后事实，秘密不展示。

## T1246 守卫：分别看待，不存在通用绕过开关

1. **自有 PostgreSQL 守卫**：`docs/verification/t1246/round-2/unit/owned-pg-runtime.cjs:7–17` 会清继承数据库环境，并核当前 UID、非符号链接 realpath、0700 新临时根、T1246 task/nonce、角色/端口、`postmaster.pid`、真实 PID/出生时间/二进制/目录。后续还核真实连接身份和数据库归属。缺材料必须拒绝，不能拿公共 PG、旧 marker、任意 URL 或内存库代替，也不能手造批准值洗绿。该工具导入不启动 PG；只有经准确准入的运行器才可启动/清理自己的实例。
2. **旧打包运行器守卫**：`docs/verification/t1246/round-3/package-preparation/run-owned-round3-local-package.cjs` 绑定当时干净提交、工具/依赖/SHA、独立评审、预算及“不安装/不启动 App”的 sandbox，并固定当时 45 条基本测试。它是历史精确来源验收工具，不是可直接换任务号、换当前来源就运行的 T1423 通用入口。应保留其历史约束，而非修改它适配本次打包。
3. **原生系统准入**：`docs/verification/t1246/USER_NATIVE_DECISION.md` 与 `APP_CASES.md` 记载当时用户未授权 XCTest 系统认证，AC5 未验；doctor/准备通过没有构成原生通过。T1423 当前新的本机安装/原授权恢复许可应按自己的精确范围记录，不倒改 T1246 历史，也不能由此推定可以绕过系统认证或工具层的 Native CUA 禁用。

本轮只读核查的固定 `package-local.mjs` / `package.mjs` 中未发现一个按 T1246 编号启用或关闭的通用打包开关；“不绕过 T1246”不能被解释为设置一个魔法变量。涉及对应受控测试/旧运行器时，必须保其真实条件与失败证据。

## 真正原生按钮验证的当前路线

Rust 真许可入口现为 `frontend/src-tauri/src/lib.rs:2293–2297` 注册的 command；`license.rs:3005–3037` 明确 `license_activate` / `license_check` 经 `run_chain_and_persist` 完成验签、防重放、防回拨和原生落盘。Node 本地 route 不是替代入口。现 release WebView 的 devtools 也只按 `cfg!(debug_assertions)` 开启（`lib.rs:2348`），不得新增检查端口或注入执行后门方便验收。

后续 T1423 新入口经过独立规格/代码评审、测试和干净提交，再打包安装后，用户从真实 App 设置页点击新按钮；Root 核对正确安装来源，记录脱敏的开始/结果状态、原生保存成功/失败、原授权不变和原经济对象复用。前后必须确认授权条件仍成立：另一有效绑定为 0、仅明确获准释放的失效旧绑定为 1；条件变更则停止本机提交，不扩大释放范围。

本会话当前不能自主驱动 Native UI。可由用户完成该次真实点击；只有真的发生并有准确来源证据，才记 native UI 结果。若未来使用正式 Appium/XCTest 等工具，应先验证工具与系统正常认证、精确 App 路径和数据边界，不因这份可行性审计就安装、触发认证或启动 session。不得用 AppleScript/cliclick 等替代方式规避当前 Native CUA 限制。

```mermaid
flowchart LR
 A[审核后干净提交] --> B[原四测试与固定产包入口]
 B --> C[新备份与副本保数据检查]
 C --> D[原安装器替换并启动真实App]
 D --> E[用户在App明确点击]
 E --> F[原生许可链与原经济对象读回]
 F --> G[分别报告包/安装/按钮/权益结果]
```

当前只有上述审计与公开 CLI 只读发现已执行；打包四测试、包生成、安装、原生恢复/释放、按钮验收和其他用户分发/服务端部署均未执行。下一步先完成 T1423 客户端及 Activity 合同独评，不能以打包准备替代产品准入。
