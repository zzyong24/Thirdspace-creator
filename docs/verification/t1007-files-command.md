# T-1007 任务文件与受控命令验证记录

> 本文前半保留初期候选的原始证据；合并后的最新状态见文末“Mac 私有通道与 Windows 文件候选”。

## 本次候选实现

冻结契约由 `@creatoros/contract/agent-workbench` 导入。Worker 的 `task-files.ts` 与 `command-host.ts` 仅解析模型请求、验证可信宿主上下文与 operationId，并把调用交给本机受限端口；账号、用户、任务和执行租约不能由模型参数指定。NomiFun `e27bd5de` 的 `caps_files.rs` 只作能力形状参考，没有沿用 Desktop `Unrestricted` 路径权限。

```mermaid
flowchart LR
 M[模型输入：相对路径与 argv] --> W[Worker 契约校验]
 B[Backend 可信执行租约] --> W
 W -. 待可信 lease 通道接线 .-> N[桌面宿主 workbench]
 N --> F[用户／账号／任务文件目录]
 N --> C[Mac 沙箱内的进程组]
 F --> R[版本和回执私有目录]
 C --> R
```

Mac 原生文件模块按 `userId/accountId/taskId` 的哈希层级创建目录；逐级 `openat` + `O_NOFOLLOW`，拒绝绝对路径、盘符、`..`、冒号、符号链接和内部保留名。相对路径归一到 NFC，避免 Unicode 等价名称使用两份版本索引。版本与命令输出放在任务根目录的兄弟私有目录；文件写入使用同目录独占临时文件、`sync_all`、`renameat` 和跨进程 `flock`。分页读取每次最多 1 MB，版本哈希流式计算；命令 stdin 引用限 1 MB，超出明确失败。中断发生在数据换名后、版本记录提交前时，下次读取按内容哈希修复版本，调用方须按未知提交核对。

命令仅解析可信配置中的绝对 runtime 路径；argv 不经过 shell，环境用 `env_clear` 后只注入 HOME/TMPDIR/PATH。Mac 使用 `sandbox-exec` 的 `deny default` 配置，仅读系统可执行目录、受管 runtime 读取根和本任务目录，只写本任务目录。stdout/stderr 经宿主管道写入私有目录，提供预览与按范围读取。进程组取消先 TERM、后 KILL，并等待组长；非 Mac 平台没有已验证隔离器时拒绝执行。**cwd 校验只是输入校验，不构成 OS 隔离。**

## 已实际执行

- 先建测试后运行 `pnpm --dir ai-worker exec vitest run src/capabilities/task-files.test.ts src/capabilities/command-host.test.ts --retry=0`：两个测试套件因实现模块尚不存在而失败（红测）；实现后 **2 文件、13 用例通过**。
- `pnpm --dir ai-worker typecheck`：通过。
- `RUSTFLAGS='-A dead_code' cargo test --manifest-path frontend/src-tauri/src/workbench/Cargo.toml --offline --locked --quiet`：本机 macOS **6 用例通过**。实际覆盖 Unicode/空格、NFC 等价冲突、账号及用户隔离、符号链接越界、任务外文件读取被 OS 沙箱拒绝、任务内读取、取消后派生子进程消失。
- `cargo test --manifest-path frontend/src-tauri/Cargo.toml --test workbench --locked --no-default-features`：**未进入测试**；现有 `build.rs` 因隔离树缺少 `binaries/creatoros-server-aarch64-apple-darwin` 中止。上面的独立测试入口只编译并测试 workbench 模块。

## 主会话集成与未闭合边界

