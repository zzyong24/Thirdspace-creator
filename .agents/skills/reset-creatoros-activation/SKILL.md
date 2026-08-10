---
name: reset-creatoros-activation
description: Safely clear only the current macOS or Windows machine's local CreatorOS activation state, plus locked white-label activation state on macOS, while preserving projects, positioning versions, accounts, knowledge, assets, radar data, collection snapshots, logs, machine identity, master key, database, workspace, and channel-scoped model credentials. Use when the user asks to reset, clear, switch, or re-enter an activation code without deleting any content.
---

# 重新输入 CreatorOS 激活码

正式版优先引导用户从“设置 → 当前激活信息 → 重新输入激活码”操作。产品会先确认旧 sidecar
已经退出，再按原生固定白名单退出当前 macOS / Windows 设备的本机激活权益，并整体重启到既有
激活页。不要另写删除命令，也不要把“清激活”扩展成“清数据”。整个动作纯本地运行，不包含激活
服务器地址，不发起网络请求。

## 固定边界

只允许处理：

- `.license`
- `.license-seen`
- `.channel-model-config`
- `.channel-links`
- macOS：目标包自己的 Preferences 域 `<appIdentifier>.license`
- Windows：当前用户目录下的 `.creatoros-seen` 防回拨冗余点
- 仅官方包可处理待恢复领取记录：macOS Keychain `com.creatoros.desktop.entitlement-consume/pending-consume-v1`，或 Windows Credential Manager 精确目标 `pending-consume-v1.com.creatoros.desktop.entitlement-consume`；白标包必须保留这条共享日志，禁止把它当成渠道专属记录

必须保留：

- `db/`、`.auth/`、`logs/`
- `machine-id`、`.master-key`
- `~/CreatorOS`
- 项目、定位版本、知识库、素材、账号登录态、内容雷达及采集快照
- 渠道作用域下已经保存的模型凭据和用户选择
- 服务端的激活码消费、设备绑定、吊销和换码记录

禁止运行宽泛删除命令，禁止删除整个应用数据目录、主 Preferences 域或 Keychain 中其他条目。

## 产品内执行流程

1. 用户打开 CreatorOS 设置中的当前激活信息。
2. 点击“重新输入激活码”，核对确认框明确写明的保留项和“服务端不解绑”边界。
3. 点击“确认并重新启动”。不得要求普通用户运行脚本、终端或独立 EXE。
4. 等待 CreatorOS 整体重启并进入既有激活页，再输入新码。

产品入口报错时如实报告，不能扩大删除范围。只有旧版本无法进入设置页或维护验收场景，才使用下方
备用脚本。

## 维护者备用脚本流程

1. 定位仓库根目录，并确认以下文件存在：

```bash
repo_root="$(git rev-parse --show-toplevel)"
test -f "$repo_root/tools/reset-creatoros-activation.mjs"
test -f "$repo_root/tools/reset-creatoros-activation.test.mjs"
```

2. 先运行防误删测试和 dry-run。官方包在 macOS / Windows 都直接运行；白标包重置目前只在 macOS 传仓库内已经由 `identity.lock.json` 锁定的清单：

```bash
cd "$repo_root"
node --test tools/reset-creatoros-activation.test.mjs
node tools/reset-creatoros-activation.mjs
node tools/reset-creatoros-activation.mjs --package-manifest frontend/branding/packages/<packageRef>/package.json
```

测试失败或 dry-run 出现白名单外目标时立即停止，不要执行清理。

3. 执行前记录保留项证据。macOS appDataDir 是 `~/Library/Application Support/cloud.aitongban.creatoros`；Windows appDataDir 是 `%APPDATA%\cloud.aitongban.creatoros`：

- 统计 `db/`、`.auth/`、`logs/`、`~/CreatorOS` 的文件数与 `du -sk` 体积。
- 记录 `machine-id` 与 `.master-key` 的 SHA-256；不得输出文件内容。

4. 若目标应用正在运行，先正常退出。macOS 可按 manifest 的 `displayName` 请求退出；Windows 由操作者从界面关闭，脚本会用本机进程清单再次检查：

```bash
osascript -e 'tell application "CreatorOS" to quit'
osascript -e 'tell application "智溯AI" to quit'
```

等待进程完全结束。不要直接强杀；正常退出失败时报告阻塞，不做部分清理。Windows 不使用 `Stop-Process -Force`。

5. 执行唯一允许的入口：

```bash
cd "$repo_root"
node tools/reset-creatoros-activation.mjs --execute --yes
node tools/reset-creatoros-activation.mjs --package-manifest frontend/branding/packages/<packageRef>/package.json --execute --yes
```

6. 再次统计第 3 步全部保留项。文件数、体积、`machine-id` 和 `.master-key` 指纹必须与执行前一致；任一不一致都按失败报告。

7. 验证 `.license`、`.license-seen`、`.channel-model-config` 不存在；Windows 还必须验证 `%USERPROFILE%\.creatoros-seen` 不存在。然后重新打开目标应用：

```bash
open -a CreatorOS
open -a "智溯AI"
```

Windows 从开始菜单正常打开 CreatorOS，不猜测或硬编码安装路径。

等待应用启动后再次验证三项文件未被重建。应用应进入激活页。

## 结果口径

报告以下事实：

- 当前本机激活码是否已退出。
- CreatorOS 是否已重新打开并等待输入新激活码。
- 保留项前后数量、体积和密钥指纹是否一致。
- 本操作不清服务端绑定；若新码仍提示设备已绑定旧码，应部署或检查授权服务的换码能力，不能继续扩大本地删除范围。

不要声称服务端激活码已解绑，除非另有服务端证据。
