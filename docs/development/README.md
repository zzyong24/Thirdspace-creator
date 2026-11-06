# CreatorOS 开发指引

本页面向已有相应开发授权的协作者。产品介绍、真实界面和使用入口见[仓库首页](../../README.md)；开发与分发权限以 [LICENSE](../../LICENSE) 及约定的授权范围为准。

## 本地准备

依赖版本以根 [package.json](../../package.json) 为准：Node.js `>=25 <26`、pnpm `10.32.1`。涉及桌面壳时还需要 Rust 与 Tauri 工具链；视频相关功能需要 ffmpeg / ffprobe。

```sh
git clone https://github.com/zzyong24/Thirdspace-creator.git
cd Thirdspace-creator
corepack enable
pnpm install
pnpm -C frontend dev
```

开发服务器启动后，访问终端显示的本地地址。启动及功能验证仍需满足当前配置、数据与授权要求。

> 同一本地数据库不要同时交给开发服务器与桌面应用使用。开发前先退出使用该数据库的 CreatorOS 实例；不要为排查问题直接删除数据库。相关经验见[工程坑册](../engineering-notes/pitfalls.md)。

## 目录与职责

| 目录 | 职责 |
| --- | --- |
| `frontend/` | Next.js 界面、桌面壳与打包脚本 |
| `backend/` | 领域服务与持久化边界 |
| `contract/` | 前后端共享契约与数据校验 |
| `ai-worker/` | AI 任务与提示词相关实现 |
| `mcp-server/` | MCP 接入 |
| `website/` | 产品官网与购买页展示素材 |
| `docs/` | 产品说明、任务规格、工程与研究记录 |

具体架构以[系统架构](../../orchestrator/SYSTEM_ARCHITECTURE.md)和当前代码为准。AI 产出候选，用户确认后通过既有服务边界采纳；变更应遵循 [AGENTS.md](../../AGENTS.md)。

## 常用命令

```sh
# Web 开发
pnpm -C frontend dev

# 桌面开发
pnpm -C frontend desktop:dev

# 按改动范围运行检查
pnpm -C frontend test
pnpm -C frontend typecheck
pnpm -C backend test
pnpm -C ai-worker test
```

正式包使用[打包发布指引](../../.agents/skills/packaging-creatoros-release/SKILL.md)及其当前流程，签名和授权材料由已有受控渠道管理。

## 协作

从 [BACKLOG.md](../../BACKLOG.md) 定位任务及其 SPEC，按 [AGENTS.md](../../AGENTS.md) 编译上下文并使用 `taskctl` 管理状态。README 不重复维护整份路线图或安全实现清单；真实进展以看板和验证证据为准。