1. 本次 `desktop-integration` Packet 已允许修改 `frontend/src-tauri/src/lib.rs`，因此已将 `mod workbench` 纳入桌面壳编译。仍缺受限 sidecar IPC：每次调用须由 backend 校验当前 execution lease、attempt、fence 和账号归属，并注入可信 `userId/accountId/taskId`；WebView handshake token 已暴露给页面，不能代替此验证。当前候选模块**未在桌面应用中可调用**，没有注册 Tauri command。
2. 冻结 `workbenchResultSchema` 的失败分支没有 `currentVersion` 字段。Rust `FileError::Conflict` 已提供该值，Worker 提供 `versionConflictResult`，将当前版本稳定编码为 `version_conflict:<n>`。主会话接线时须把原生冲突映射到该辅助函数；若要新增独立 `currentVersion` 字段，应由主会话另行升级契约。
3. Windows 文件句柄逐级校验、受限进程 token/Job Object 与真机零遗留进程树测试尚未实现；Windows 当前 fail-closed。Mac 测试使用本机 Homebrew Python 验证派生进程，**不证明安装包内 Node/Python 已配置可用**。
4. 命令表目前在内存中。应用崩溃后还需依据持久回执和实际进程身份恢复；Mac 宿主被强杀时的孤儿清理与安装版端到端测试未验证。命令直接修改任务文件与文件 API 并发时，还需要宿主统一写入协调。

这些未闭合项不应计作 T-1007 完整验收，也不能把本机模块用例记为 Windows 或安装包 PASS。

## 2026-09-19 桌面集成候选实测与阻断

- 桌面 `lib.rs` 已编译 workbench 模块；`invoke_handler` 未增加 workbench 入口。当前没有可由 Rust 在调用时向 backend 验证 execution lease、attempt、fence、账号归属的私有 sidecar 通道。现有 `CREATOROS_SIDECAR_HANDSHAKE_TOKEN` 同时注入 WebView，只能用于既有页面请求，不能用作 workbench 授权来源。Worker 接口只校验收到的宿主上下文形状，不能证明它仍是当前租约。
- 相对路径校验补上 Win32 设备名（含扩展名、COM/LPT 的上标数字）、尾部点/空格、保留字符、控制字符和大小写变体私有目录。macOS 实际文件系统测试继续覆盖 Unicode/空格写入、NFC 冲突、账号隔离、符号链接越界及进程组取消；新增跨平台路径输入测试是**在 macOS 运行的校验测试**，不算 Windows 文件系统实测。
- `RUSTFLAGS='-A dead_code' cargo test --manifest-path frontend/src-tauri/src/workbench/Cargo.toml --offline --locked --quiet`：本次 **7/7 通过**。`CARGO_TARGET_DIR=/tmp/creatoros-t1007-win-target cargo check --manifest-path frontend/src-tauri/src/workbench/Cargo.toml --target x86_64-pc-windows-msvc --offline --locked --quiet`：**交叉编译通过**，只证明 Windows 条件代码可编译。
- `cargo check --manifest-path frontend/src-tauri/Cargo.toml --locked --offline --no-default-features`：**受阻**，`build.rs:404` 报 `resource path binaries/creatoros-server-aarch64-apple-darwin doesn't exist`。仅为核对源码编译，使用 `TAURI_CONFIG='{"bundle":{"externalBin":[],"resources":[]}}'` 覆盖资源配置重跑同一 `cargo check`：**通过**。此覆盖不代表正常打包或安装版可用。
- Windows 原生文件句柄逐级校验尚无实现，`TaskFiles::new` 在 Windows 返回 `UnsupportedPlatform`；Windows 受限 token/文件授权与 Job Object 命令隔离尚无实现，命令模块未编入 Windows。当前机器是 macOS，只有 Windows Rust target；无 Windows 主机或可用 Docker daemon，因此**没有 Windows 路径、符号链接/重解析点、进程树的真实测试**。保持 Windows 拒绝执行，不能据交叉编译宣称隔离通过。

主控制面后续需提供可信私有 lease 验证通道及 Windows 真机，才能接入可调用 IPC、实现并验证 Windows 文件/进程边界；当前候选不满足 T-1007 完整验收。

## Mac 私有通道与 Windows 文件候选（主工作树复核）

