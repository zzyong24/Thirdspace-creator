# T-1070 执行基础修复实测

本记录只覆盖 SPEC 已准入的四路径修复。T-1070 的自然语言编导与三作品生成尚未完成，不能据此关闭任务。

当场测试证据位于本地验收根 `/Users/zyongzhu/CreatorOS-local-acceptance/t1062-20261005-wm9zxxwl/t1070-tests`。首次隔离公共服务组合测试为 8 项中 6 失败；修复执行归属及工具 ID 后 19 项中 1 失败，定位组图片结算仍使用旧账号回执键。补回执同源身份及工作区过滤后，四文件 34 项通过，退出码 0。覆盖 external-group-chat、external-chat-turn、external-task-tool、pending-generated-asset；测试为隔离 PGlite/临时媒体根，人工工具和图片夹具不代签真实剪辑或图片解码。源码摘要和实现独评见同目录 `foundation-implementation-review.json`，评审未声称重跑测试或历史日志具有运行前摘要。

真实 Codex 探针使用内存库、通过账号组和项目服务创建中性项目、实际提交/claim/ACP/MCP工具/结算/commit。只读 `context.project.detail` 返回不在提示词中的随机项目标题；回复和工具卡读回、两条调用均 settled。实际运行 2026-10-07T04:33:40.694Z 至 04:34:04.474Z，观察预算 180 秒，退出码 0；`real-codex-result.json` 保存中性 ID 与结果。未重发用户原失败任务，未连接用户数据库。引擎发出 Code Mode disabled 提示，但实际 MCP 读取成功；尚不能代签安装版右侧完整交互。原始探针与日志在验收根 `t1070-probe`。

相关回归保留真实失败：chat submission/completion/lease 三文件 59 项中 1 失败，为 creatoros.guide 冻结版本断言；未证明基点同样失败。类型检查退出 2，错误在未改的 platform-bind.integration.test.ts 与 production-native-public.integration.test.ts。boundary 显示 7 条（基线 5 条），额外两条是未改 live-chat-session.ts 的 SDK 导入，未把全局结果标绿。orphan 为 0 错误、100 警告。完整原始日志保留，不放宽基线、断言或质量门。

仍待实施并验收：公共采纳事务、原生 v3 自然语言编辑、三种真实作品生成与保存导出、右侧真实视觉操作、新包构建与安装版验收。
