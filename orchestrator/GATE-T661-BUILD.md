# T-661 制作素材、任务终态与素材包 BUILD Gate

日期：2026-08-02  
结论：代码与聚焦回归通过；尚未生成新的桌面安装包。

## 修复结论

- AI 生图/生视频采纳后按 `role=broll` 进入项目制作素材，`cover` 仍独立为项目封面。
- 兼容旧版 `role=clip` 的 AI 图片：图片进入 B-roll，真正的口播粗剪视频仍排除；封面和成片不会误进 B-roll。
- Copilot 生成卡重进项目时立即读取持久任务终态；已采纳的 `succeeded` 任务直接显示完成，不再持续“正在生成图”。
- 素材包导出按真实 MIME 为无后缀图片/视频补扩展名，Finder 可按真实文件类型打开。

## 验证

- Backend 素材包与 B-roll 聚焦回归：47 / 47 通过。
- Frontend Copilot、制作组装、项目状态聚焦回归：42 / 42 通过。
- Backend `generated_asset` / `cover.generate` 采纳聚焦回归：9 / 9 通过（其余 40 条按过滤条件跳过）。
- Backend、Frontend、AI Worker TypeScript 检查通过。
- 聚焦 ESLint：0 error；保留 5 条既有 warning。
- `git diff --check` 通过。

## 未宣称事项

- 未执行真实 ZIP 导出 UI E2E 或新安装包真机验收。
- `production-workbench.tsx` 全文件 ESLint 仍命中一条既有 `set-state-in-effect` 规则，不是本轮新增行；类型检查与相关聚焦测试均通过。
