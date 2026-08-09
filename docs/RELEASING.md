# 桌面版发布手册(渠道化分发,T-396c)

> 当前正式候选版本：`1.0.0`（T-728）。版本权威必须同时出现在
> `frontend/package.json`、`frontend/src-tauri/tauri.conf.json`、
> `frontend/src-tauri/Cargo.toml` 与 `frontend/src-tauri/Cargo.lock`；release manifest、安装包名和
> Growth bundle 的 `clientVersion` 均从这些受测输入派生。候选通过不等于已发布：创建
> `v1.0.0` tag、GitHub Release、上传/分发安装包、修改 Activity `latestVersion/downloadUrl` 或
> 正式放量，仍须用户在 T-728 最终检查点再次确认。

> 2026-07-19 起生效。SPEC:[渠道化链接 + 更新分发改造](superpowers/specs/2026-07-18-channel-links-and-update-distribution-design.md) §6。
> 更新模型 = **客户端只做版本检查,安装包经渠道(飞书/网盘)人肉分发**;不托管安装包、不走 Tauri updater 自动下载(endpoint 已摘,签名链保留可逆)。

## CreatorOS 本机验收包唯一入口

日常 macOS 本地验收包统一运行：

```bash
pnpm -C frontend desktop:package-local
```

该入口会自动读取 `~/.creatoros/verdict-signing.key` 与
`~/.creatoros/verdict-public.key`，并固定 `projectKey=creatoros`、Growth 正式 origin、公共验签公钥、
keyId 与配置拉取开关。私钥只从项目外本机目录读取，不写入仓库，也不输出到日志。缺失或空密钥会在
Next、sidecar、Rust 等重型构建之前明确失败。禁止日常验收继续手工拼接同一组环境变量；底层
`desktop:package` 只保留给 CI、渠道包装器和显式注入环境的高级流程。

成功后统一把最新产物复制为 `~/Downloads/CreatorOS-<version>.dmg`（Windows 为 `.exe`）。
用户只验收这个固定名称；`target` 内由 Tauri 生成的架构后缀属于构建细节。

macOS 日常本地验收的交付终点不是“生成 DMG”，而是入口脚本自动完成：退出旧应用 → 把本轮完整
App 复制到 `/Applications` 隐藏暂存位 → 原子替换唯一 `/Applications/CreatorOS.app` → 启动应用 →
确认真实应用进程。任一步失败都必须明确报错，禁止只把包路径发给用户。不得把
`CreatorOS.app.pre-*` / `before-*` / `backup-*` 留在 `/Applications`，否则 Launchpad 会显示多个
假版本；该目录最终只保留一个 `CreatorOS.app`。只有 CI 或明确只产物归档时，才允许显式设置
`CREATOROS_LOCAL_SKIP_INSTALL=1` 跳过本机安装。

## 发布一个新版本的完整动作

V1.0 发布说明草案见 [CreatorOS 1.0.0 发布说明](RELEASE_NOTES_V1.0.0.md)。正式发布前必须把
`RELEASE_REVIEW.md` 中仍为 `未验证` / `NO-GO` 的条目逐项关闭或由用户明确接受风险。

1. **出包**:先在 GitHub Actions Variables 配置
   `CREATOROS_FEEDBACK_OFFICIAL_ORIGINS`（唯一的 Growth 正式 HTTPS origin，只写
   `https://host`，不得逗号分隔多个地址）；再运行 `desktop-release` workflow(手动 dispatch 或 push `v*` tag)→
   双端安装包 + `.sig` + `latest.json`(仅内部记录)。缺少或写成带 path/query/hash 的地址时
   workflow 必须失败，不能产出可误投反馈的正式包。产物在 workflow artifact / draft Release,
   **不对外公开**。

### Growth 渠道配置验签材料（2026-08-05）

正式构建启用运行时渠道配置拉取时，GitHub Actions 还必须配置：

```text
Secret   CREATOROS_GROWTH_CONFIG_PUBLIC_KEY_B64 = cG3l6VkbAEENtr3ulPKufX9ajN57TWKZMM5gYDuE+WU=
Variable CREATOROS_GROWTH_CONFIG_KEY_ID          = growth-client-config-20260805-01
```

这两项是公开验签材料，不包含 Growth 私钥。Growth 私钥只保存在仓库外并由 Growth 运行环境读取；
完整安全引用、导出复核和轮换步骤以
`/Users/zyongzhu/Workbase/Thirdspace-growth/docs/operations/T-133-client-config-signing-trust-material.md`
为唯一运维记录。不得为了方便把私钥、seed 或母 Key 写进本仓、workflow 或安装包。

### macOS Developer ID 与 Apple 公证凭据（T-709）

