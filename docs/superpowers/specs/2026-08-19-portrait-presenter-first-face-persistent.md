# T-902 竖屏真人主导与人脸常驻修复 SPEC

> 日期：2026-08-19
> 状态：用户已明确确认；复用 T-858/T-859 正式制作链
> 决策：DEC-VIDEO-056

## 1. 问题与目标

用户真实 1080×1920、116.6 秒成片的 8 个均匀抽样帧全部只有卡片或素材，没有任何真人画面。根因不是
人脸检测或源视频缺失，而是已确认 direction 把绝大多数时间排成 card/B-roll takeover，模板又把 card
和 `speakerMode=hidden` 映射为人物不可见；T-896 在素材与人物框冲突时继续把人物降级为 hidden，最终
合法渲染出“整片无人”。

本次恢复竖屏的产品原则：只要输入存在真实口播视频，真人是持续可见的视觉基底和主要陪伴；内容卡与
素材负责解释当前一句，不能把真人从整条竖屏成片中移除。

## 2. 已确认行为

- 竖屏 talking-head beat：人物保持同一份全幅 9:16 基底，不裁切、不重启时间轴。
- 竖屏 card 或非 overlay B-roll beat：人物平滑收进固定左下角，始终位于内容层之上；相邻辅助画面
  期间不反复缩放，结束后回到同一全幅几何。
- 旧候选或模型明确给出的 `hidden` 在竖屏有真人输入时只作历史兼容，不再获得隐藏人物的最终执行权；
  新候选默认使用 `pip_bottom_left`。横屏继续尊重原有 hidden/PiP 策略。
- 竖屏素材舞台必须在人物框和字幕上方留出可证明的安全区域。发生冲突时调整素材舞台，不再通过隐藏
  人物让质量门通过。
- `visualOnly=true` 的纯动画验看不生成或伪造真人；缺失/损坏的 talking-head 输入仍按既有结构校验失败。

## 3. AI 与确定性代码边界

AI 继续负责素材语义、卡片内容、出现时机和节拍；代码只落实用户明确确认的画幅偏好、真实引用、时间、
几何和可见性安全边界。代码不得按文件名或文案关键词决定素材与人物关系。

导演提示需明确：竖屏真人为默认主画面，卡片/素材是短时辅助，不能用 takeover 连续覆盖整片；同时
renderer 对旧 direction 做最终可见性兜底，避免仅更新提示词却无法修复已生成候选。

## 4. 验收

1. 红测复现：一个竖屏 direction 被 card、`speakerMode=hidden` B-roll 连续覆盖全时长；旧代码生成
   `#th autoAlpha:0`，修复后 HTML 不得存在任何竖屏隐藏人物 tween。
2. 卡片与 B-roll 时间窗都生成稳定左下人物几何，连续辅助 beat 只移动一次；首尾 talking-head 保持
   全幅并精确回位。
3. 横图、方图、竖图的素材可见区域均不与人物框或字幕区冲突，正式安全门通过且不产生 hidden fallback。
4. 横屏相关快照与回归保持原样；无真人视觉专场保持原样。
5. 用真实 1080×1920 输入生成代表性预览或等价 HTML/帧证据，确认人物在抽样时刻持续可见。

## 5. 影响范围

- `backend/src/modules/execution/video-render/template.ts` 与回归
- `frontend/src/features/production/assemble-video-render-props.ts`、回归审计与测试
- `ai-worker/src/prompt/templates/material-match.ts`、`video-decisions.ts` 与测试
- 全局 `video-editing` Skill 的竖屏默认规则
- `DECISION_LOG.md`、`CHANGE_IMPACT.md`、traceability 与任务证据

不新增数据库、服务接口、供应商或渲染引擎，不修改用户既有项目和成片。

## 6. 2026-08-19 实施与验证证据

- 使用与用户失败成片同源的真实 1080×1920 口播素材生成 6 秒代表性预览；0—1 秒与 5—6 秒为
  真人全幅，1—3 秒卡片、3—5 秒素材均保留左下人物。四个均匀抽样帧全部有人脸。
- 预览：`orchestrator/evidence/T-902/t902-presenter-first.mp4`
- 四帧联系表：`orchestrator/evidence/T-902/contact-sheet.jpg`
- 可复现命令：`pnpm --dir backend exec tsx ../orchestrator/process/verify-t902-portrait-presenter.mts <真实竖屏人物视频> orchestrator/evidence/T-902`
- 旧布局安全渲染回归：`pnpm --dir backend exec tsx ../orchestrator/process/verify-t896-video-layout-fallback.mts`，
  输出 1080×1920 / 30fps / 3.03 秒，两个素材段均保持 `pip_bottom_left`，不再产生 hidden fallback。
- focused tests：AI 提示 15/15、前端组装与审计 20/20、后端模板与公共执行链 105/105；三端
  TypeScript 检查均通过。
