# 桌面版发布手册(渠道化分发,T-396c)

> 2026-07-19 起生效。SPEC:[渠道化链接 + 更新分发改造](superpowers/specs/2026-07-18-channel-links-and-update-distribution-design.md) §6。
> 更新模型 = **客户端只做版本检查,安装包经渠道(飞书/网盘)人肉分发**;不托管安装包、不走 Tauri updater 自动下载(endpoint 已摘,签名链保留可逆)。

## 发布一个新版本的完整动作

1. **出包**:GitHub Actions `desktop-release` workflow(手动 dispatch 或 push `v*` tag)→ 双端安装包 + `.sig` + `latest.json`(仅内部记录)。产物在 workflow artifact / draft Release,**不对外公开**。
2. **传包到渠道**:把安装包(mac `.dmg` / win `.exe`)手动上传到各渠道自己的飞书云盘/网盘,拿到各渠道的下载页链接(`https://` 链接)。
   - 官方直销渠道(`official`)同样上传一份,拿官方下载链接。
3. **后台配置**(activation-manager 后台,`https://license.aitongban.cloud`):
   - 更新全局版本公告:`latestVersion`(如 `0.2.0`)+ `releaseNotes`(人话更新说明);
   - 逐渠道更新 `Channel.downloadUrl` 为该渠道新包链接(只收 `https://`)。
4. **生效**:客户端设置页「检查更新」调 `POST /api/app/latest-version`(带激活码,Ed25519 验签)→ 语义比较版本 → 显「发现新版本 vX.Y」+「去下载」跳**该码渠道**的 downloadUrl。用户下载后手动重装(mac 拖 Applications / win 跑安装器)。

## 红线与语义(勿破坏)

- **无码/无效码请求 latest-version 只回版本号,downloadUrl=null**(不泄默认渠道);客户端 downloadUrl=null → 显「请联系你的授权方获取新版」,**绝不回退官方链接**。
- **revoked/过期内测码不提示更新**(T-372 L3「停更新」语义;买断签名撤销 = updatesBlocked 停用检查入口)。
- **包内官方链接零命中**:发布前跑字符串扫描(`#buy` / `creatoros.aitongban.cloud/#buy`,sidecar + 前端 bundle 双查,SPEC §8-1)。
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
