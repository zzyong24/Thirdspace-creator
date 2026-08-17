# T-872 构建验证

- 日期：2026-08-17
- 产物：`output/public-skills/creatoros-cli.zip`
- SHA-256：`b23f962b75793b85a31631854248529c37ae0c1a3c8046695647816f0b642c4a`
- 公开范围：`creatoros-cli/SKILL.md`、`agents/openai.yaml`、`references/cli.md`、`references/writing-skill-bridge.md`

## 结果

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| SPEC 独立审核 | PASS | `docs/superpowers/specs/2026-08-17-creatoros-public-cli-skill.review.md`，receipt `3f29f21be672` |
| Skill Creator 校验 | PASS | 源目录和 ZIP 解包目录均返回 `Skill is valid!` |
| 公开包边界 | PASS | ZIP 只有一个 `creatoros-cli/` 顶层目录和 4 个交付文件，无仓库源码、日志或用户内容 |
| 固定路径泄漏 | PASS | 公开目录扫描无 `/Users/`、Windows 固定用户目录、开发者姓名和 CreatorOS 开发凭据变量 |
| macOS 路径 | PASS | PATH 命中 + 两个不同 HOME 夹具均按“当前用户”解析 `.local/bin/creatoros` |
| Windows 路径 | PASS | 自定义 `LOCALAPPDATA` 夹具解析 `CreatorOS\bin\creatoros.cmd`；说明包含重开终端/Agent 处理旧 PATH |
| CLI 基线 | PASS | 当前安装版 `cliVersion=0.1.0`、`contractVersion=0.4.0`；`--version` 与 `help` 均为 `ok=true` JSON |
| 多账号 | PASS | 唯一账号自动绑定；多候选返回选择态；显式选择后固定同一 accountId |
| 局部改稿 | PASS | 稳定区块 + 原文未变可重绑；原文变化或重复文本拒绝重绑，不降级整稿覆盖 |
| 最新文案优先 | PASS | 组合协议明确“当前回读最新稿 > 本轮要求 > 定位 > 调研素材 > 旧候选/历史对话” |
| 候选与落稿 | PASS | 先展示、用户确认、写前重读、写后回读；提交/排队/候选不得冒充完成 |
| 异步恢复 | PASS | 同一 taskId/requestId/idempotencyKey 续接；中断/超时不自动重提 |
| 素材/制作链 | PASS | 保留可核验关联、未知诚实显示；生图/分镜/渲染/发布需另一次明确请求 |

## 实际执行

```text
python3 .../skill-creator/scripts/quick_validate.py .agents/skills/creatoros-cli
node orchestrator/process/verify-t872-public-skill.mjs .agents/skills/creatoros-cli
unzip creatoros-cli.zip → 对解包目录重复 quick_validate 与 verify
node --check orchestrator/process/verify-t872-public-skill.mjs
git diff --check -- <T-872 文件>
```

全部通过。解包验证得到 4 个文件、4 组路径夹具、3 组上下文选择夹具、3 组局部改稿夹具。

## 风险与边界

- 本次没有对真实用户项目执行写入，也没有触发模型、生图、渲染或发布；这是公开 Skill 的安全要求，不是缺失测试。
- Windows 本轮使用平台路径夹具与既有安装器契约验证，没有声称在新的 Windows 真机重新安装；Skill 不携带 launcher，实际 CLI 仍由 CreatorOS Windows 安装包提供。
- ZIP 只生成在本地，未上传公网或替用户安装。公开分发与用户机器安装由用户后续决定。
