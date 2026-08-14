# T-836 按稿件语义生成图片 / 视频素材验证

## 范围与评审

- SPEC：`docs/superpowers/specs/2026-08-14-minimax-h3-storyboard-broll-integration.md`
- 独立评审：`PASS[REV:fd1747eb2d8d]`
- 实现范围：编导快捷行两个按钮、可信两步工具序列、现有素材候选链、MiniMax H3 v2、提示词与素材语义描述。
- 未增加制作页、数据库迁移、公开 API、平行 B-roll 计划或 FFmpeg 链。

## 红绿证据

- H3 v2 首轮红测：新增 3 项 H3 测试均失败，既有 7 项 MiniMax v1 / image 测试通过；证明测试先锁定了 v2 路径，而不是改写旧断言冒充通过。
- H3 与提示词绿测：`ai-worker` 2 个文件，26 项通过。覆盖 v1 回归、v2 create/query/download、默认规格、非法参数 POST 前拒绝、401/402/422/429/5xx 分类、成功无 URL、checkpoint 恢复零 POST，以及视频提示词结构。
- 对话与素材链绿测：`backend` 4 个文件，386 项通过。覆盖快捷 functionKey 强制 `context.artifact.text → material.generate`、可信 image/video 类型、当前段落冻结、pending candidate、description、默认 6 秒/768P 与既有恢复链。
- 前端绿测：`frontend` 3 个文件，78 项通过。覆盖 7 个快捷按钮、两个新入口的预填与不自动发送既有交互、设置页 H3 v2 零计费鉴权探测。
- 真实浏览器旅程首轮在 1024×768 暴露“右栏会按既有响应式规则收起”的失败；测试补为从页面真实“打开 AI 助手”入口恢复，而不是放宽可见断言。复跑在 1536×1024 与 1024×768 均通过，确认两个按钮可见、图片/视频语义预填正确且消息数不变。
- 服务与资产补充回归：`backend` 2 个文件，43 项通过（已包含在上面的 386 项聚焦集合中）。

## 静态检查

- `ai-worker` typecheck：通过。
- `backend` typecheck：通过。
- `frontend` typecheck（含 Next route types）：通过。
- 变更前端文件 ESLint：0 error；保留 `ai-copilot-content.tsx` 两条既有 Hook dependency warning，未由本任务扩大。
- `git diff --check`：通过。
- `boundary-scan`：通过；剩余 5 条均为既有基线，T-836 没有新增物理架构违规。
- `orphan-scan`：通过；双向追踪无孤儿。
- `reconcile`：本任务相关的 required artifacts、orphan、asset、boundary、knowledge、lesson guards 均通过；全局仍被既有 BACKLOG 体积、T-770/T-765/T-746 过期评审回执、T-831/T-828 非法验收值及其他任务的历史 frontend receipt 漂移阻断。本任务不篡改这些范围外台账，不把全局对账写成全绿。
- 真实浏览器运行同时记录到稿件版本时间的服务端/客户端时区 hydration warning；它来自既有 `script-version-restore.tsx`，不影响本旅程且本任务未修改该文件，未伪装为 T-836 已修复。

## 付费与真机边界

- 本次没有用户明确授权 MiniMax 生成预算，因此未调用真实 H3 付费 API，也未把 mock / contract 测试写成真机 E2E。
- 设置页“测试连接”对 H3 仅发送缺 `content` 的无效 v2 请求，用于鉴权/端点探测，不形成有效生成任务。
- 用户配置 MiniMax Key 后仍需一次隔离预算的真实 6 秒 / 768P smoke，验证账号权限、代理兼容与实际成片质量；这不影响当前代码链路的零成本验收结论。
