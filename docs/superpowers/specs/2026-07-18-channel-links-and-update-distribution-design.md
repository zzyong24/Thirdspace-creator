# T-396 渠道化链接 + 更新分发改造 SPEC

> 2026-07-18 · 用户口述两拍板,方案当日对齐认可。改商业模型+数据归属 → 须过 spec-review gate 方可开工。

## 1. 背景与问题

1. **渠道冲突**:产品将经代理分发。现客户端硬编码官方链接——[activate/page.tsx:16](../../../frontend/src/app/activate/page.tsx) `CONTACT_URL`、[settings-interactive-region.tsx:1050](../../../frontend/src/features/settings/settings-interactive-region.tsx) `PURCHASE_URL`,均指 `creatoros.aitongban.cloud/#buy`。代理的终端用户从激活页/设置页一点即达官方定价页,代理无法卖高价 → 渠道模型不成立。
2. **更新分发成本**:Tauri updater 需公网托管完整安装包(918MB/端)。GitHub repo 为私有,release 不可公开下载;转 OSS/CDN 则流量成本 = 包体 × 用户数 × 更新频次,过高。
3. **用户拍板(2026-07-18)**:①跳转链接跟激活码走,后台一次配置,单一安装包,绝不 per-代理打包;②更新只做版本检查,有新版跳渠道链接(飞书/网盘)用户自行下载,不托管安装包。

## 2. 目标 / 非目标

**目标**
- G1 客户端所有对外商业跳转(购买/续期、联系授权方、新版下载)按激活码所属渠道运行时下发;包内官方链接硬编码清零。
- G2 更新改为「版本检查 + 跳渠道下载页」;退役内置下载/安装流(保留可逆开关)。
- G3 单一安装包全渠道通用;代理配置改动即时生效(下次心跳/检查),零发版。
- G4 渠道配置防篡改:复用 T-372 L1s 的 Ed25519 签名响应链。

**非目标**
- 不做代理自助后台(链接由我方在 activation-manager 后台代配——入口可控,防恶意链接)。
- 不做 UI 白标(产品名/logo 不渠道化,只链接渠道化)。
- 不在本期恢复自动下载安装(架构不封死:updater 签名产物链保留,后续把渠道 downloadUrl 换直链+启用 updater 即可)。

## 3. 数据模型(activation-manager,非本仓)

- 项目(=代理/渠道)维度加 `channel_config` JSON 列:
  ```json
  { "purchaseUrl": "https://…", "supportUrl": "https://…", "downloadUrl": "https://…" }
  ```
  三键皆可空;仅接受 `https://` 与飞书等白名单协议头,后台表单校验。
- 官方直营 = 官方项目配官方链接;不配 = 客户端中性降级(见 §5)。
- 应用版本公告:后台可编辑 `latestVersion` + `releaseNotes`(全局一份,downloadUrl 按渠道取各自 channel_config)。

## 4. 下发链路

- `activate` / `status` 响应体加 `channelConfig` 字段,随既有 Ed25519 签名(签名串含 digest,免费获得防篡改)。
- 新端点 `POST /api/app/latest-version`(带激活码):返回 `{ latestVersion, releaseNotes, downloadUrl }`(downloadUrl = 该码渠道的配置),同签名链。无码/无效码 → 只回版本号,downloadUrl 为 null(不泄默认渠道)。
- 客户端 Rust(license.rs 既有验签)验签通过后,`channelConfig` 落 `<appDataDir>` 缓存文件(进 reset PRESERVE 名单);验签失败弃用,保留旧缓存。
- 缓存文件带 `version` 字段(schema 版本):客户端读到不匹配版本 → 丢弃,走激活/心跳路径重取(向前兼容零迁移)。
- 生效时延:channelConfig 随心跳刷新——内测码心跳 60min(T-372 L3 拍板值),即后台改链接后「重启立即生效,不重启 ≤ 心跳周期(60min)+ 边际」;§8-2 的 61min 即由此来。

## 5. 客户端链接层(frontend)

- 新模块 `channel-links`:读缓存 → `getChannelLink(kind: "purchase" | "support" | "download"): string | null`。
- [activate 页](../../../frontend/src/app/activate/page.tsx):有 `supportUrl` → 「联系授权方」;null → 纯文案「请联系你的授权方获取激活码」,**不渲染任何链接**(未激活时本就不知渠道,这正是代理要的不泄露)。
- settings「购买/续期激活码」:有 `purchaseUrl` → 跳转;null → 隐藏该入口。
- 删除 `CONTACT_URL` / `PURCHASE_URL` 硬编码;验收含包内字符串扫描(§8-1)。

## 6. 更新流改造