Mac 桌面壳启动 sidecar 时创建权限为 0700 的临时目录和 0600 Unix socket；Rust 服务端用内核 `LOCAL_PEERPID` 核对实际启动的 sidecar PID，没有注册 WebView 可调用的 workbench 命令。Node 后端在原 execution lease 的 admission 事务内传入用户、账号、任务、attempt、fence 和原 operationId；文件读写结束前保持租约行锁。生产聊天仅在 macOS 桌面且该私有 socket 存在时冻结 `files.list/read/stat/write/edit` 目录。读与写分别声明副作用；已确认版本冲突返回当前版本，回执不明的写入保持 unknown 并要求按原 operationId 对账。Windows 没有此私有通道，故不会向模型展示文件能力。

```mermaid
flowchart LR
  M[模型给出相对路径与内容] --> B[后端原任务租约与工具账本]
  B --> S[仅 sidecar PID 可接入的私有 socket]
  S --> F[Mac 任务文件目录]
  F --> R[版本与原 operationId 回执]
  R --> B
```

Windows 候选已补 `TaskFiles` 的逐级目录 HANDLE 打开、重解析点和硬链接拒绝、同目录临时文件换名及版本冲突；设备名与 Unicode 路径校验共用合同。它通过 Windows MSVC 目标的独立包交叉检查，**尚无 Windows 真机文件系统测试**，也没有 Windows 私有 IPC 或受限命令隔离，不能作为桌面功能交付。

主工作树在合并 Mac/Windows 候选后实测：独立 Rust workbench **12/12**、Windows `x86_64-pc-windows-msvc` 独立包 `cargo check --offline --locked` 通过；Node 私有客户端与生产文件宿主测试 **8/8**，frontend 类型检查通过。Mac 测试包含真实子进程准入、其他进程拒绝、越界与版本冲突。原 Tauri 全包、安装版 Node/Python runtime、Windows 真实重解析点与进程树、命令 IPC、任务文件与产物登记的完整链路仍待验证。T-1007 保持进行中。

## Mac 受控命令私有通道候选（T-1007 子任务）

沿用文件操作的 0700 目录、0600 Unix socket 与 `LOCAL_PEERPID`：实际启动的 Node sidecar PID 才能调用 Rust `CommandHost`；未向 WebView 注册 Tauri command。原生产聊天宿主在当前 `execution_tasks` admission 行锁内注入用户、账号、任务、attempt、fence 及本次 tool call ID。`execution.run/status/cancel/read` 分别提供启动、状态、进程树取消和 stdout/stderr 分页回读。查询和取消传入的是目标原操作 ID，本次工具回执仍使用当前 tool call ID；Rust 命令表按账号任务范围和原操作 ID 联合索引，不泄露别的账号是否存在同名操作。

Mac runtime 目录来自壳层已经解析的绝对 `sidecar_dir`，固定节点为 `server.app/Contents/MacOS/creatoros-server`。Python 和 approved program 只看该 runtime 下的固定路径；当前打包脚本未交付二者，因此返回 `COMMAND_UNAVAILABLE`，不会查 PATH、Homebrew 或系统程序。子进程 `env_clear`，只设置任务目录 HOME/TMPDIR 与空 PATH；继续由 `sandbox-exec` 限制文件读取和任务内写入。Rust 定期检查超时；Node 在租约失效时用该次已核验的 scope 和操作 ID 向同一 socket 请求取消，Rust 宿主销毁时也终止仍在运行的进程组。输出写在任务可写根目录之外的私有目录。文件写入 IPC 的 JSON 字段同时纠正为与 Node 一致的 `contentBase64`、`expectedVersion`，补上原先不同语言的字段名错位。

先添加 Node 失败用例：命令方法缺失 2 条、生产目录缺失 1 条；实跑 **3 失败、其余 8 通过**。实现后实跑：

