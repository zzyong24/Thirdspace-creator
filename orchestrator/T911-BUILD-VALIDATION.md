# T-911 本地打包验收记录

## 结论

新版 `creatoros-cli` Skill 已替换项目中的正式 Skill，公开 ZIP 解压后与正式目录逐文件一致。CreatorOS 1.1.0 macOS 本地验收包已从已提交候选构建完成，替换安装到 `/Applications/CreatorOS.app` 并真实启动；随包 CLI runtime 包含 T-910 的内容雷达全量分页修复。

```mermaid
flowchart LR
  A["新版 Skill 与 ZIP 一致"] --> B["冻结候选 9f3a9c88"]
  B --> C["官方测试 42/42"]
  C --> D["构建 CreatorOS 1.1.0 DMG"]
  D --> E["校验、安装并启动"]
  E --> F["核对随包 CLI runtime"]
```

## Skill 替换

- 正式目录：`.agents/skills/creatoros-cli/`。
- 公开包：`output/public-skills/creatoros-cli.zip`。
- ZIP 解压目录与正式目录执行逐文件比较，无差异。
- Skill ZIP SHA-256：`6c6b826be9e2b92998dfd432021413d16a8ecb521049ab23a9d408fd606dfa51`。

## 候选与冻结检查

- 构建候选：`9f3a9c885259307fbbde7167a277536d280d14ac`。
- 对照 `origin/main`：`1e17f692a0829bafab79524a2bd9c15a71b4d4de`。
- 隔离工作区：`/tmp/creatoros-t911.R2wu2N`，构建前后 `git status --porcelain=v1` 均为空，`git diff --check` 通过。
- `frontend/package.json`、`tauri.conf.json`、`Cargo.toml`、`Cargo.lock` 版本均为 `1.1.0`。
- 依赖使用 `pnpm install --offline --frozen-lockfile`，未下载新包、未修改锁文件。
- 候选相对 `origin/main` 的高置信凭据扫描无命中。

## 打包与安装证据

- 官方四项打包测试：4 个测试文件、42 个测试全部通过。
- 唯一入口：`pnpm -C frontend desktop:package-local`，成功。
- Next.js 生产构建、TypeScript、26 个静态页面、sidecar 混淆后真启动、首页 200、浏览器 hydration 和未授权 dispatch 403 均通过。
- CLI 已进入 runtime：`frontend/cli/creatoros.cjs`。
- 安装包内 `creatoros.cjs` 与构建 runtime SHA-256 相同：`6a863a97ef4c4f28d6cea8e38dde874df9d090c75970303a0f6231ce494cfce5`。
- DMG：`/Users/zyongzhu/Downloads/CreatorOS-1.1.0.dmg`。
- 大小：`433847502` bytes。
- SHA-256：`1f5fc2336cc19d750219fcfb63923d9e8ea8a0cc0530b83e790c86b0ad6a75a5`。
- `hdiutil verify`：`VALID`。
- `/Applications/CreatorOS.app` 的 `codesign --verify --deep --strict`：通过。
- 安装版本：`1.1.0`；Bundle ID：`cloud.aitongban.creatoros`。
- 桌面主进程 PID `56072`，窗口数 `1`；内嵌 `next-server` PID `56305` 持续运行。

## 安装后 CLI 核对

- 当前用户命令：`/Users/zyongzhu/.local/bin/creatoros`。
- `--version` 与 `help` 返回 `ok: true`，CLI `0.1.0`、contract `0.4.0`。
- 安装版动态列出 249 个 operation；`intelligence.items.list` 可被 describe，schema 包含 `page/pageSize/accountId/sourceId/transcriptState`。
- 本次新启动尚未在“设置 → Codex 与 CLI 完整访问”开启授权，因此真实 `items.list` 回读被 `CONNECTION_NOT_FOUND` 安全门拒绝。本任务没有读取连接文件、绕过授权或修改真实内容雷达数据；安装包内 runtime 的物理哈希与 T-910 已通过测试的构建 runtime 一致。

## 发布边界

- 这是本机验收用的 ad-hoc 签名包；release manifest 明确为 `signed:false`、`notarized:false`。
- 未推送分支，未创建 tag/GitHub Release，未更新 Activity/Growth 下载地址，也未向真实用户放量。
- release attestation 绑定 CreatorOS 候选 `9f3a9c88`，并明确 `publishAuthorized:false`。

## 全局对账边界

`pmem sync` 已完成。全局 `reconcile` 仍以 1 退出并报告 238 个既有流程错误与 1 个看板体积警告，主要是旧模块缺少 autonomous write-set/verify、历史 review/frontend receipt 漂移、T-905 非法验收值和 LED-024 复发；同时本次相关的 governance、orphan、asset、physical boundary、research、knowledge、docs 与 LED-042 内容总量门均通过。本任务不修改或掩盖这些范围外历史欠账，也不把局部打包成功写成全局全绿。
