# T-907 本地打包验收记录

## 结论

CreatorOS 1.1.0 macOS 本地验收包已从已提交候选构建完成，已替换安装到 `/Applications/CreatorOS.app` 并真实启动。当前安装包包含 T-906 的 AI 助手默认放大、右下角拖拽缩放和跨启动尺寸记忆。

## 候选与冻结检查

- 候选提交：`d827f7754d17a9fd6d1ee8ce1142a5b06926982b`
- 对照 `origin/main`：`1e17f692a0829bafab79524a2bd9c15a71b4d4de`
- 隔离打包工作区：干净；`git diff --check` 通过。
- 版本一致性：`frontend/package.json`、`tauri.conf.json`、`Cargo.toml`、`Cargo.lock` 均为 `1.1.0`。
- 候选新增差异敏感信息扫描：未发现私钥标记或凭据形态赋值。

## 打包验证

- 官方四项打包测试：4 个测试文件、42 个测试全部通过。
- 固定入口：`pnpm -C frontend desktop:package-local` 成功。
- 混淆后运行时冒烟：ready、首页 200、浏览器 hydration PASS、未授权 dispatch 403。
- DMG：`/Users/zyongzhu/Downloads/CreatorOS-1.1.0.dmg`
- DMG 大小：约 414 MB。
- SHA-256：`d126a729fef5d78e18c00af0b29358aa70ee3d18214113da08cdce3be08936a4`
- `hdiutil verify`：VALID。
- 安装位置：`/Applications/CreatorOS.app`
- 真实启动：主进程 PID `56796`，复核时 CreatorOS 为前台应用。

## 发布边界

这是本机验收用的 ad-hoc 签名包，release manifest 为 `signed:false`、`notarized:false`。本次未创建 tag、GitHub Release，未公开分发，未更新 Activity/Growth 下载地址，也未向真实用户放量。

T-906 的最终视觉与手感仍以用户在当前已启动应用中的真机确认作为验收结论。

## 全局一致性检查

`pmem sync` 已完成。全局 `reconcile` 仍报告 100 条既有任务收据/教训账本漂移，其中包括历史任务缺少验收列、旧 receipt 失效、LED-024 复发，以及本次范围外的 T-905 验收值；本次打包相关检查、产物校验、安装和真启动均已独立通过，因此按范围外既有欠债如实保留，不伪报全局全绿，也不在打包任务中修改这些历史问题。
