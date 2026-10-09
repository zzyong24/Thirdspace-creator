# LED024 原时长门失败的最小修复候选（未应用）

当前源码24b432b1e0f1a5067a555f766b0d1b66aa1f3c1e。原命令 `node orchestrator/process/verify-t794-motion-card-preview.mjs` 在横版通过后，竖版严格时长门 actual=15.34 / expected=15 失败。候选日志 `lesson024-preview-exact-diagnostic.log` 与现有6b1322af归档诊断树同命令日志 `lesson024-baseline-preview-exact-diagnostic.log` 均exit1、相同差异。该基线事实不能放行当前候选。

操作者已有15秒口播与辅助卡片，最终需要同长的可交付视频，再进入渲染和编辑。辅助内容结束后的人物回位必须发生在口播时间范围内；不得生成额外无对应口播的尾帧。失败时保原props与候选，不以修改用户内容、把时长预期改15.34或绕过预览门恢复。

## 既有批准范围与实际根因

- T794验收第5项要求真实横竖预览的人物/字幕安全区无回归；原预览脚本第50行精确比较主时间线与fixture口播15秒。
- T902 `2026-08-19-portrait-presenter-first-face-persistent.md` §2、§3、AC2明确同一人物、连续辅助画面不反复缩放、辅助结束后回原全幅几何，确定性代码落实时间和可见性边界。未批准延长口播或主时间线。
- `template.ts` 的 `schedulePortraitSpeakerDirection` 最后无条件 `change(state,"full",previousEnd)`。fixture最后辅助beat的previousEnd等于15，而 `change` 在15启动duration=.34的真实GSAP tween。`#root`仍声明data-duration=15，主时间线因该tween延长到15.34。源码来自既有ece279a1，当前集成未修改此文件。
- 当前原LED024前三段分别Worker11/11、backend178/178、frontend12/12通过；不能代替真实预览失败。

## 最小生产候选与验证写集

尚未获本轮实施许可，0代码或断言修改。候选仅 `backend/src/modules/execution/video-render/template.ts` 的上述局部 `change`：若位置已在口播终点或之后，不安排不可见的末尾回位；位置尚在范围内时，用 `min(.34, durationSec-at)` 限制该人物几何transition的持续时间。末尾layer切换也在同一终点内。继续保留人物常驻、相邻辅助画面单次缩放、原全幅/PiP几何与横屏分支；不对整个timeline缩放或截断、不改卡片与字幕时间。

回归候选仅现 `template.test.ts` 追加真实时间边界：辅助覆盖整个口播时不在终点新起人物动画；辅助提前结束且留足窗口时原.34回位；仅剩.1秒时精确在原终点回位；连续辅助只一次收缩；无真人visualOnly与横版原行为不变。原严格15秒脚本必须完整通过横竖几何与字幕安全区，不仅查看HTML字符串。重新跑原LED024完整命令，必要T902模板/安全门回归。无需用户视频、模型调用、安装版、DB或账户。

若正式裁决要求尾部保完整.34而非限制，应先明确与原口播时长冲突的产品决策、下游渲染/音轨/字幕影响和恢复；当前候选没有自行批准该行为。
