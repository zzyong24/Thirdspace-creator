# T1206 打包后的资源与清理实际结果

本轮真实磁盘数据卷可用约2.3GiB，定向清理前2.24GiB；32GiB物理内存，memory_pressure报告可用百分比65，swap初测24206MiB/25600MiB。当前采样不能反推用户所见“瞬间没内存”的历史峰值或确定内存泄漏。没有遗留next build/cargo/rustc/混淆编译进程；初始CreatorOS服务RSS0.934GiB，Codex Renderer2.86GiB。

清理前逐项检查8个固定目录：均Git忽略、无跟踪源码、非符号链、无lsof占用、无在途构建。当前安装版HTTP服务实际cwd为用户Application Support/runtime/1.2.0/sidecar/frontend，与待清理源码树目录不同。对最新bundle DMG、bundle App和/Applications App逐项核此前已验证内容SHA，通过后才清理。Downloads的规范DMG本次实际不存在，来源UNKNOWN；未恢复、不猜用户操作，也未删除最新bundle DMG。

实际删除 frontend/.next、frontend/src-tauri/sidecar、target/debug和release-fast的build/deps/.fingerprint/incremental/examples。目录统计20.03GiB，清理后文件系统可用由2.24→21.92GiB，实际差额19.68GiB；随后系统继续回收，3次采样均24.93GiB（df约25GiB）。系统swap自行从约24GiB缩小为20990–20998MiB，未删OS交换文件或执行purge。

20秒3次采样，CreatorOS服务RSS0.921/0.924/0.924GiB，主进程0.044GiB；短窗口不证明无泄漏，也不签历史OOM根因。Codex Renderer2.687/2.693/2.815GiB，未关闭或强杀其它用户应用。用户随后明确回复“磁盘／存储空间不足”，本次确认是磁盘空间问题；构建中间目录20GiB未及时清理直接加重空间不足，本任务不再按RAM/OOM问题归因。

清理后最新构建DMG与App精确哈希全部保持，CLI公开status connected true、installed、原生PID4372；产品源码diff为空。保留最终target/release-fast/bundle、源码、依赖、日志及原验收证据、用户数据、素材、激活、安装版运行时。无备份，无push/tag/发布，无新增产品代码；本次收尾确实此前未及时清理。

验收为真实磁盘回收、路径边界及当前安装版连接；无产品变更，不制造TDD/视觉/全量reconcile重复证据。旧全局29ERROR保持T1204，不以本次清理签全功能完成。