- [check-update-card](../../../frontend/src/features/settings/check-update-card.tsx) 改:调 §4 版本检查端点 → 语义比较版本 → 新版:显示「发现新版本 vX.Y」+ releaseNotes + 「去下载」按钮(openUrl 渠道 downloadUrl;null → 显示「联系你的授权方获取新版」)。
- 内测码 revoked/过期:不提示更新(沿 T-372 L3「停更新」语义,实现反而更简单)。
- Tauri updater:`tauri.conf.json` 移除 updater endpoint(插件保留,`createUpdaterArtifacts` 与 minisign 签名链保留——可逆开关)。**范围 = mac/win 双端一致**(共享 conf;更新检查改走渠道体系是双端同语义,与 DEC-W「Windows 入正式分发」不冲突——win 用户同样走「检查+跳渠道链接」)。
- CI(desktop-release.yml):产物仍构建+签名+上传 artifact(内部取用);`merge-latest` 保留(latest.json 仅内部记录)。发布动作 = 手动传安装包到飞书/网盘 + 后台更新 latestVersion 与各渠道 downloadUrl。

## 7. 安全与降级

| 场景 | 行为 |
|---|---|
| 响应被篡改(假服务器/中间人) | 验签拒,弃用;沿用旧缓存或中性降级 |
| 离线 | 用缓存;无缓存(未激活+离线)→ 中性降级(无链接) |
| 恶意/失效代理链接 | 我方后台代配可控;协议头白名单;可随时改,下次心跳生效 |
| 服务端未配 channel_config | 同 null,中性降级,不回退官方链接(防代理码用户看到官方页) |
| **应用内重置工作区** | channelConfig 缓存文件进 reset PRESERVE 名单(同 `.license`/activation_state 既有规则,T-363),重置不丢 |
| **重装系统/换机(缓存全丢)** | 激活码→项目(渠道)归属**持久在服务端**(activation-manager 现有模型),重新联网激活即重新拿到同一份 channelConfig——G3 在此场景的语义 = 「重装后 ≤1 次联网激活即恢复渠道链接」;首次联网激活前走中性降级 |

**中性降级的操作定义**(验收 §8-3 以此为准):
- activate 页:纯文案「请联系你的授权方获取激活码」,无链接无按钮;
- settings「购买/续期激活码」入口:整个隐藏(非 disabled);
- settings 检查更新:有新版但 downloadUrl 为 null → 显示「发现新版本 vX.Y,请联系你的授权方获取」,无下载按钮。

## 8. 验收标准(量化)

1. 打包产物字符串扫描:`#buy`/`creatoros.aitongban.cloud/#buy` 0 命中(sidecar+前端 bundle)。
2. 同一安装包:官方码激活 → 两处跳转=官方链接;代理码激活 → =代理链接;后台改链接 → 重启或下次心跳(≤61min)后生效。
3. 未激活+无缓存:激活页无任何外链,显中性文案。
4. 版本检查:服务端 latestVersion > 当前 → 提示+「去下载」开渠道链接;revoked 内测码 → 不提示。
5. 假服务器返回未签名/坏签名 channelConfig → 客户端拒用(Rust 测锚)。
6. `pnpm verify` 相关包绿 + license.rs 测绿 + activation-manager 测绿。

## 9. 切片

- **T-396a 服务端**(activation-manager 仓):`channel_config` 列+后台表单+`latest-version` 端点+签名接入+单测。
- **T-396b 客户端链接层**:Rust 侧 channelConfig 验签落缓存(PRESERVE)+ 前端 `channel-links` 模块 + 两处硬编码跳转改造 + 激活页/设置页降级 + 测锚。
- **T-396c 更新流**:check-update-card 改版本检查+去下载;禁用 updater endpoint(保留产物链);CI 注释与发布手册(RELEASING 流程:传包+配后台)更新。

依赖:T-396b/c 依赖 T-396a 端点契约(可先按契约 mock 并行)。**T-372 L1s 签名链部署状态(gate 审出,如实记)**:服务端签名代码已上线(activation-manager dfe7cfc)、密钥对已生成冷备(`~/.creatoros/license-signing-keypair.txt`)、客户端公钥已嵌入(license.rs),**私钥配入 license.aitongban.cloud 服务器尚待用户执行**(无 ssh 凭据代部署不了)。开发/单测不阻塞——license.rs 测试已有 fake keypair 注入模式,T-396b 同法;**E2E 验收(§8-2/4/5)以私钥部署完成为前置**,未部署前如实标「待部署验收」。

## 10. 诚实边界

- 放弃一键自动更新:用户手动下载重装(mac 拖 Applications / win 跑安装器)。用户拍板接受;恢复路径保留。
- 渠道配置依赖激活链路:完全离线的未激活用户直到首次联网激活才有渠道链接。
- 更新提示靠检查(启动+设置页手动),非服务端推送。
