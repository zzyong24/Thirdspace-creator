# CreatorOS 的 WorkBuddy 外部工具接入

这个包包含一个 MCP 配置模板和一个 Skill。WorkBuddy 对话调用 CreatorOS 原有工具；它不在 CreatorOS 内启动 WorkBuddy 引擎，也不包含 Office SDK、iframe 或另一套任务系统。

## 使用

1. 启动 CreatorOS 桌面版，在设置中开启 CLI 访问。
2. 在同一区域点击“复制 MCP 配置”或“下载连接配置”。该配置使用本机随包运行时，无需额外安装 Node。
3. 在 WorkBuddy 的 MCP 管理中添加配置中的 `creatoros` 服务器。只合并这个条目，保留其它服务器。用户 MCP 配置是 `~/.workbuddy/mcp.json`；不要改应用生成的 `.mcp.json` 或应用自带连接器目录。
4. 由用户在 WorkBuddy 中确认首次信任。随后让 WorkBuddy 调用 `accounts_list` 并选择真实账户，再调用 `projects_list` 选择项目。
5. 可将包内 `skills/creatoros` 作为 Skill 导入 WorkBuddy。其工具和账户边界仍由 CreatorOS 重新校验。

`mcp.template.json` 是公开模板，三个占位符未替换时不能运行。优先使用设置页生成的本机解析配置；不要填写相对路径、未展开变量或猜测的开发地址。应用重装/移动后重新生成配置。

配置不包含访问凭据。保持 CreatorOS 运行，权限关闭、连接过期或应用退出后原工具调用会失败。复制或下载配置成功不代表 WorkBuddy 已信任或工具可调用。

## 表示方式

- macOS、Windows、Linux 都直接启动随包 Node 可执行文件，CLI bundle 和参数是独立 argv。
- Windows JSON 中的路径按 JSON 规则转义；不要给每个 argv 加 shell 引号，也不要把 `.cmd` 文件当原生 executable。
- `--connection-file` 指向安装连接描述，兼容渠道产品身份；授权仍由现有 CLI 握手处理。
- 不用 npx 下载、不读取 WorkBuddy 登录文件、不自动修改 Agent 全局配置。

## 构建工件

在项目根用 Python 3 标准库执行本项目构建脚本：

```sh
python3 scripts/workbuddy/package-connector.py --output-dir /tmp/creatoros-workbuddy-package
```

输出可重复的 ZIP、展开文件及 SHA256 清单。Python 仅用于构建工件，不是用户机器的运行时依赖。来源、许可与修改记录见 `SOURCE.md`。

这不是 WorkBuddy 市场上架或跨应用验收记录；需要独立验证首次信任及真实工具调用。本脚本不安装服务器，不触碰用户全局配置。
