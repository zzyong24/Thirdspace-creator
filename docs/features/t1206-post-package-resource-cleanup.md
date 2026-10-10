# T-1206 打包后资源骤降诊断及环境清理

用户当前问“为什么瞬间没内存、是否临时文件未清理”；既有已授权清理旧制品、不用worktree与垃圾，并要求构建不备份。此任务先区分磁盘/RAM，属于4-build后本机环境收尾，无产品、交互、权限、架构或数据归属改动。流程Skill3.29与项目一致；单写者执行，不派发自治改代码。

当前实际采样：32GiB内存，压缩页约5.6GiB，swap使用24206MiB/25600MiB，memory_pressure报告系统可用百分比65（不能误读为完全无内存）。数据卷413GiB已用、可用2.3GiB。RSS最大为Codex Renderer约2.86GiB，CreatorOS当前4490父4372约0.934GiB。没有next build/cargo/rustc/obfuscate在途编译进程；这不是历史构建峰值或泄漏证据。

main忽略目录实际du：frontend/.next9.8GiB、frontend/src-tauri/target9.8GiB、frontend/src-tauri/sidecar2.1GiB；依赖node_modules2.2GiB保留。先按当前Git忽略、非符号链、固定路径、实际占用与最新包内容复核，清理.next、sidecar及target中缓存/编译中间目录；target最终bundle制品和发布manifest保留，不删除整个target。不得删除受Git跟踪文件、.env、源码、依赖、验收原日志、用户库、素材、激活、正在运行的runtime或其它应用。

Downloads新DMG在当前du显示不存在，原因未知；不猜成用户删除、不恢复或重造。以本次构建bundle中的实际新DMG、App与安装版精确SHA核最新产物，保留它们。预先df、内存/进程、目录占用存私有证据；任何路径被运行进程使用则跳过并报告。清理完成重测df/目录/运行版CLI公开连接及App哈希、Git源码差异。只签回收磁盘空间；若RAM问题仍存在或RSS持续增长再登记精确性能任务，不清理OS swap或强杀用户其它App，不用purge冒充修复。

无需产品TDD/视觉/接口/全量reconcile重复运行，本任务未改产品；既有全局29ERROR仍由T1204处理，不改签。taskctl必须记录start/complete；实际清理与验证证据提交，不创建备份副本。
