---
name: packaging-creatoros-channel
description: 为 CreatorOS 新建或复用渠道专属桌面包；当用户提供品牌名、图标、渠道标识、业务链接并要求换标、打渠道包、本地测试包、正式发布包或配置增量更新时使用。
---

# CreatorOS 渠道专属包

## 目标

把渠道资料转成仓库内唯一 `PackageManifest`，复用共享 CreatorOS runtime，生成品牌壳、隔离身份与更新证明。安全规则由仓库脚本强制执行，不在对话里复刻。

## 固定流程

1. 先读 `BACKLOG.md`、任务 SPEC、`PROJECT.md`、`PROJECT_CONTEXT.md` 与 `orchestrator/SYSTEM_ARCHITECTURE.md`。
2. 收集合作伙伴公司名、品牌名、精确 `channelRef`、五个 HTTPS 业务链接、图标目录、目标平台、两个更新 origin，以及当前可交付的 Growth `productConfig` 权威来源。缺 `channelRef` 或更新 origin 时，只能归档素材和报告阻断，不得猜值；缺 `productConfig` 时可以继续做包，但不得声称已交付“完整 Growth 配置”。
3. 新渠道提出一次不可变身份建议：`packageRef`、`appIdentifier`、`keychainService`、Windows UpgradeCode；用户确认后写 `identity.lock.json`。已有渠道必须复用 lock。
4. 图标复制到 `frontend/branding/packages/<packageRef>/assets/`，记录 SHA-256；禁止长期引用微信、下载或临时目录。包构建还必须把经清单校验的品牌名与品牌图标编译进 WebView，作为未激活或 Growth 暂不可用时的离线品牌兜底。
5. 在项目根目录建立 `channel-partners/<合作伙伴公司名>/`，至少交付：精简六字段输入、合并 `channelService + productConfig` 的 `growth-product-config.json`、包身份/构建结果和说明。完整配置必须从已确认的当前 `productConfig` 合并生成，不得只把六个链接文件冒充完整配置。
6. 官方 CreatorOS 本机验收包只运行：

   `pnpm -C frontend desktop:package-local`

   该入口自动从 `~/.creatoros/` 读取 verdict 双密钥，并固定 CreatorOS projectKey、Growth origin、
   公共验签 keyId 与拉取开关。禁止再靠会话手工拼接这些环境变量；缺密钥必须在重型构建前失败。
   构建成功后固定产物为 `~/Downloads/CreatorOS-<version>.dmg`（Windows 为 `.exe`）；Tauri
   内部带架构后缀的 target 文件只属于构建细节，不作为用户验收入口。macOS 本地验收必须继续
   自动替换 `/Applications/CreatorOS.app`、启动应用并确认真实进程；只报告安装包路径不算交付。
7. 渠道专属包运行预检：

   `pnpm -C frontend desktop:package-channel -- --manifest branding/packages/<packageRef>/package.json --target <target> --mode local-test --plan-only`

8. 用户要求渠道本地包时移除 `--plan-only`。只有用户明确要求可发布包时才用 `--mode release`；签名、公证、真安装任一未跑不得写 PASS。
9. 安装后的白标验收必须同时覆盖系统表面和应用内部：应用名/identifier/图标、原生窗口标题、HTML 页面标题、侧边栏品牌名、侧边栏品牌图标。未激活时显示包级品牌；激活后只允许 Growth 已验签 `brandName` 覆盖名称，业务链接仍只认 Growth。对实际安装应用截图并人工查看；只验 `Info.plist`、进程或 DMG 不算完整白标验收。
10. 对用户可见源码和实际 DOM 做固定品牌残留扫描。协议名、环境变量、日志、数据目录、法律声明等内部/法务用途可保留 `CreatorOS`；窗口标题、侧边栏、欢迎页等品牌表面不得残留。发现残留必须修复或明确列入本次不适用证明，不能报完成。
11. 分四段回报：预检、构建、验证、产物。验证段必须附应用内部截图与 Growth 完整配置路径；默认停在上传/CDN/Growth 地址变更之前。

## 安全边界

- 不读取、复制、打印或提交激活码、模型 Key、Apple 应用专用密码、代码签名私钥、updater 私钥。
- 集中 release root 私钥只在仓库外本机路径使用；渠道方不持有更新私钥。
- 不原地改公共 `tauri.conf.json` 或公共图标；只允许 `src-tauri/target/package-flavors/` staging。
- Growth 负责运行时品牌与业务链接；打包负责应用名、图标、identifier、Keychain/dataDir 和更新 namespace。
- 包级品牌只做激活前/离线兜底，不能覆盖已验签 Growth 品牌或硬编码 Growth 业务链接；Growth 暂不可用时宁可保留包品牌并让业务链接为空，也不得回退官方链接。
- 默认不上传、不发布、不修改 Growth；必须获得明确发布授权。
- 不得把 `CreatorOS.app.pre-*`、`before-*`、`backup-*` 等备份 App 留在 `/Applications`；
  Launchpad 会把它们识别成多个应用。替换安装前需要备份时只能放临时目录或废纸篓，验收完成后
  `/Applications` 只允许保留一个 `CreatorOS.app`。

更完整的输入表与 CDN 要求见 [reference](references/package-inputs.md)。
