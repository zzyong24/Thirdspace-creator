# T-1009 产物交付验证记录

## 已接通

- `artifact.register` 从当前 execution task 的原生任务目录分页读取真实字节；读前后核对文件版本、大小，拒绝目录、空文件、超过 20 MiB 和读取途中变化。
- 服务端生成 artifactId；待登记摘要与正式版本写入原 `execution_tasks.payload`，真实字节通过 assets 公开 Blob 端口落在账号、用户、任务、操作、哈希隔离的对象键。对象已写但版本登记中断时，同一 operationId 按原摘要回读恢复；工作文件后来变化不会冒充原回执。版本冲突和伪造来源引用被拒。
- `artifact.read` 在当前账号/用户/任务范围内按版本回读旧字节并核对哈希。宿主只向模型返回元数据与分页内容，不返回对象键。
- 工作台计划在步骤声明产物成功时调用真实字节校验；丢失或篡改的产物不能成为完成回执。
- 桌面导出调用前重新下载并核对后端版本的 MIME、大小和 SHA-256；原生面板取消返回 `cancelled`，写盘成功才返回 `saved`。
- 已登记版本可经当前账号与会话认证的 HTTP 端口预览；HTML 进入不透明源、禁脚本框架，Markdown/CSV 为静态文本，PNG/PDF 按浏览器能力显示。完整对象只读取一次。

## 当前验证

- backend 产物服务、Blob 本地存储测试：18/18 通过，包含登记中断恢复与只读端口。
- frontend 私有宿主测试：Mac 与 Windows 平台参数 2/2 通过；Windows 使用注入文件端口，不代表真实管道运行。
- T-1005 多步文件回执集成测试：3/3 通过。
- frontend TypeScript：通过。backend TypeScript 尚有 14 项既有测试文件错误，本次新增文件无新错误。
- 桌面导出薄封装测试：2/2 通过；原生 Rust 保存端口测试：2/2 通过（独立工作树验证）。
- 预览读服务、HTTP 路由与隔离组件：16/16 通过；产物卡片交互：2/2 通过。

## 尚待验收

- Mac/Windows 安装版 PDF 预览与活动图表安全降级。
- Mac/Windows 安装版原生选址导出及取消、覆盖行为；HTML 转 PNG/PDF 的真机验证。
- Windows 文件宿主和已安装包端到端验证。
## 2026-09-20 Windows 产物登记接线

Windows 私有文件通道接入后，产物宿主也在该通道存在时开放 `artifact.register/read`。登记仍由后端原执行租约与账号核实，并从当前任务文件逐页回读、复核版本后保存；Windows 目录中只开放文件和产物工具，不因本接线开放命令或浏览器。Mac/Windows 两个平台使用同一真实任务账本测试登记、回读、跨账号拒绝和文件版本变化；Windows 用例以注入的文件端口模拟 Native Pipe，**不是 Windows 真机 Named Pipe 或安装包实测**。

## 2026-09-20 Mac 真实生产宿主链路补验

- 环境：macOS 26.2（25C56）、arm64；Node v25.9.0、Rust 1.98.0；独立工作树 `codex/t1009-host-chain`。使用本机已安装的 `~/Library/Application Support/cloud.aitongban.creatoros/runtime/1.2.0/sidecar`，其中 `server.app/Contents/MacOS/creatoros-server` 的 SHA-256 为 `5ed0e129e708e36048981aed983f7302b0c18139f5a174e4b8d5fabbacb6d59d`。运行时仅被 fixture 读取，测试不改安装目录或用户数据。
- 可选开关：仅 Mac、`CREATOROS_TEST_PACKAGED_RUNTIME_ROOT` 非空且 `CREATOROS_T1009_REAL_HOST=1`（兼容原 `CREATOROS_T1007_REAL_FILES=1`）时运行真实用例；普通测试跳过。Rust fixture 临时启动 0700 私有目录与 0600 socket，限定测试 Node PID；测试任务、任务文件和本地 Blob 均位于临时目录，结束后清理。
- 实际命令：`CREATOROS_T1009_REAL_HOST=1 CREATOROS_TEST_PACKAGED_RUNTIME_ROOT="$HOME/Library/Application Support/cloud.aitongban.creatoros/runtime/1.2.0/sidecar" CARGO_TARGET_DIR=/tmp/creatoros-t1007-mac-target pnpm --dir frontend exec vitest run src/server/workbench-native-host.test.ts src/server/workbench-artifact-host.test.ts --retry=0 --reporter=verbose`。结果 **10/10 通过**，包含真实 socket 用例 1/1；其余产物宿主用例仍为注入文件端口的测试。
- 真实用例在 PGlite `execution_tasks` 中领取租约，`files.write/read/stat` 经 Node 客户端和 Rust socket 操作两个 HTML 文件；通过 `execution.run/status/read` 使用随包 Node 对原文件计算 SHA-256。`artifact.register` 从同一 socket 读取文件，经 backend 产物服务与 assets 的本地文件 Blob 端口保存两个正式版本；`artifact.read` 与后端 `readAll` 回读旧版和新版。真实文件回读值、命令结果、Blob 字节和各自登记 hash 一致。跨任务和另一账号无法读到原任务文件或产物；伪造另一账号上下文与旧 fence 的产物读/登记均被拒绝，后端跨账号版本回读也被拒绝。
- 首次运行在前端测试默认 JSDOM 环境中出现 `artifact_result_unknown`，定位到该环境的 `Buffer` 未通过 Blob 端口的 `Uint8Array` 类型检查；这是测试 realm 与生产 Node 不同。将这份宿主测试设为 Node 环境后按同一真实链路重跑通过，没有修改生产代码。失败记录不计作生产链路 PASS。
- 不设可选开关时，同两份测试 **9 通过、1 跳过**，确认不会无意触发真实 runtime；`pnpm --dir frontend exec tsc --noEmit --pretty false`、定向 ESLint 与 `git diff --check` 均通过。

本次证明的是 **Mac 本机真实 Rust socket + Node 宿主 + 租约 + 文件 + 后端 Blob** 的测试运行链路，并非已安装 CreatorOS 界面、原生保存面板或完整用户对话实测。Windows Named Pipe 真机、Mac/Windows 安装版导出及模型自主生成仍待各自验收。

## 2026-09-20 跨回合反馈版本

原先“新回合不能读取旧任务产物”的缺口已按 `DEC-AW-1009` 实现。当前版本通过会话级正式谱系、原工具调用原子结算、持久对账和保守旧数据迁移完成跨回合 1→2；完整边界与当场证据见 [T-1009 跨回合产物谱系验证](t1009-cross-turn-lineage.md)。
