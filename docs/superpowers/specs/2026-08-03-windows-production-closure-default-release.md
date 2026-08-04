# T-675 Windows production closure 默认正式发布 SPEC

## 1. 背景与用户结果

用户确认恢复 2026-07-26 已验证的 Windows 打包逻辑，并要求今后的 Windows 安装包都走同一逻辑。诊断证据表明：旧候选包以少文件 production closure 交付，安装包约 465 MB、运行时 3,008 个文件、安装约 18 秒、首启约 17 秒；当前正式流水线重新打入完整依赖树，安装包约 1.08 GB、安装约 20 分钟、首启约 28 秒。差异来自打包路径漂移，不是业务功能增加本身。

本任务把已经通过 Windows 安装/离线首启验证的 production closure 提升为默认正式发布路径，并用硬门槛阻止后续退化。

## 2. 范围边界

### 2.1 本次包含

- Windows 正式 `build` job 与 Windows 候选验证 job 调用同一套 production closure 组装入口。
- production closure 只收集 Next standalone 闭包、Pi/Hyperframes 闭包、PGlite/Chromium/ffmpeg/ASR 等运行必需资源；不得携带开发依赖树。
- 继续使用当前 Windows NSIS 安装事务、正式产品身份、授权验签、代码保护、更新器元数据与发布产物命名。
- Windows 默认构建、手工 `only=windows` 构建和草稿发布都产出相同闭包形态。
- 将安装包体积、运行时文件数、`node_modules` 目录、链接/重解析点、安装耗时、首次启动与非白屏验证变成失败即停止的 Gate。
- 生成新的 Windows 安装包并下载到本机供验收。

### 2.2 本次不包含

- 不引入 Burn/Web Bootstrapper，不改变安装器产品交互；T-565 的原生 Burn 事务仍保持独立暂停范围。
- 不改变 macOS 打包逻辑。
- 不删除用户功能，不通过移除 Chromium、ffmpeg、ASR、数据库、AI/Agent 或视频能力来换体积。
- 不修改业务数据、数据库结构或用户本机迁移语义。

## 3. 已确认需求

### FR-675-01 单一默认逻辑

Windows 正式发布与候选验证必须复用一个可执行 production closure 组装入口。正式 `build` job 不得再调用会把完整依赖树带入安装包的 Windows full-runtime 路径。

### FR-675-02 功能闭包完整

裁剪依据必须是运行依赖闭包而不是目录白名单猜测。安装版在断网环境仍须完成 sidecar 启动、健康检查、WebView 非白屏、Next 静态/动态路由加载、PGlite 启动以及已随包能力的资源发现。已有 Windows runtime smoke、安装版 first-launch smoke 和非白屏检查继续执行。

### FR-675-03 正式发布属性不降级

恢复快包不得绕开正式产品身份、授权验签、构建保护、安装器签名条件、更新器工件和 release attestation。测试密钥与正式密钥仍按既有环境变量和失败关闭规则处理。

### FR-675-04 防退化 Gate

每次 Windows 正式构建必须校验并留下机器可读证据：

- 安装包不大于 600,000,000 字节；
- 最终运行时文件数不大于 3,500；
- 最终运行时 `node_modules` 目录数为 0；
- 最终运行时链接/重解析点为 0；
- CI 安装在 300 秒内完成；
- 安装后首次启动在 45 秒内进入可用且非白屏状态。

任一条件不成立必须使构建失败，禁止上传或发布“虽然能产出但已退化”的安装包。

### FR-675-05 可追溯与复用

正式工件须同时上传安装包、closure summary、安装/首启 smoke 证据和版本/commit 信息。后续改依赖或升级 Next/Node 时仍通过同一入口和同一 Gate 验证，不再维护第二套长期分叉逻辑。

## 4. 实现约束

1. 抽取一个仓内 Windows production closure 入口，封装现有 `tools/windows-closure-rat` 中已验证的 Next adapter、NCC、Pi bundle、materialize、finalize、assemble 与 packaged-runtime 准备步骤。
2. 候选 RAT 与正式 Windows build 都调用该入口；YAML 只负责安装系统依赖、缓存、执行入口、正式打包及 Gate，不复制闭包算法。
3. `frontend/scripts/desktop/release.mjs` 的正式保护/身份/更新器职责须保留；若其现有实现假定 full runtime，应调整为接受 closure 布局，而不是在正式路径绕过它。
4. 缓存键必须包含 closure 入口与所有相关脚本 hash；缓存命中后仍运行最终结构 Gate，不能把缓存当作可信证据。
5. Windows 工件保持现有 `desktop-windows-x86_64` 名称，避免草稿发布和用户下载链接失配。

## 5. 验收标准

### AC-675-01 默认路径唯一

从 `workflow_dispatch only=windows` 触发的正式 `build` job 日志可证明其调用 production closure 公共入口，且没有执行 Windows full `build-sidecar.mjs` 路径；候选 RAT 同样调用该入口。

### AC-675-02 结构和体积合格

正式安装包满足 FR-675-04 全部结构与体积门槛，并上传机器可读 summary。安装包大小相较当前约 1.08 GB 至少下降 40%。

### AC-675-03 安装与首次启动合格

GitHub Windows runner 从未安装状态执行新安装器，300 秒内安装完成；断网后 45 秒内健康检查和 WebView 非白屏通过，进程退出清理完成。

### AC-675-04 正式属性和工件合格

构建通过既有产品身份、授权、TLS、更新器/attestation 检查；标准 `desktop-windows-x86_64` 工件包含可安装 `.exe`，草稿发布输入不变。

### AC-675-05 本机交付

通过的 Windows 工件下载到本机明确目录，记录 GitHub run、commit、安装包字节数与 SHA-256；用户可以直接把该安装包交给 Windows 用户验收。

## 6. 失败与回滚

- closure 缺资源、安装超时、首启白屏或任一硬门槛失败：流水线失败，不发布工件。
- 正式保护链与 closure 布局冲突：修正兼容性后重跑，不允许临时绕过正式保护链出包。
- 回滚仅回滚工作流与组装入口的提交；不触碰用户数据。上一个已发布安装包继续可用，但不得把已知 1.08 GB 退化包重新标为本任务成功产物。

## 7. 证据引用

- `docs/research/2026-08-03-windows-v020-current-performance-regression.md`
- `docs/research/2026-07-27-windows-native-burn-transaction-rat-evidence.md`
- `docs/superpowers/specs/2026-07-27-windows-runtime-delivery-burn-transaction.md`
- `.github/workflows/desktop-release.yml`
- `tools/windows-closure-rat/prepare-packaged-runtime.mjs`
