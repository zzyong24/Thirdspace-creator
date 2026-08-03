# T-663 BUILD Gate：内置 IP 课程与课程阅读器

> 状态：完成。代码 Gate、Windows 真安装/启动/卸载、macOS 流水线真启动与本机 DMG 二次启动均已通过。

## 发布资产

- 课程来源：`win-video-tutor` Skill；仅在设计追溯中记录来源，运行时不依赖开发机路径。
- 稳定课程 ID：`xuehui-ip-practical-course`
- 结构：6 个模块、22 节课、119 个知识点。
- 随包课程组合 SHA-256：`de10a7289f66937d2016c02adadc65c83a3d28175212a4e465bdd29b970b57c3`
- 构建前与 sidecar 复制后均执行 `frontend/scripts/verify-built-in-course.mjs`，数量、正文、逐课 hash 与组合 hash 任一不一致即失败。

## 已通过的代码 Gate

- 课程资产校验：PASS。
- 课程阅读器、课程解析、用户知识隔离、幂等投影聚焦测试：PASS（19/19）。
- 既有知识库页面、标签、经验、交互、关系图回归：PASS（50/50）。
- backend knowledge service：PASS（24/24）。
- frontend typecheck：PASS。
- backend typecheck：PASS。
- frontend production build：PASS。
- boundary scan：PASS；0 条新增物理架构违规。
- orphan scan：PASS；0 error。
- 独立 SPEC 评审：`PASS[REV:44fafb228b46]`。

## 全局 reconcile 现状

2026-08-02 预检时，T-663 自身未被报错；全局 reconcile 仍因既有任务 T-635、T-642、T-645、T-653、T-656 的旧审查回执漂移而失败。该失败不由本任务代码引入，最终验收不得把全局 reconcile 描述为通过。

## 双平台发布证据

两端均来自同一产品提交 `be0ba2504f509699e0d8455743760664fcb91c7f`，不存在 Mac / Windows 版本漂移。

### Windows

- GitHub Actions：run [30772646708](https://github.com/zzyong24/Thirdspace-creator/actions/runs/30772646708)，job `91562374297`，结论 `success`。
- artifact：`desktop-windows-x86_64`，ID `8841617264`，`1,080,007,284` bytes。
- 本机下载：`/Users/zyongzhu/Downloads/CreatorOS-build-be0ba250/windows/CreatorOS_0.2.1-beta.3_x64-setup.exe`。
- `Windows 安装期 runtime 原生冒烟(T-487)`：PASS；静默安装后 `runtime-current.txt`、`frontend/server.js`、传统完整 runtime 结构与入口哈希通过，安装成功后 `sidecar.tar.gz` 已删除。
- `Windows 安装后真启动与主页面加载冒烟(T-562)`：PASS；真实 GUI / WebView 主页面加载完成。
- `Windows 主动卸载清理冒烟(T-557)`：PASS；安装目录、runtime 与相关进程清理完成。
- 失败复盘：早先 run `30770276870` 证明安装器实际执行成功，但安装校验误把当前用户包的“传统完整 runtime”当成尚在独立 RAT 的“分层 runtime”，报缺 `creatoros-module-resolver.cjs`。`be0ba250` 将校验修正为与启动代码一致：传统完整布局或分层布局任选其一完整成立，混合残缺仍拒绝；未绕过结构或入口哈希检查。

### macOS

- GitHub Actions：run [30775208057](https://github.com/zzyong24/Thirdspace-creator/actions/runs/30775208057)，job `91569309712`，结论 `success`。
- artifact：`desktop-darwin-aarch64`，ID `8841910958`，`446,192,020` bytes。
- 本机下载：`/Users/zyongzhu/Downloads/CreatorOS-build-be0ba250/macos/CreatorOS_0.2.1-beta.3_aarch64.dmg`。
- 流水线 `macOS 真启动与主页面加载冒烟(T-663)`：PASS。
- 本机 DMG 二次启动：只复制到 `/tmp`，未覆盖 `/Applications`；展开 `31,384` 项、约 `1,084 MiB`，出现 `SIDECAR_STARTUP_VERIFIED`、`MAIN_PAGE_LOAD_FINISHED tauri://localhost` 与 `MAIN_PAGE_LOAD_FINISHED http://127.0.0.1:<动态端口>/`。
- 安装后课程资产校验：PASS；6 模块、22 课、119 知识点，组合 SHA-256 `de10a7289f66937d2016c02adadc65c83a3d28175212a4e465bdd29b970b57c3`。启动日志同时确认 `win-video-tutor` 22 条课程已按 module 投影。
