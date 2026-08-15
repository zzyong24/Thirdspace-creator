# CreatorOS CLI / MCP

`creatoros` 是 CreatorOS 正式业务能力的命令行入口。它和桌面界面共用同一后端、账号、真实 ID、任务与数据，不直连数据库，也不读取模型密钥或抖音 Cookie。

## 开始使用

1. 启动 CreatorOS 桌面版。
2. 在“设置 → Codex 与 CLI 完整访问”点击“本次启动开启”。
3. 在新终端运行 `creatoros status`。

退出 CreatorOS、到期或点击“立即撤销”后，现有命令会立刻失效。Windows 首次安装后需要重新打开终端或 Codex，安装器只把 CreatorOS 自己的命令目录追加到当前用户 PATH；卸载时精准移除该目录和启动器。macOS 命令安装在 `~/.local/bin/creatoros`，设置页会显示真实路径。

## 发现能力

```sh
creatoros operations list
creatoros operations describe projects.create
creatoros accounts list
```

全部正式 contract operation 都可以用统一入口调用：

```sh
creatoros call projects.list --account acct-a --input '{"query":{"page":1,"pageSize":20}}'
creatoros call projects.create --account acct-a --input '{"body":{"title":"CLI 项目"}}' \
  --apply --idempotency-key project-create-001
```

写操作必须显式带 `--apply --idempotency-key <key>`。删除、对外发送、模型调用、登录与采集等高影响操作还必须带 `--confirm-impact <真实账号或实体ID>`。这不是桌面二次确认卡，而是让命令本身明确执行意图。

## 三账号并行

Codex 自动化必须在每条命令上显式写真实账号 ID，不使用共享的“当前账号”：

```sh
creatoros call projects.list --account acct-a --input '{"query":{}}'
creatoros call projects.list --account acct-b --input '{"query":{}}'
creatoros call projects.list --account acct-c --input '{"query":{}}'
```

`creatoros accounts use <accountId>` 只保存给人工连续操作使用；后续命令还要明确加 `--use-default-account` 才会采用，不改变桌面端当前账号。

## 抖音

```sh
creatoros douyin status --account acct-a

creatoros douyin login --account acct-a --force-new \
  --apply --idempotency-key douyin-login-a --confirm-impact acct-a

creatoros douyin refresh --account acct-a \
  --apply --idempotency-key douyin-refresh-a --confirm-impact acct-a

creatoros douyin import --account acct-a --share 'https://v.douyin.com/…/' \
  --apply --idempotency-key douyin-import-a --confirm-impact acct-a
```

`douyin refresh` 复用该账号现有且唯一的“我的作品指标”定时采集任务；找不到或存在多个时会拒绝猜测。分享链接导入复用 `intelligence.items.importDouyinShare`，不会另建一套数据。

## 长任务与 MCP

```sh
creatoros tasks get <taskId> --account acct-a
creatoros tasks wait <taskId> --account acct-a
creatoros mcp serve
```

`tasks wait` 默认不设置总超时；按 Ctrl-C 只停止本地等待，不取消后台任务。之后可用同一 task ID 继续 `get` 或 `wait`。

## 实现边界与本地开发

- CLI/MCP 都从 `@creatoros/contract` 的 operation registry 自动生成能力面和输入 schema。
- 所有调用只走运行中的 CreatorOS `/api/v1/dispatch`，复用既有身份、账号属主、业务服务、候选确认和任务状态，不直接持有数据库连接。
- `creatoros mcp serve` 与 CLI 共用连接发现、启动级授权、策略、幂等和错误协议；正式安装版无需另装 Node。

仓库内开发验证：

```sh
pnpm --filter @creatoros/mcp-server typecheck
pnpm --filter @creatoros/mcp-server test
pnpm --filter @creatoros/mcp-server build:runtime
```

只有本地开发才使用 `CREATOROS_BASE_URL`、`CREATOROS_EMAIL`、`CREATOROS_PASSWORD` 等显式覆盖；正式安装版从桌面应用本次启动写出的权限受限连接文件发现地址和授权，不从命令参数接收秘密。
