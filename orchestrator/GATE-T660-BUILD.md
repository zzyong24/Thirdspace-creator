# T-660 项目逐字稿与封面状态回显 BUILD Gate

日期：2026-08-02  
结论：代码与聚焦回归通过；尚未生成新的桌面安装包。

## 修复结论

- 雷达透传并已持久化的 `radarDraftSeed` 视为真实逐字稿，不再要求用户手动补一个空格才能解锁。
- 项目封面状态统一读取 `role=cover` 的项目素材链，不再只依赖发布修订字段。
- 兼容旧包误把 AI 封面绑定为 `clip` 的历史数据，并且封面检索不受前 12 条素材展示分页影响。

## 验证

- Frontend 聚焦回归：`draft-workbench-state`、`draft-workbench-page.bug8` 与本轮制作链测试合计 42 / 42 通过。
- Backend `cover.generate` / `generated_asset` 采纳聚焦测试通过。
- Backend、Frontend、AI Worker TypeScript 检查通过。
- `git diff --check` 通过。

## 未宣称事项

- 未执行新安装包真机验收；用户需要安装新版后才能看到该修复。
- 当前工作树包含其他会话的既有改动，本任务没有清理或覆盖它们。
