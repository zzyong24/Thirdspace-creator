# T1126 安装版导出调用诊断独立闭环复核

结论：**PASS_LIMITED_T1126_CALLER_DIAGNOSIS_AND_INSTALLED_RENDER_CHAIN**。证据支持本次失败属于验收调用方选错确认入口；无需产品修复。

## 包与安装绑定

源码为 `d712130f9a02887ee60c092f9263a6da56a941fe`。DMG SHA256 为 `7e0d60c1…89982`，镜像校验和codesign均exit 0；安装后的binary/sidecar与构建包一致，新PID 1909由公开CLI确认connected。13098份tracked源码保持，安装后65项公开数据SHA全部与基线一致。签名为ad-hoc，不代表Apple公证。

## 导出链结论

- 原已采纳r7导出任务 `ai-task-69d4c1de-317` 和request identity保持。
- 错误调用 `ai.tasks.confirm` 实际exit 4；失败receipt与日志保留，没有改写成成功。
- 经 `ai.results.list` / `execution.tasks.get`确认它是原生执行任务后，使用 `execution.tasks.confirm` 对同一原task成功采用。
- 最终task为succeeded，renders由4精确增至5；新增asset `asset-69d4c1de-367`、file `afile-69d4c1de-368`，640×360、8167ms、199098 bytes、video/mp4；editor DTO SHA前后相同。
- 没有新模型调用、重提、私有API、数据库直写或原文件改动。

因此本次可关闭“验收caller误用通用AI确认入口”的诊断；不能据此声称通用`ai.tasks.confirm`已支持execution manifest，也不需要为它改产品。

## 边界

本审没有独立下载并完整解码新文件，也没有原生窗口或播放器人工眼验。用户optional体验问题尚未回答；不签全功能、真实模型、扫码、T1103或其它任务。
