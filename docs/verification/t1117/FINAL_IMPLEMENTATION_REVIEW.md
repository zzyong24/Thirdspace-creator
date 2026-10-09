# T-1117 / T-1119 / T-1120 / T-1122 最终限定实施与视觉复核

结论：**PASS_LIMITED_T1117_T1119_T1120_T1122_SOURCE_UI_VERIFICATION**。当前冻结提交 `7de72c56a3016bc9d1128fd26655a4d5c9200334` 的本轮源码、测试维护、Next 派生产物恢复与局部 UI 视觉证据满足各自限定范围；没有未解决 finding。完整 reconcile 尚无本轮规范环境终态，因此本结论不等于全局 Gate 或任务集合全部通过。

## 实现与真实公共链

- 三个产品文件保持已审 SHA：CanvasEditor 只把非显式 HTTP 错误交给既有中文错误转换；画布两处才关闭可见身份，AssetPicker 默认行为不变。真实 asset/file、CAS、取消零写、键盘确认和保存/回读均保留。
- T1120 唯一把首次 reload 改为 `domcontentloaded`，原中断错误、中文 alert、随后保存和精确回读断言未删除。
- T1122 只在两张截图前确认左选中卡和右预览的真实图片均 `complete && naturalWidth > 0`，未使用固定 sleep、假图或生产加载旁路。
- 最终公共浏览器为 2 PASS、0 retry、exit 0、124.515317 秒；组件 3 files / 32 tests、LED-047 8 files / 174 tests 均 0 skip；最终 frontend typecheck exit 0。

## T1119 派生目录维护

helper 只允许两份 `.next/dev/types` 派生文件：逐层 lstat/realpath 拒绝 symlink 和路径漂移，要求非空；两次 lsof 检测把 next-dev 与未知 Node 视为写者并 fail closed；原字节保存到 0700 目录、文件以 `wx/0600` 写入并复核 SHA；删除前再次核 SHA/inode/dev，只 unlink 闭集两文件。实际 prepare、production 产物核验、development 产物核验和最终原 typecheck 全部 exit 0；prod/dev 两组产物均非空且 tsconfig 仍消费两条路径。写坏源头仍为 UNKNOWN。

## 局部视觉复核

我逐张查看了四张 T1117 原分辨率截图及 T1108 对照图：

- 1366 与 900 两个错误态都在画布主区域清晰显示“网络连接不稳定,请检查网络后重试。”，产品界面不再展示裸英文错误。
- 两个预览视口都沿用现有紫色选择系统；标题、说明、搜索、筛选、取消和“使用此素材”的层级清楚。
- normal/narrow 的左侧选中卡缩略图和右侧大预览均已真实加载；可见区域隐藏长文件名与尺寸，窄屏没有遮住关键按钮。
- 与旧 T1108 图相比，修复只改变错误文案和参考身份展示，没有引入新的视觉方向或破坏既有布局。

## 诚实边界

前三次浏览器失败、T1119 两次类型失败均保留；T1118 的原验收目录消失和 raw 日志丢失仍为 UNKNOWN，没有重建。当前规范环境完整 reconcile 尚未返回，因此不写“最新全局 PASS”或“41 项”结论。安装版、AI 联合候选/T1103、真实扫码、真实模型和原生效果也不在本报告的通过范围。

机器可读证据见 `FINAL_IMPLEMENTATION_REVIEW.json`。