- Mac Rust 独立模块 `cargo test --offline --locked`：**15/15 通过**，包含真实进程、OS 沙箱拒绝任务外读取、派生进程取消、无模型轮询时到期进程自动清理、sidecar PID 准入/其他进程拒绝、命令输出回读、跨账号相同 operation ID 隔离、缺 Python 明确 unavailable。并行执行时曾有一次 socket 测试 `Broken pipe`；单测重跑及整组再跑通过，故保留该偶发失败记录。
- Node 私有客户端与生产宿主 Vitest：**14/14 通过**；含租约行锁内调用、旧 fence 拒绝、用户停止后自动请求取消、独立命令目录、输出分页 metadata、缺失 runtime 与已分发断联的结果区分，以及无效输入拒绝。
- `pnpm --dir frontend typecheck`：通过。`TAURI_CONFIG='{"bundle":{"externalBin":[],"resources":[]}}' cargo check --manifest-path frontend/src-tauri/Cargo.toml --lib --offline --locked --quiet`：通过。该配置仅跳过隔离工作树中缺失的 sidecar 资源，用于桌面壳 Rust 源码编译，**不是安装包通过**。
- `git diff --check`：通过。`boundary-scan` 仍为 7 条、其中 2 条既有 R2 位于未修改的 `frontend/src/features/copilot/live-chat-session.ts`；本候选未增加违规。

一次探索性测试把 `/bin/echo` 复制为伪装的 `server.app` 二进制后，macOS 将该**测试副本**进程置为不可中断状态；对其 PID/进程组发送 SIGKILL 仍未退出。随后删除该运行方式，正式测试使用系统二进制作为**测试夹具**，生产解析仍严格限于随包目录；取消代码已改为有界等待，遇内核无法回收的进程返回未知。该遗留测试进程及安装版命令运行仍须单独核实，不能把本候选称为“零残留”真机验收。

尚未验收：安装版 Node 在该沙箱中实际执行脚本、随包 Python/approved program、应用或机器异常强杀后的进程身份恢复、Windows 私有 IPC 与 OS 命令隔离、Windows 真机、任务完成后的输出与产物持久登记、完整模型任务。T-1007 继续进行中。

## Windows 命令隔离复核（隔离工作树候选，2026-09-20）

目前不能安全开放 Windows 命令。Windows 文件 API 的逐级句柄检查只保护宿主自己的文件操作；如果命令进程继承桌面用户身份，它仍可直接打开任务目录外的用户文件。Job Object 可以管理和终止进程树，不能改变进程访问文件时使用的身份和授权。仅有 `cwd`、清空环境变量、固定 runtime 路径和 Job Object，不满足 FR-AW-04 的文件、网络及进程隔离。

```mermaid
flowchart LR
  R[已核验任务租约] --> H[Windows 命令宿主]
  H --> G{任务专属 OS 隔离已实测?}
  G -- 否 --> U[COMMAND_UNAVAILABLE，无子进程]
  G -- 是 --> P[受限身份和任务目录授权]
  P --> J[无逃逸 Job Object 中的命令]
```

