---
name: packaging-creatoros-channel
description: Use when CreatorOS 需要新建或复用渠道专属桌面包，或用户要求换标、渠道本地包、GitHub 双平台正式包、macOS 公证、Windows 安装包与渠道更新配置。
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
6. 先判断用户要的是哪一种动作：

   | 请求 | 唯一入口 | 停止点 |
   | --- | --- | --- |
   | 预检 | `desktop:package-channel ... --plan-only` | 只生成 staging 计划 |
   | 本地渠道包 | `desktop:package-channel ... --mode local-test` | 本机安装与真实进程 |
   | GitHub 正式渠道包 | `channel-package.yml` + `package_ref` | Actions artifact |
   | 对外发布 | 无默认入口 | 必须再次取得用户授权 |

7. 官方 CreatorOS 本机验收包只运行：

   `pnpm -C frontend desktop:package-local`

   该入口自动从 `~/.creatoros/` 读取 verdict 双密钥，并固定 CreatorOS projectKey、Growth origin、
   公共验签 keyId 与拉取开关。禁止再靠会话手工拼接这些环境变量；缺密钥必须在重型构建前失败。
   构建成功后固定产物为 `~/Downloads/CreatorOS-<version>.dmg`（Windows 为 `.exe`）；Tauri
   内部带架构后缀的 target 文件只属于构建细节，不作为用户验收入口。macOS 本地验收必须继续
   自动替换 `/Applications/CreatorOS.app`、启动应用并确认真实进程；只报告安装包路径不算交付。
8. 渠道专属包运行预检：

   `pnpm -C frontend desktop:package-channel -- --manifest branding/packages/<packageRef>/package.json --target <target> --mode local-test --plan-only`

9. 用户要求渠道本地包时移除 `--plan-only`。本地包不公证；只有用户明确要求 GitHub 正式渠道包时才进入下一条。
10. GitHub 正式渠道包只触发独立 workflow，禁止借用或修改官方 `desktop-release.yml`：

    `gh workflow run channel-package.yml --ref main -f package_ref=<packageRef> -f only=<macos|windows|all>`

    触发前确认渠道目录已提交且干净、远端 ref 包含候选 SHA、两端 plan-only 通过。workflow 只能从
    `frontend/branding/packages/<packageRef>/` 读取 manifest、identity lock 与图标，禁止接受任意路径、
    临时 URL 或密钥输入。跟踪同一 run；用户未要求时不下载 artifact。
11. macOS 正式 artifact 必须通过 Developer ID、notary submit、staple、Gatekeeper、identifier 与真实
    进程启动。Windows 目前可无 Authenticode，但证据和回报必须写 `unsigned-accepted-risk`，并完成
    NSIS 真安装、主页面启动和卸载；不得把 updater minisign 说成 Windows 代码签名。启动耗时只记录，
    不以 45 秒作为硬失败；无进展的安全总超时仍保留。
12. 用户已取消渠道打包的视觉校验：不得新增或运行截图/像素/视觉回归。品牌边界只跑现有静态
    `package-brand-surface` 契约、manifest 身份、安装身份与真实进程检查，不借打包任务改 UI。
13. 分四段回报：预检、构建、验证、产物。GitHub 正式包要给 run URL、候选 SHA、artifact 名/ID/
    digest、macOS 公证结论和 Windows 签名边界；默认停在 tag、Release、CDN/Growth 变更与用户放量之前。

## 安全边界

- 不读取、复制、打印或提交激活码、模型 Key、Apple 应用专用密码、代码签名私钥、updater 私钥。
- 集中 release root 私钥只在仓库外本机路径使用；渠道方不持有更新私钥。
- 不原地改公共 `tauri.conf.json` 或公共图标；只允许 `src-tauri/target/package-flavors/` staging。
- Growth 负责运行时品牌与业务链接；打包负责应用名、图标、identifier、Keychain/dataDir 和更新 namespace。
- 包级品牌只做激活前/离线兜底，不能覆盖已验签 Growth 品牌或硬编码 Growth 业务链接；Growth 暂不可用时宁可保留包品牌并让业务链接为空，也不得回退官方链接。
- 默认不上传、不发布、不修改 Growth；必须获得明确发布授权。
- GitHub workflow 的授权只包含构建并上传 Actions artifact，不自动包含 tag、GitHub Release、官网/CDN、
  Activity/Growth 版本地址或真实用户放量。
- 正常渠道出包不得顺手修改产品代码、视觉或官方 workflow；发现产品问题先停止并另行取得修改授权。
- 不得把 `CreatorOS.app.pre-*`、`before-*`、`backup-*` 等备份 App 留在 `/Applications`；
  Launchpad 会把它们识别成多个应用。替换安装前需要备份时只能放临时目录或废纸篓，验收完成后
  `/Applications` 只允许保留一个 `CreatorOS.app`。

更完整的输入表与 CDN 要求见 [reference](references/package-inputs.md)。
