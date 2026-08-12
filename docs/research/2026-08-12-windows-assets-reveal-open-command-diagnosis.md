# Windows 素材中心“打开文件”失败诊断

日期：2026-08-12
任务：T-786
范围：只读分析用户提供的两份加密 Windows sidecar 日志与当前实现；未修改用户数据或产品代码。

## 结论

这是 CreatorOS 的跨平台实现缺陷，不是用户操作错误，也不是文件丢失、Windows 权限、渠道配置或模型配置导致。

素材中心的“在文件管理器中显示”接口只实现了 macOS：无论实际系统是什么，都固定执行
`open -R <文件路径>`。用户运行在 Windows，系统中不存在名为 `open` 的程序，因此 Node 在创建
进程时直接返回 `ENOENT`。Windows 应执行 `explorer.exe /select, <文件路径>`。

```mermaid
flowchart LR
  A["用户点击素材文件"] --> B["CreatorOS 已确认文件真实存在"]
  B --> C["错误调用 macOS：open -R"]
  C --> D["Windows 找不到 open"]
  D --> E["返回 ENOENT，页面提示打开失败"]
```

## 日志证据

- 两份日志均可用同版本开发者密钥完整解密：约 2.2 KB 的文件记录启动阶段，约 38 KB 的文件记录完整操作阶段。
- `2026-08-12T08:08:07.270Z` 至 `08:08:25.981Z`，用户至少触发 7 次素材定位，全部报同一种错误：
  - `code: 'ENOENT'`
  - `syscall: 'spawn open'`
  - `cmd: 'open -R C:\\Users\\Administrator\\CreatorOS\\media\\...\\objkey-....webp'`
- 失败涉及至少两个真实素材对象：`objkey-86947789-1206.webp` 与 `objkey-86947789-1201.webp`，说明不是单个异常文件。
- 日志中的 `errno: -4058` 是 Windows 创建进程时“找不到指定程序”的错误；找不到的是命令 `open`，不是后面的素材文件。
- 当前 route 在执行命令前已经通过 `realpathInsideRoot` 验证目标文件。若文件不存在，会在更早的位置返回 `file missing on disk`（404），不会进入 `spawn open`。因此这份日志反而证明点击时文件存在且已通过安全路径检查。

## 代码证据

- `frontend/src/app/api/v1/local/reveal/route.ts` 的素材分支固定执行 `execFileAsync("open", ["-R", real])`。
- 同一路由的项目目录分支也固定执行 `execFileAsync("open", [real])`，所以 Windows 上“打开项目素材目录”也有相同风险。
- 仓库中 `frontend/src/app/api/v1/local/reveal-logs/plan.ts` 已经有正确的跨平台范式：Windows 使用 `explorer.exe`，macOS 使用 `open`，Linux 使用 `xdg-open`；素材 route 没有复用这套计划与 launcher。
- 素材中心的成功/失败文案还写死为“Finder/访达”，Windows 用户即使修好命令也会看到错误的平台名称。
- `git blame` 显示这个 macOS-only 调用从 T-055d 初版就存在，后续改动只补了账号上下文，没有补 Windows 分支；不是本次日志中的其他错误把它临时触发出来。

## 与日志中其他异常的边界

同一份长日志还出现渠道配置同步、抖音页面遮罩、Local Whisper、生图模型未配置等其他记录，但它们与素材文件打开失败没有调用关系。素材失败有自己完整、重复且确定的 `spawn open ENOENT` 证据，不应把这些独立问题一起归因或一起向用户承诺。

## 用户当前可操作办法

在修复版发布前，可在素材详情中使用“复制地址”，把复制出的完整路径粘贴到 Windows 文件资源管理器地址栏或“运行”窗口打开。素材文件本身不需要重新上传。

## 最小修复建议

1. 把文件/目录 reveal 计划抽成纯函数并复用现有 launcher：
   - Windows 文件：`explorer.exe /select, <path>`，只等待成功 spawn；
   - Windows 目录：`explorer.exe <dir>`；
   - macOS 文件：`open -R <path>`，目录：`open <dir>`；
   - Linux 文件定位至少打开父目录，目录使用 `xdg-open <dir>`。
2. 给 win32/darwin/linux 的文件与目录组合补纯函数测试，并补 Windows Explorer “成功创建即完成”的 launcher 测试。
3. 将页面文案改为平台中性的“在文件夹中显示 / 已在文件夹中显示 / 打开失败”，避免 Windows 显示 Finder/访达。
4. 保留现有账号归属、路径穿越与 `realpath` 检查；修复只替换验证通过后的平台启动计划，不能削弱安全门。

## 2026-08-12 修复回填（T-788）

- 新增 `reveal/plan.ts`，按 win32/darwin/linux 与 asset/project 生成 shell-free 执行计划；未知平台明确拒绝。
- `reveal/route.ts` 保留原有账号归属、路径 containment 与 realpath 检查，只把验证后的路径交给
  `planRevealTarget + launchRevealPlan`，已移除直接执行 macOS `open` 的调用。
- 素材中心按钮和成功/失败提示改为平台中性的“打开位置 / 文件管理器”，Windows 不再显示 Finder/访达。
- 红测初始表现为计划模块不存在、UI aria-label 仍为 Finder；实现后平台矩阵、route 接线、launcher
  完成语义和 UI 交互回归通过。项目 LED-022 已晋升 `rule` 并接入 reconcile。
- 尚未发生 Windows 最终安装物真机验收；本次可以证明代码缺陷和自动回归已修复，不能把安装包行为提前写成已验证。
