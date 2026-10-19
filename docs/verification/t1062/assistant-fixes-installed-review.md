# 2026-10-09 安装版证据独立复核

- 复核方式：只读证据复核，未运行应用、业务、测试或模型
- 构建源码：`ecb1de60c7adb31efe9068f0f11b6d69e1e4b9e0`
- DMG SHA256：`248f6053ebcca48ccf3d80e3f633034dd02cd0b57721908f723fedb8acd660b1`
- 结论：`PASS_BOUNDED_INSTALLED_HTTP_AND_ASSISTANT_READ`

## 结论

现有证据足以确认：指定源码成功生成本地 DMG，DMG 校验、挂载内容比对及本地签名检查通过；新应用安装后首次启动完成 sidecar 验证并加载 HTTP 主页；安装版助手完成一次真实只读任务，调用了 `projects.outputs.list` 与 `outputs.production.editor.get`，准确读出视频工程 `editable`、`revision=7`，同时读取主脚本、文章和图文。四类业务 DTO 的 `data` 字段在调用前后完全相等。

该结论不覆盖原生界面点击、完整功能、Codex、T1089 或原温和重启尝试。一次温和重启没有出现目标进程，观察任务以 `-15` 结束；随后独立执行 `open -n` 的恢复启动成功。恢复启动不能替代原温和重启通过。

## 构建、包与安装

- `source-freeze.json` 记录仓库 clean、`diff --check=0`，HEAD 与本报告源码一致；SHA256 `3d6bd07124993a29c427045aea3aab1f21db48b73c51d0e6d38031d834cd67dc`。
- `pnpm -C frontend desktop:package-local` 实际退出码 0，耗时 374.529 秒；结果 SHA256 `f8dad90c1f839980dea7160c40872f84e15378a19f76a8f3d706d41b22053ebd`，日志 SHA256 `d36e2b2b62a35f1e0015124bf528369aadc60ccc99cc27d7f0cb35cf27b44b6a`。
- `new-package-verification.json` SHA256 `938b52980a5f0b07e80a809373666a1b4ef8421454a1db07b6a0a7f5c7ccd6e3`。`hdiutil verify`、只读挂载、源包/挂载包四个关键成员逐字节对比、两处 `codesign --verify --deep --strict` 均成功。签名是本地 ad-hoc，未公证。
- `new-app-installation.json` SHA256 `b375a3f941af4815878788a61b3846cd3706956332541ef875df1674e17ae0e8`。安装未创建备份、未重置数据，应用进程实际出现。
- `new-startup-markers.json` SHA256 `5b4ccb395c44670bfe87d68f59db69a2bc7831b2b2a485662d41b2b0842c90c4`，同时包含 `SIDECAR_STARTUP_VERIFIED` 与 `MAIN_PAGE_LOAD_FINISHED http://127.0.0.1:61240/`。因此首次安装后的 HTTP 主页加载可判通过；此证据不是原生交互验收。

## 安装版助手只读任务

- 执行结果 `installed-assistant-run.json` SHA256 `2fd531616504ef476d6dad8e641c7b6b34753f02f92cc8976f79e3e8e48a159b`，退出码 0，耗时 43.052 秒；日志 SHA256 `334b8be9ac38972bab030974149bd033e78a86648c66caf06d1203b582394b05`。
- 最终任务 `ai-task-7c910efd-143` 为 `succeeded`，证据 `final-task.json` SHA256 `dcbb6e8a73af6996e5c80555c142f36ecb85e61d2e222702a2999eede1105661`。
- 实际助手工具调用为 `artifacts.list`、`projects.outputs.list`、`artifacts.versions.list`、`outputs.production.editor.get`。这直接覆盖 T1086 要求的作品列表和编辑工程读取。
- `outputs.production.editor.get` 返回真实 `productionId=production-58776bff-169`、`state=editable`、`revision=7`；最终回答也明确报告可编辑和版本 7，与正式 DTO 一致。
- `installed-assistant-cross-check.json` SHA256 `f3a713d09b58e24af86c0cccc4934a18a28ab1094ddc5a7e5b416d7ad656d2f5`，记录 `businessDtosUnchanged=true`。独立比较 before/after 的 `data` 字段，article、editor、graphic、script 四类均相等。文件整体哈希不同仅来自请求 ID 等 envelope 字段，不能误报为业务数据变化。
- 首个公开消息读取耗时 347 ms；旧证据为 231782 ms。新包已经消除本次观察中的长等待，但现有证据不足以把旧耗时的全部改善归因于 T1087 的 EOF 修复。

## 启动边界

- 原温和重启：`warm-restart-run.json` SHA256 `8c887553a1e53d6fdd9e0c30a9e6a989e93afcbce08eb7165feaf9de41786f6b`，退出码 `-15`；`open` 返回后没有目标 Native 进程，stdout/stderr 为空。该尝试为未完成观察，不能判通过，也没有确定产品根因。
- 恢复启动：`recovery-launch.json` SHA256 `5db8eae45f17553d84389656731c6fbbbf017721e6f75624c426656cda9a3521`，`open -n` 退出码 0；`recovery-startup-markers.json` SHA256 `97fd01addf965d3d02918af064b4d57199967ec2789029aa8fbc35742f48e2f8`，记录新进程、sidecar 验证和 `MAIN_PAGE_LOAD_FINISHED http://127.0.0.1:62263/`。

## 尚未通过的范围

- 原温和重启行为未通过。
- 未完成原生界面点击和交互验收。
- 未覆盖 CreatorOS 全功能或 Codex。
- T1089 仍待处理。
- 本次只读助手验证不能替代写入、生成、渲染、发布及其他业务链路验收。
