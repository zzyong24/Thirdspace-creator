# T-1246 当前原生自动化环境

2026-10-11 22:18（Asia/Shanghai）实际探测。机器 macOS26.2（25C56）、Xcode26.6（17F113），xcode-select 指向 `/Applications/Xcode.app/Contents/Developer`。Node25.9.0、npm11.12.1符合锁定工具的实际 engines。

仅测试工具安装在 `/tmp/t1246-appium`：Appium3.8.0、mac2 4.3.6，项目依赖未修改。初次工具登记遗漏导致真实 doctor exit1“mac2 not installed”，记录于 `app-environment-installed.json/.txt`；用官方CLI的 `driver install --source local` 将现有锁定 driver 链接到本轮 `/tmp/t1246-appium/home`，实际 exit0（`app-tools-register.txt`）。随后12项环境命令均 exit0；driver list确认为本地4.3.6，doctor有0项必需修复、1项可选警告，原回执见 `app-environment-installed-registered.json/.txt`。

**系统当前 Automation Mode disabled，仍需要用户认证。** doctor 的 exit0与末尾“all issues fixed”不能覆盖它同时打印的认证警告。这里只运行 `automationmodetool` 无参数读取状态；没有执行其免认证 enable/disable 子命令、没有更改TCC或输入系统密码。本机 man 仅列出免认证配置开关，没有普通 enable 子命令。正常认证应由 XCTest/mac2 会话初始化触发系统提示，待用户可响应且新包隔离准入完成后才尝试。

原生 App 验收目前 pending：新包尚未提供，未建立原生 session，未启动/导航被测 App，未产生 App截图。应用数据隔离仍需核实：Rust shell 直接使用 Tauri app_data_dir，并在该目录处理数据库、日志、machine-id、master key、license与登录目录；单独配置新appPath或PGlite变量不能证明所有写入隔离。已将具体路径、行号和准入要求通知主线程；不改产品配置或真实用户激活来绕过它。

本轮用例见 `APP_CASES.md`，22项操作覆盖启动、导航、Codex/Pi设置、ASR/video保留、知识库、素材、组归属、自动化宽窄窗口和恢复。每个正环境命令120秒，探针外层1800秒，driver登记600秒；不存在重发业务任务。环境准备不代签官方模型、开发App、安装包或23功能逐族真机通过。

来源：[官方环境准备](https://appium.github.io/appium-mac2-driver/latest/getting-started/)、[官方 capabilities](https://appium.github.io/appium-mac2-driver/latest/reference/capabilities/)，锁定本地 `appium-mac2-driver/lib/doctor/optional-checks.ts:48` 实际只执行无参数状态命令；当前系统 man 已实际读取。旧 T1207认证超时日志保留，本轮结论来自新命令，不由旧失败推断。