**精确阻断点。** 本候选没有为每个任务创建 AppContainer 或受限 token，也没有为该身份配置仅任务目录可写、所需安装包文件只读的 ACL；没有证明网络默认拒绝、句柄不继承和派生进程不能越权。`command_windows.rs` 因此在解析请求和固定 runtime 后返回 `COMMAND_UNAVAILABLE`，不预占 operationId、不创建输出、不启动进程。Windows 桌面壳也尚无通过原执行租约验证的私有 IPC，不能把 WebView 可见 token 当成授权通道。微软的 [AppContainer 说明](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer)明确了包身份、能力 SID 与文件 DACL 的双重授权及无网络能力时的网络限制；[受限 token 说明](https://learn.microsoft.com/en-us/windows/win32/secauthz/restricted-tokens)明确了双重访问检查；[Job Object 说明](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)只承诺进程组管理和限制。微软另有 [实验性 CreateProcessInSandbox API](https://learn.microsoft.com/en-us/windows/win32/secauthz/createprocessinsandbox)，最低客户端为 Windows 11、接口须动态加载；本候选没有以该实验接口代替产品所需的已验证 Windows 路径。

**本轮实际可执行证据。** 之前的交叉检查遗漏了未接入的 `command_windows.rs`。现在 `workbench/mod.rs` 将它接入 Windows 编译；macOS 测试构建也编译并运行其准入测试。独立 Rust 测试中的可执行脚本夹具在任务目录外放置触发标记，合法形状的调用返回 `Unavailable`，标记不存在；这是“当前候选未派发”的证据，**不是 Windows 内核沙箱通过**。本机装有 `x86_64-pc-windows-msvc` target，但 Docker 命令报告无法连接 daemon，且无 Wine；没有 Windows 真机或远端 runner。后续必须在 Windows 上用真实打包 runtime 验证任务内读写、任务外读写拒绝、网络拒绝、继承句柄拒绝、派生/取消/超时/宿主退出零残留以及 Unicode/空格与重解析点路径，再接入私有租约 IPC。任何一项失败继续保持拒绝执行。

- `CARGO_TARGET_DIR=/tmp/creatoros-t1007-win-target cargo check --manifest-path frontend/src-tauri/src/workbench/Cargo.toml --target x86_64-pc-windows-msvc --tests --offline --locked`：通过；编译了 Windows 模块及其测试，**未执行 Windows 二进制**。
- `CARGO_TARGET_DIR=/tmp/creatoros-t1007-mac-target RUSTFLAGS='-A dead_code' cargo test --manifest-path frontend/src-tauri/src/workbench/Cargo.toml --offline --locked command_windows::tests -- --nocapture`：Windows 候选的跨主机准入测试 **5/5 通过**。其中可执行脚本仅在 macOS 测试环境下使用。
- 同一 Mac 独立包全套并行测试两次均为 **19/20**，既有 `ipc::tests::private_socket_runs_reads_and_cancels_mac_process_for_same_task_only` 分别出现 `EOF while parsing a value` 和 `Broken pipe`；该测试单独重跑通过，全套加 `-- --test-threads=1` **20/20 通过**。这仅表明串行路径通过；并行 socket 偶发失败仍未解决，本候选没有修改 Mac IPC。
- 尝试整包 `TAURI_CONFIG='{"bundle":{"externalBin":[],"resources":[]}}' cargo check --manifest-path frontend/src-tauri/Cargo.toml --lib --target x86_64-pc-windows-msvc --offline --locked`，在依赖 `ring 0.17.14` 的 C 构建中失败：交叉编译器缺 Windows MSVC C 头文件 `assert.h`。独立 workbench Windows Rust 模块通过不等于整包通过；本机缺完整 Windows C/MSVC 工具链，且资源覆盖不代表真实打包。

## 2026-09-20 独立门卫与 Mac IPC 并行故障修复

T-1008 将浏览器模块接入 `workbench/mod.rs` 后，T-1007 独立 Rust 测试包在 macOS 上缺 NomiFun 依赖而无法编译。现将浏览器模块改为正向 `workbench-browser` feature：桌面主包默认开启，独立文件/命令测试包不启用；主包默认、`--no-default-features`、`--all-features` 的源码检查均通过（仅用临时 Tauri 资源覆盖，不代表安装包）。

原独立测试并行偶发 `Broken pipe` / 空 JSON 的根因也已实测定位：Mac 非阻塞监听 socket 接受的连接继承 `O_NONBLOCK`，客户端稍晚写入时服务端 `read_until` 返回 `EAGAIN`（os error 35），连接在回复前关闭。服务端现对**已接受的连接**切回阻塞模式并保留 10 秒读写超时；增加“先连接、100 毫秒后才写请求”的确定性回归。修复前 20 项并行测试在第 14 次复测时再次失败，带诊断运行记录到 `EAGAIN`；修复后原 20 项连续并行运行 **30/30 次整组通过**，加入延迟写入用例后独立门卫 **21/21**。浏览器私有 socket 同样修复了该继承问题并通过对应延迟写入测试。Windows 文件/命令实际隔离和安装包仍未验收，T-1007 继续进行中。
