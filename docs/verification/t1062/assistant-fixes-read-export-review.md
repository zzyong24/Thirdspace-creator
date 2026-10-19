# 安装版公开读取与导出证据独立复核

- 复核方式：只读证据复核；未运行应用、业务、数据库或测试
- 安装包源码：`ecb1de60c7adb31efe9068f0f11b6d69e1e4b9e0`
- 结论：`PASS_BOUNDED_PUBLIC_READ_AND_EXPORT`

## 结论

新增证据足以确认该安装版完成 12 项公开读取，并通过公开渲染任务、正确的 `execution.tasks.confirm`、资源下载、ffprobe 与完整解码产生一个可读 MP4。导出前后编辑工程业务 DTO 相等，原源文件 SHA256 未变化。

该结论仅覆盖已发生的公开 API 读取和本次 S1 r7 导出。它不代表原生 UI 点击、CreatorOS 全功能、Codex、温和重启或 T1089 通过。

## 12 项公开读取

`installed-read-matrix-verification.json` SHA256 为 `07926f907e9368d8a9d539bf13de00a47cbd21134b341eeb192a898c5969e603`，记录以下 12 项公开操作全部退出码 0：

`platforms.capabilities.list`、`accounts.bindingCapabilities`、`pages.dashboard.get`、`analytics.projects.get`、`reviews.list`、`artifacts.list`、`workCompositions.list`、`canvas.list`、`assets.get`、`ai.tasks.list`、`outputs.production.editor.renders.list`、`projects.outputs.list`。

最终运行 `read-matrix-final.json` SHA256 为 `e882405031501488031b9242aea32336330bdf1a7761ce78fd33061d1441fe23`，退出码 0，耗时 9.347 秒；日志 SHA256 为 `d7b099c29f5814f825e32b39b162f716b48a32d9f95f89ef5a6cc882735765bf`。

首次把 describe 响应当作顶层操作定义的错误尝试仍保留，未被最终成功覆盖或改写。

## S1 r7 导出与确认

- 导出任务：`ai-task-76b77d63-159`。
- 采纳资源：`asset-76b77d63-222`。
- 正确确认入口：`execution.tasks.confirm`，结果文件 `fresh-execution-confirm.json` SHA256 `a5b519092214460dd61ce544a4513e87427904e35c413e59e66273be9f4d5798`。
- 确认结果为 `succeeded`，产物 `final.mp4`，199098 字节，声明时长 8.2 秒、640×360、30fps。
- 原 generic `ai.tasks.confirm` 返回 409 的失败证据和相对 URL 下载脚本失误均继续保留；最终成功没有把这两个失败改写成通过。

## 文件物理证据

`fresh-export-verification.json` SHA256 为 `bf6f67c4b263ab4cb44f05ffcc9ef98ed8c7198b935e885274fb65ec16a7c88b`，记录：

- 任务状态 `succeeded`；
- 工程 output `output-58776bff-119`，revision 7；
- 导出前后编辑工程 DTO 相等；
- 原源文件哈希不变；
- 原源文件 SHA256 `e6c0f4e72741e8f37b369d9511311569df8ef6c4e07009f3c746c632fb0e2073`，232847 字节；
- 新导出文件 SHA256 `a72af1826b27bc566fb7b839c4c0813aa3cc04bb0cde6164e1ec04f41f3e1558`，199098 字节；
- ffprobe 记录时长 8.166667 秒；
- 完整解码退出码 0，解码 stderr 为空。

最终回读运行 `fresh-export-readback-local.json` SHA256 为 `e73fe27072c8b8c6ba2ebe69083fb3e999f4517d206ddf1a97e24a36c4799d06`，退出码 0、耗时 4.875 秒，日志 SHA256 `8b46d9f0d15d1e6eae2ebca1099cd7e83dc45c0adbd40a252db8b35b894790b0`。下载使用公开端口签发的 URL，并用 `ProxyHandler({})` 直连本机地址；没有附加 cookie、header 或 token，也没有绕过资源权限。此前相对 URL 脚本错误，以及修正相对 URL 后因环境 `HTTP_PROXY` 把本机地址送往代理而得到 502 的失败均保留。最终直连本机 signed URL 返回 200。

导出前后的 envelope 文件哈希不同包含请求 ID 等运行字段；验收依据是正式编辑工程业务 DTO 相等及验证文件中的 `editorDtoUnchanged=true`，不能把 envelope 字节差异误报为工程改写。

## 边界

- 未验证原生 UI 的导出点击、进度展示或下载交互。
- 未完成全功能验收或 Codex 验收。
- 原温和重启仍未通过；恢复 `open -n` 不代签它。
- T1089 仍待处理。
- 本次导出没有验证自然语言精剪，也没有新增 AI 候选。
