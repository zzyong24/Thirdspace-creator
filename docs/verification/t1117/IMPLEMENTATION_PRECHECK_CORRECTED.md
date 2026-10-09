# T-1117 实现预审修正版

结论仍为 **PASS_STATIC_PENDING_BROWSER_VISUAL_FINAL**。当前断言范围修正合理；公共浏览器复跑、截图与最终源冻结尚未完成。

## 更正原报告

原 `IMPLEMENTATION_PRECHECK` 对包装器有两处事实错误：当前 `run-evidence.py` 使用 `open("wb")`，并非 `xb`；它会覆盖同名日志，并不自行拒绝覆盖。旧报告保留作为审计历史，本报告撤回这两项描述。root 每次使用不同 stem 保存旧日志，这是调用纪律，不是包装器保证。

包装器仍忠实保留这些事实：argv 数组直传且不经 shell；继承 cwd/env/stdin；stdout 与 stderr 合并记录；返回真实子进程退出码；写完后计算日志 SHA 并记录 UTC 与单调时钟耗时。限制是同名 stem 可覆盖且两条输出流无法分离。

## 首次浏览器失败与修正

首次公共浏览器实际为 1 PASS / 1 FAIL，exit 1，370.887662 秒，日志 SHA `7c3b8acc44e0052ec67f7b1482b9b4edbab8faa4f63f390af487d91eb8a5a028`。画布自身 alert 已正确显示中文；失败来自全页 `Failed to fetch` 计数命中 Next 开发诊断 portal 中保留的 console 错误。该失败继续保留，不计作浏览器通过。

当前 E2E 仅把该新增断言限定到“包含画布标题输入框的 CanvasEditor main”：仍验证产品区域存在中文 alert 且没有裸英文。它没有关闭开发诊断、删除产品断言或改变保存逻辑；原保存、精确文件、重载、恢复、防重复与平台流程断言均保留。因此该断言范围修正合理。当前 E2E SHA `7be78ed5d50373b49f64faee98a8e8b3f7455c8fb4a9a0227db32172aa55d00a`。

待验：scoped 公共浏览器复跑终态、normal/narrow 截图视觉复核、最终源冻结与零漂移。本报告不签最终浏览器、安装、全局 Gate 或 T1118。
