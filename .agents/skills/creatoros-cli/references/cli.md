# CreatorOS CLI 用户说明

## Skill 与 CLI 是两样东西

- 本 Skill 教 Agent 如何安全使用 CreatorOS。
- `creatoros` CLI 由 CreatorOS 桌面安装版提供，位置取决于当前电脑、当前操作系统用户和安装状态。

不要把 Skill 目录当作 CLI 目录，也不要把某位开发者电脑上的路径发给其他用户。

## 安装 Skill

解压后保留完整的 `creatoros-cli/` 顶层目录：

- Codex：放入 `$CODEX_HOME/skills/`；未设置 `CODEX_HOME` 时通常是当前用户主目录下的 `.codex/skills/`。
- Claude Code：放入当前用户主目录下的 `.claude/skills/`。
- 其他兼容 Agent：放入该 Agent 文档规定的用户级或项目级 Skills 目录。

安装后新开一个 Agent 会话。如果 Agent 没有发现 Skill，先核对最终路径是否是 `.../creatoros-cli/SKILL.md`，而不是多嵌套一层目录。

## 发现当前用户的 CLI

每个新 Agent 会话只解析一次，按顺序执行。

### macOS / POSIX

1. 从当前 PATH 查找：`command -v creatoros`。
2. 未命中时，只检查当前用户主目录下的 `.local/bin/creatoros`。主目录必须由运行时环境得到，例如 `${HOME}`；不要写死具体用户名。

### Windows PowerShell

1. 从当前 PATH 查找：`Get-Command creatoros -ErrorAction SilentlyContinue`。
2. 未命中时，只检查由 `$env:LOCALAPPDATA` 拼出的 `CreatorOS\bin\creatoros.cmd`。
3. 安装器首次把命令目录加入 PATH 后，已经打开的终端或 Agent 可能仍保留旧 PATH；重新打开后再试。

### 验证候选命令

对找到的候选依次运行：

```text
<resolved-creatoros> --version
<resolved-creatoros> help
```

两次都必须输出可解析 JSON，且 `ok` 为 `true`；`help.usage` 应以 `creatoros ` 开头。任何一步失败都不要把该路径当成可用 CLI。

禁止递归搜索磁盘、猜测其他用户目录、复制 launcher、修改 PATH、读取 CreatorOS 连接文件或凭据来绕过发现流程。

## 启动和授权

1. 启动 CreatorOS 桌面版。
2. 打开“设置 → Codex 与 CLI 完整访问”。
3. 点击“本次启动开启”。
4. 运行 `creatoros status` 与 `creatoros access status`。

退出 CreatorOS、授权到期或点击“立即撤销”后，已有命令会失效。这时只需重新启动并授权，不要要求用户复制 Token。

## 固定 CLI 表面

```text
creatoros --version
creatoros help
creatoros status
creatoros access status
creatoros operations list
creatoros operations describe <operation>
creatoros call <operation> --input <json|@file|-> --account <accountId>
creatoros tasks get <taskId> --account <accountId>
creatoros tasks wait <taskId> --account <accountId>
creatoros accounts list
```

不要从这份说明推断业务 operation。业务能力与 schema 必须来自当前安装版的 `operations list/describe`。

## 调用规则

- 自动化的每条账号范围命令都显式带 `--account <真实 accountId>`；不要使用保存的默认账号。
- read operation 不加执行标记。
- 非 read operation 必须加 `--apply --idempotency-key <稳定键>`。
- 若 `operations describe` 返回的 policy 要求影响确认，再加 `--confirm-impact <真实账号或实体ID>`。
- 把 JSON 作为单独参数、标准输入或 UTF-8 临时文件传递；不要把用户正文拼进可执行的 shell 语句。
- 幂等键绑定一次用户意图、目标账号、项目和基线版本。网络不确定时复用原键，禁止换新键重试。

## 异步任务

`tasks wait` 默认持续等待。按 Ctrl-C 或 Agent 超时只会停止本地等待，不会取消后台任务。保留 `taskId`，以后继续：

```text
creatoros tasks get <taskId> --account <accountId>
creatoros tasks wait <taskId> --account <accountId>
```

只有成功终态并且结果可回读才算完成。排队、运行中、待确认、失败、取消或未知状态都必须如实显示。自动重提会制造重复任务，禁止这样恢复。

## 常见问题

| 现象 | 处理 |
| --- | --- |
| 找不到命令 | 按当前用户路径检查；确认桌面版已安装；Windows 重开终端/Agent |
| 未授权或桌面不可用 | 启动 CreatorOS，在设置中开启本次访问，再运行 status |
| account required | 先 `accounts list`；多账号让用户选择；后续显式带同一 accountId |
| 输入 schema 错误 | 重新 `operations describe`，按当前 schema 组装；不猜字段 |
| 等待被中断 | 保存并继续查询同一 taskId，不新建任务 |
| 写入结果不确定 | 使用原 idempotency key 回放或先回读目标；不能证明时停止 |
| 最新稿发生变化 | 不覆盖；整稿重新生成，局改仅做确定性重绑，否则报告冲突 |

任何错误都优先向用户展示 CLI 返回的错误码、消息、`requestId` 和 `taskId`，不要用笼统的“模型失败”替代真实原因。
