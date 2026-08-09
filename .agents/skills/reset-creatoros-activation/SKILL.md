---
name: reset-creatoros-activation
description: Safely clear only the current Mac's local CreatorOS activation state while preserving projects, positioning versions, accounts, knowledge, assets, radar data, collection snapshots, logs, machine identity, master key, database, workspace, and channel-scoped model credentials. Use when the user asks to reset, clear, switch, or re-enter a CreatorOS activation code without deleting any content, especially for channel activation testing.
---

# 仅重置 CreatorOS 激活码

复用项目已测试的白名单脚本，退出当前 Mac 的本机激活权益。不要另写删除命令，也不要把“清激活”扩展成“清数据”。

## 固定边界

只允许处理：

- `.license`
- `.license-seen`
- `.channel-model-config`
- Preferences 域 `cloud.aitongban.creatoros.license`
- Keychain `com.creatoros.desktop.entitlement-consume/pending-consume-v1`

必须保留：

- `db/`、`.auth/`、`logs/`
- `machine-id`、`.master-key`
- `~/CreatorOS`
- 项目、定位版本、知识库、素材、账号登录态、内容雷达及采集快照
- 渠道作用域下已经保存的模型凭据和用户选择
- 服务端的激活码消费、设备绑定、吊销和换码记录

禁止运行宽泛删除命令，禁止删除整个应用数据目录、主 Preferences 域或 Keychain 中其他条目。

## 执行流程

1. 定位仓库根目录，并确认以下文件存在：

```bash
repo_root="$(git rev-parse --show-toplevel)"
test -f "$repo_root/tools/reset-creatoros-activation.mjs"
test -f "$repo_root/tools/reset-creatoros-activation.test.mjs"
```

2. 先运行防误删测试和 dry-run：

```bash
cd "$repo_root"
node --test tools/reset-creatoros-activation.test.mjs
node tools/reset-creatoros-activation.mjs
```

测试失败或 dry-run 出现白名单外目标时立即停止，不要执行清理。

3. 执行前记录保留项证据：

- 统计 `db/`、`.auth/`、`logs/`、`~/CreatorOS` 的文件数与 `du -sk` 体积。
- 记录 `machine-id` 与 `.master-key` 的 SHA-256；不得输出文件内容。

4. 若 CreatorOS 正在运行，先正常退出：

```bash
osascript -e 'tell application "CreatorOS" to quit'
```

等待进程完全结束。不要直接强杀；正常退出失败时报告阻塞，不做部分清理。

5. 执行唯一允许的入口：

```bash
cd "$repo_root"
node tools/reset-creatoros-activation.mjs --execute --yes
```

6. 再次统计第 3 步全部保留项。文件数、体积、`machine-id` 和 `.master-key` 指纹必须与执行前一致；任一不一致都按失败报告。

7. 验证 `.license`、`.license-seen`、`.channel-model-config` 不存在，然后重新打开 CreatorOS：

```bash
open -a CreatorOS
```

等待应用启动后再次验证三项文件未被重建。应用应进入激活页。

## 结果口径

报告以下事实：

- 当前本机激活码是否已退出。
- CreatorOS 是否已重新打开并等待输入新激活码。
- 保留项前后数量、体积和密钥指纹是否一致。
- 本操作不清服务端绑定；若新码仍提示设备已绑定旧码，应部署或检查授权服务的换码能力，不能继续扩大本地删除范围。

不要声称服务端激活码已解绑，除非另有服务端证据。