`desktop-release` 的 macOS 正式 job 已改为强制签名与公证。仓库的
`Settings → Secrets and variables → Actions` 必须配置以下名称；缺少任一项，macOS job 会在构建
前失败，不再上传 `signed:false` / `notarized:false` 的正式安装包。

```text
Secrets
  APPLE_CERTIFICATE_P12_B64   Developer ID Application 的 .p12（含私钥）base64 单行值
  APPLE_CERTIFICATE_PASSWORD  导出 .p12 时设置的密码
  APPLE_ID                    Apple Developer 账号
  APPLE_APP_PASSWORD          Apple ID 的 app-specific password

Variables
  APPLE_TEAM_ID               Apple Developer Team ID
  APPLE_SIGNING_IDENTITY      完整证书名称，例如 Developer ID Application: Name (TEAMID)
```

准备原则：

- `.cer` 不含私钥，不能单独供 CI 签名；必须在持有对应私钥的钥匙串中导出带私钥的 `.p12`。
- `.p12` 转 base64 后只粘贴进 `APPLE_CERTIFICATE_P12_B64` Secret；原文件不得提交、上传 artifact
  或放进项目目录。其余密码同样只进 Secrets。
- workflow 在 `$RUNNER_TEMP` 创建一次性钥匙串，导入证书并创建临时 `notarytool` profile；打包后
  强制检查 release manifest、`codesign --strict`、`stapler validate`、`spctl`、DMG 挂载后的内层
  App 与真实启动，最后无论成功失败都删除钥匙串和临时证书文件。
- Runtime cache key 包含 Developer ID 证书 SHA-256 指纹；轮换证书会自动重建含已签名
  `server.app` 的 Runtime，避免复用旧身份缓存。
- 首次配置或轮换后，先手动运行一次 `desktop-release` 的 macOS-only job 验收；修改 workflow
  本身不等于已经完成远端发布。本节加入时按用户要求只改流水线，未触发运行。

2. **传包到渠道**:把安装包(mac `.dmg` / win `.exe`)手动上传到各渠道自己的飞书云盘/网盘,拿到各渠道的下载页链接(`https://` 链接)。
   - 官方直销渠道(`official`)同样上传一份,拿官方下载链接。
3. **后台配置**(activation-manager 后台,`https://license.aitongban.cloud`):
   - 更新全局版本公告:`latestVersion`(如 `0.2.0`)+ `releaseNotes`(人话更新说明);
   - 逐渠道更新 `Channel.downloadUrl` 为该渠道新包链接(只收 `https://`)。
4. **生效**:客户端设置页「检查更新」只 GET 当前包编译期固定的公开 manifest，并只读取
   `version/notes`；发现新版后跳当前包 `packageLinks.downloadUrl`。远端 manifest 的 URL 不进入
   DOM，用户下载后手动重装(mac 拖 Applications / win 跑安装器)。

## 红线与语义(勿破坏)

- **当前包入口缺失即诚实为空**；渠道包不得回退 CreatorOS 官网、下载或飞书反馈页。
- **包内官方链接零命中**:发布前跑字符串扫描(`#buy` / `creatoros.aitongban.cloud/#buy`,sidecar + 前端 bundle 双查,SPEC §8-1)。
- 人工反馈优先使用已验签 `bugFeedbackUrl`，缺失时只回退当前包 `humanFeedbackUrl`。自动提交不从
  人工页面推导 API origin，而只使用包内固定的唯一 Growth authority；提交 path 固定
  `/api/v2/product-feedback`，不接受 redirect。公钥或 authority 缺失时反馈发送 fail-closed，
  复制与本地文字保留仍可用。
- 检查失败一律人话文案(并入 T-412),`error sending request…` 这类技术报错只进日志。

## 恢复一键自动更新(可逆开关,后续如需)

1. 各渠道 `downloadUrl` 换成安装包**直链**(而非下载页);
2. `frontend/src-tauri/tauri.conf.json` `plugins.updater.endpoints` 回填端点;
3. 前端 check-update-card 恢复 updater 插件 `check()/downloadAndInstall()` 路径(git 历史 T-180 版本)。
   签名链(minisign pubkey + `createUpdaterArtifacts` + CI 上传 `.sig`)一直保留,无需重建。

## 关联

- 客户端实现:`frontend/src-tauri/src/license.rs`(`license_latest_version` / `.channel-links` 缓存)、`frontend/src/lib/desktop-updater.ts`、`frontend/src/features/settings/settings-interactive-region.tsx`(CheckUpdateCard)。
- 服务端(activation-manager 仓):`Channel` 实体 + `latest-version` 端点(T-396a,SPEC §3/§4)。
- 运维坑(auth-token Secure cookie / 数据备份):`docs/tasks/20260719_T-396_白标渠道链接落地_交接单.md` §6。
