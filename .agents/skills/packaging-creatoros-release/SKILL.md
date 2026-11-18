---
name: packaging-creatoros-release
description: Use when the user asks to build, package, prepare, or inspect official CreatorOS desktop installers, including 本地包、正式包、官方包、v1.0、macOS DMG、Windows setup、GitHub Actions、Apple 签名或公证；不用于渠道包或白标包。
---

# CreatorOS 官方打包

## Agent 必须直接执行的本地流程

用户说“编译”“打包”“共创开发包”，且没有明确要求正式发布时，直接执行本节，不能只在聊天里给命令、让用户自己配密钥或套用后文的正式冻结检查。已克隆仓库就在当前仓库执行；不重复克隆，不要求先提交改动。工具缺失先按下方补齐，安装完成后继续构建；仅系统安装器必须本人点击或提权时，说明当前具体需要的操作。

### 已有开发环境：安装依赖并出包

在仓库根目录执行，第一条失败先修复依赖安装，再继续第二条；不要带着依赖安装失败继续构建：

```bash
pnpm install --frozen-lockfile
pnpm -C frontend desktop:package-local
```

第二条已经包含前端、Worker、资源包和Rust桌面壳的构建，不需要先重复执行完整编译。如果用户只要求编译Web而不生成安装包，则第二条改为：

```bash
pnpm -C frontend build
```

### 新电脑：缺什么补什么

先运行`node --version`、`pnpm --version`、`rustc --version`、`cargo --version`。Node须为25，pnpm以根`package.json`的`packageManager`为准（当前10.32.1）；已有正确版本直接复用。Node参考版本25.9.0与仓库正式workflow一致。已有nvm/fnm等管理器时用原管理器切换，不重复安装。

