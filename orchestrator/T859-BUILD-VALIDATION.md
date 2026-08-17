# T-859 BUILD 验证：竖屏素材段左下人物与平滑转场

**状态**：实现与真实短样片已通过独立审看，等待用户预览确认；未重渲整片、未出安装包。
**SPEC**：`docs/superpowers/specs/2026-08-16-portrait-material-pip-smooth-transition.md`
**审核**：Round 2 `PASS[REV:9895a91a63a8]`

## 用户可见结果

- 竖屏人物默认全屏；主素材进入时，同一人物视频节点在 0.34 秒内收进左下角固定 9:16 PiP。
- 两段连续素材之间人物保持同一几何与连续时间轴，不重复放大缩小。
- 动态内容卡接管时人物退出；结束前人物基底预备并淡入，回到全屏时没有空舞台。
- 竖屏主素材不再单帧硬开：静态舞台、素材框和真实媒体统一做 0.20 秒淡入、0.18 秒交叠淡出；
  B-roll 与人物视频均显式 `preload="auto"`。
- 素材候选 `speakerMode` 从 `material.match` 结构化输出，经 backend runner、contract、props 组装器
  到 HyperFrames 模板全链保留；旧候选缺字段时只按用户确认画幅降级，竖屏为左下 PiP、横屏隐藏。

## 真实证据

- MP4：`orchestrator/evidence/T-859/portrait-material-pip-14s-preview-v6.mp4`
- 标准接触表：`orchestrator/evidence/T-859/contact-sheet-v6.jpg`
- 四个边界、每边界四帧密集接触表：`orchestrator/evidence/T-859/transition-contact-sheet-v6.jpg`
- 编导计划：`orchestrator/evidence/T-859/preview-plan-v6.json`
- 探针：1080×1920、30fps、420 帧、14.000 秒，H.264 + AAC。

独立 reviewer 实际审看 MP4、标准接触表和密集接触表后结论为 PASS：3.366 秒人物平滑收进左下；
5.650 秒连续浅色录屏互切时人物不动；7.083 秒素材和 PiP 淡出、动态内容接管；11.400 秒动态内容
淡化揭示全屏人物。未见纯白/纯黑空帧、浏览器默认背景、未加载首帧、人物居中或连续素材弹跳。

## 聚焦回归

- `ai-worker` material/director prompt：14/14 通过；material-match 全量运行时 382/382 通过。
- `contract/tests/video-render.test.ts`：17/17 通过。
- `backend` runner + template：161/161 通过；runner 单文件复跑 86/86、template 单文件复跑 75/75。
- `frontend` props 组装器：10/10 通过。
- `ai-worker`、`contract`、`backend`、`frontend` TypeScript 检查全部通过。
- `boundary-scan`：无新增违规，剩余 5 条等于项目既有基线。
- `semantic-boundary-scan`：通过；创作匹配仍由 Skill/模型负责，代码只落实真实 ID、枚举、画幅和
  用户确认偏好。
- `orphan-scan`：0 error；100 条均为项目既有 PLAN/BUILD 警告。
- `git diff --check`：通过。

## Skill 反馈处置

本轮没有把“所有视频都默认左下 PiP”写进全局 `video-editing` Skill。该 Skill 已允许用户明确要求时
使用 PiP；本次正是这个显式例外，先作为 CreatorOS 项目级决定落实。待用户确认它是长期通用默认后，
再按 Skill 自迭代规则提升为全局偏好，避免把一次样片意见误推广到其他项目。

## 未宣称

- 没有重渲用户完整成片；当前只验证 14 秒真实生产时间线片段。
- 没有打安装包、发布或写入外部系统。
- T-859 保持进行中，等待用户对 v6 的视觉确认；确认后再决定是否应用到整片。
