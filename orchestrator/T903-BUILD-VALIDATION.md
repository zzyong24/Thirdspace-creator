# T-903 macOS 本地包验证

> 日期：2026-08-19（America/Los_Angeles）
> 候选：`389cc4d42e067aa23915e34ff945f25969d22590`
> 版本：CreatorOS 1.1.0（arm64）

## 冻结与基础检查

- 构建前工作树干净，`git diff --check` 通过。
- `frontend/package.json`、`tauri.conf.json`、`Cargo.toml` 与 `Cargo.lock` 的 CreatorOS 版本均为 `1.1.0`。
- 相对 `origin/main...HEAD` 的新增内容未命中 API Key、私钥或凭据赋值扫描。
- 官方打包四项测试 42/42 通过：本地包、正式流水线、公证入口、Tauri 签名配置。

## 构建、镜像与安装

- 唯一入口：`pnpm -C frontend desktop:package-local`
- 产物：`/Users/zyongzhu/Downloads/CreatorOS-1.1.0.dmg`
- 大小：434,478,001 bytes
- SHA-256：`cd3fca61bebde8bfbda0aa36dabbfda0b07441e11785f90066bdd54b2f6dd7ce`
- `hdiutil verify`：VALID。
- 应用内嵌 sidecar、Chromium、ffmpeg/ffprobe、本地 Whisper 闭包自检和混淆后真实启动冒烟均通过。

## 本机验收

- 已替换安装：`/Applications/CreatorOS.app`
- Bundle ID：`cloud.aitongban.creatoros`
- 已安装版本：`1.1.0`
- `codesign --verify --deep --strict`：通过；本地包使用 ad-hoc 签名。
- 已真实启动，进程 `/Applications/CreatorOS.app/Contents/MacOS/CreatorOS` 持续存活。

## 发布边界

这是本机验收包，不是 Apple 公证正式包；本轮未创建 tag/GitHub Release，未上传、未修改下载地址，
也未向真实用户放量。
