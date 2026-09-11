# T-955 本地体验包

2026-09-11 用户要求“本地打包我看下”。范围：从已批准并提交的 `39c5749e9ae2560a9bd7a7db5fab964c8e94971b` 生成本机 macOS 包，沿固定入口安装并打开供用户验看。沿用当前版本，不发布网络更新。

进入 SHIP，本次不改产品或构建代码。在独立干净 worktree 核验版本一致、提交范围和安全预检；运行打包四项基础测试及 desktop:package-local。完成后核验 SHA-256、hdiutil verify、codesign 和真实进程/启动日志。数据目录保持原样，不运行产品测试、重置或清库。

## 结果

- 候选：`39c5749e9ae2560a9bd7a7db5fab964c8e94971b`，源分支 `codex/t793-local-package`，独立干净 detached worktree `Thirdspace-creator-t955-package`。构建前后 `git status --porcelain` 为空，`git diff --check` 通过。版本四处一致为 1.1.0。
- 相对 origin/main 文件清单已审查；凭据文件名与私钥/token 模式扫描未命中。本轮不推送、不改 main。
- 官方入口 `CREATOROS_LOCAL_SKIP_INSTALL=1 pnpm -C frontend desktop:package-local`。42 项基础测试通过。首次因本机缺 chromium_headless_shell-1223 在运行时冒烟失败；补装锁定 Playwright 对应浏览器后重复预检与完整构建通过，未改产品代码、构建脚本或断言。
- 打包侧真实 sidecar：ready、GET / 200、browser hydration PASS。本地 ad-hoc 签名；未 Apple 公证，不是公开发布包。
- 产物：`/Users/zyongzhu/Downloads/CreatorOS-1.1.0.dmg`，445493750 字节。SHA-256 `1067d17b9eba83ccfdab98ac2e14d8bf6c979d3b3f7c5e7f8208487a0ea8c14d`。`hdiutil verify` VALID；`codesign --verify --deep --strict` 通过。
- 安装前正常退出旧应用；数据快照 `/Users/zyongzhu/.creatoros/backups/t955-20260911/app-data`，db 1800 个文件逐一 SHA-256 校验一致。没有清库、重置、恢复覆盖或删除媒体。
- 经固定入口导出的 `installAndLaunchLocalMacApp` 安装到 `/Applications/CreatorOS.app`，真实 PID 85188；sidecar PID 85306，127.0.0.1:51594。首页 HTTP 200，72697 字节，含正常 CreatorOS/项目内容，无 Application error。
- 已安装二进制 SHA-256 `79b1d2ad5c7d76fa045bd07bf9b597c70d4aaa2dd01e4885a19de1ff670b4eaa`，与冻结包 attestation 一致；安装版 codesign 验证通过。

本轮只做本地打包基本验证，不跑视觉/全量产品验证。既有全局 reconcile 233 漂移归 T-916，沿 T-954 记录保留，不声称本轮全局全绿。T-954 真实模型效果对照仍未验收。没有创建 tag、GitHub Release、上传公开分发、更新 Activity/Growth 或向用户放量。