macOS（zsh），仅执行缺失项；Homebrew缺失时按[Homebrew官方安装入口](https://brew.sh/)安装后继续：

```zsh
# 缺Apple编译工具时执行，等待系统安装完成后继续
xcode-select --install

# 缺Node 25且没有可用版本管理器时执行
brew install fnm
eval "$(fnm env --shell zsh)"
fnm install 25.9.0
fnm use 25.9.0

# 缺pnpm或版本不符时执行
npm install --global pnpm@10.32.1

# 缺Rust时执行；已有Rust时跳过这两条
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
source "$HOME/.cargo/env"

# 缺视频工具时执行
brew install ffmpeg
```

Windows（PowerShell），仅执行缺失项；新安装工具后刷新PATH或重开终端，再继续当前步骤：

```powershell
# 缺Node 25且没有可用版本管理器时执行
winget install --id Schniz.fnm --exact
fnm env --shell powershell | Out-String | Invoke-Expression
fnm install 25.9.0
fnm use 25.9.0

# 缺pnpm或版本不符时执行
npm install --global pnpm@10.32.1

# 缺Rust时安装；桌面目标使用MSVC工具链
winget install --id Rustlang.Rustup --exact
rustup toolchain install stable-msvc --profile minimal
rustup default stable-msvc

# 缺C++桌面编译工具时执行，等待安装完成
winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Windows还需WebView2，通常系统已有；确实缺失时按[Tauri官方依赖说明](https://v2.tauri.app/start/prerequisites/#windows)安装Evergreen Runtime。Node管理器命令来源：[fnm官方说明](https://github.com/Schniz/fnm#installation)。补齐后回到上面的`pnpm install --frozen-lockfile`和本地打包命令，不能停留在“缺依赖”的说明。

### 本地打包的失败处理与交付

- 缺verdict、正式更新根、Apple证书、公证凭证或updater私钥：继续使用本地入口自动准备开发密钥、ad-hoc签名和跳过updater制品；不索要这些正式凭证，不运行会打印私钥的keygen命令。
- 继承了正式模式变量：确认本次确为本地请求后，macOS执行`unset CREATOROS_RELEASE CREATOROS_CHANNEL_PACKAGE_MODE`；PowerShell执行`Remove-Item Env:CREATOROS_RELEASE, Env:CREATOROS_CHANNEL_PACKAGE_MODE -ErrorAction SilentlyContinue`，再执行本地入口。不在GitHub正式workflow内解除正式守卫。
- 缺依赖、Node版本不符、Rust或系统编译器缺失：按本节补齐后重新执行，不把首次环境错误当最终交付。下载失败保留原校验并重试，不能删除功能或关掉校验来凑包。
- 模型API密钥、GitHub登录、隔离测试数据库、全项目reconcile和干净工作树都不是本地出包前提；不把这些无关事项变成打包阻断。
- 只要安装包、不安装到当前电脑时，macOS先执行`export CREATOROS_LOCAL_SKIP_INSTALL=1`，PowerShell先执行`$env:CREATOROS_LOCAL_SKIP_INSTALL="1"`，再运行同一本地命令。不要因安装权限或已有应用正在运行而拒绝执行只产包请求。
- 命令完成后检查实际安装包并报告绝对路径：macOS为`~/Downloads/CreatorOS-<version>.dmg`，Windows为用户`Downloads`目录下的`CreatorOS-<version>.exe`。构建未完成就继续处理当前具体错误，不能只返回命令或预期路径冒充交付。

## 先区分本地开发包和正式包

开发者修改代码后自行测试，默认走本地包；不要求先提交代码或恢复正式密钥。只运行：

```bash
pnpm -C frontend desktop:package-local
```

需要Node 25、pnpm依赖、Rust/Tauri和当前系统的构建工具。入口自动在`~/.creatoros/local-build-keys/`建立并复用独立开发密钥；完整的既有verdict密钥仍优先复用。无需提供正式更新根、Bitwarden、Apple或updater私钥，不运行会打印私钥的keygen脚本，不把用户提供的PEM复制进仓库。资源签名、启动校验、激活与权益规则保留。

本地允许未提交代码，先看`git status`和`git diff --check`记录候选。检查版本一致及实际构建错误，不以工作树不干净、缺正式密钥或没有公证凭证拒绝打包。没有Apple证书时使用ad-hoc，没有updater私钥时跳过updater制品。要只产包、不替换本机现有应用时设置`CREATOROS_LOCAL_SKIP_INSTALL=1`；默认沿用自动安装启动。构建失败按实际错误报告；用户已授权修复时继续修复，不重复索要同一授权。

产物为`~/Downloads/CreatorOS-<version>.dmg`或`.exe`。本地开发包不得描述为已公证正式包；没有运行完整安装/启动验收时准确说明。开发根只固化到本地构建，正式release与GitHub Actions拒绝使用它。

## 正式打包的核心原则

以下冻结检查和完整签名链只适用于正式包。把正式打包视为代码冻结期。只合并已经获得用户批准并已提交的代码、执行基本安全预检、调用现有打包入口和核验产物。

**打包期间严禁修改产品代码、交互、视觉、测试断言、构建脚本、workflow 或文档来消除失败。** 任一步失败都停止并报告；需要修复时退出正式打包流程，按已有修复授权完成独立任务并提交后再重新冻结；没有修复授权时说明需要修改的具体内容。

## 先确认授权边界

区分以下动作，不相互推定授权：

| 动作 | 所需授权 |
| --- | --- |
| 本地快速官方包 | 用户要求本地打包 |
| 合并、推送、触发正式双平台构建 | 用户明确要求正式打包 |
| 创建版本 tag、GitHub Release、上传或公开分发 | 用户对发布动作再次明确确认 |
| 修改 Activity/Growth 版本、下载地址或向真实用户放量 | 用户对生产变更再次明确确认 |

未获后一项授权时，只产出并下载 GitHub Actions artifacts，不创建 tag 或 Release，不改生产配置。

## 正式包冻结检查

在正式构建前执行：

1. 用 `git status --porcelain=v1` 证明工作树干净，用 `git diff --check` 证明无冲突标记或空白错误。
2. 记录当前分支和精确 `HEAD`；只接受已经提交且属于用户批准范围的候选。发现未提交文件、未合并路径或范围不明的提交时停止。
3. 核对 `frontend/package.json`、`frontend/src-tauri/tauri.conf.json`、`frontend/src-tauri/Cargo.toml` 与 `frontend/src-tauri/Cargo.lock` 的版本完全一致，并等于用户指定版本。
4. 检查候选相对 `origin/main` 的提交和文件清单，确认没有私钥、token、密码、激活码或渠道清单进入提交。不得读取或打印 GitHub Secrets 的值。
5. 只运行打包相关基本测试，不运行视觉校验，也不借打包触发全量产品改造：

   ```bash
   pnpm -C frontend exec vitest run \
     scripts/desktop/package-local.test.mjs \
     scripts/desktop/desktop-release-workflow.test.mjs \
     scripts/desktop/notarize.test.mjs \
     scripts/desktop/tauri-signing-config.test.mjs
   ```

预检失败即停止。禁止 `apply_patch`、自动修复、放宽检查或改测试洗绿。

## 正式双平台官方包

1. 执行 `git fetch origin`，再次确认冻结检查通过。
2. 若 `origin/main` 是候选 `HEAD` 的祖先，以非强推方式把候选快进到 `main`。若已分叉，只允许普通合并 `origin/main`；出现冲突立即停止，不在打包阶段解决冲突或改代码。
3. 推送候选分支和 `main`，禁止 force-push。重新 fetch，并证明 `origin/main` 等于候选 SHA。
4. 从 `main` 手动触发现有正式 workflow 的双平台矩阵：

   ```bash
   gh workflow run desktop-release.yml --ref main -f only=all
   ```

5. 持续跟踪同一 run。失败时保留 run URL、失败 job 和原始日志摘要并停止，不修改代码自救。
6. 成功后下载 artifacts 到独立目录，计算每个安装包 SHA-256。

正式成功必须同时有以下证据：

- macOS job 成功，且日志证明 Developer ID 签名、Apple notarization、staple、Gatekeeper、DMG 内应用校验和真启动均通过。
- Windows job 成功，且日志证明 NSIS 真安装、主页面真启动和卸载清理通过。
- artifacts 同时包含用户可安装的 macOS `.dmg` 与 Windows `setup.exe`。
- Windows 没有 Authenticode 时明确写“Windows 未签名（用户已接受）”，不得暗示已签名。

## 正式包禁止事项

- 不运行视觉校验，不改视觉。
- 不把官方包转成渠道包，不设置渠道 manifest 或白标环境。
- 不使用 `git reset --hard`、覆盖式 checkout、force-push 或删除用户改动。
- 不因“只是安全增强”“顺手修一下”“不修就发不了”而越权改代码；这些理由都意味着停止并向用户报告。
- 不把 workflow 定义存在当成公证成功；只认当前候选 SHA 对应 run 的真实日志和产物。

## 正式包交付回报

精确报告候选 SHA、`main` SHA、GitHub run URL、四项基本测试、macOS 公证链、Windows 未签名边界、两个安装包路径和 SHA-256。另列未执行事项：tag、GitHub Release、公开分发、Activity/Growth 更新和真实用户放量。
