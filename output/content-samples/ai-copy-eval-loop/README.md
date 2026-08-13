# T-796 验收入口

本目录是一套同题内容小样，只验证当前内容 Skill 的协同产出，不修改产品功能。

- 脚本：`script-and-visual-plan.md`、`script-draft-output.json`
- 实际配图：`broll-evaluation-loop-v1.png`
- v2 可播放动效：`motion-preview.html`
- v2 轻量预览：`motion-preview.mp4`
- v3 场景化动效：`motion-preview-v3.html`、`motion-preview-v3.mp4`
- v3 三幕关键帧：`motion-v3-contact-sheet.jpg`
- v4 竖屏重排：`motion-preview-v4-portrait.html`、`motion-preview-v4-portrait.mp4`、`motion-v4-portrait-contact-sheet.jpg`
- v4 横屏实测：`motion-preview-v4-landscape.html`、`motion-preview-v4-landscape.mp4`、`motion-v4-landscape-contact-sheet.jpg`
- v2 → v3 评分：`../../../ai-worker/evals/motion-card/2026-08-12-scene-motion-iteration-results.md`
- 三个关键帧：`motion-frame-cause.png`、`motion-frame-loop.png`、`motion-frame-reframe.png`

已验证：结构化脚本共 8 镜；配图是 9:16 实际模型产物；动效画布为 1080×1920，包含 `cause_effect`、`sequence`、`replacement` 三种内容关系。v3 不再使用三个同权圆角框加连线：因果改为纸卷—机器—同质输出，步骤改为单张候选稿沿校准回路运动，替换改为旧说明书退出后新假设接管。

v4 根据实看反馈修正验收盲区：虚线网格从“代码存在但看不见”改为实际可见；无人物视觉专场不再沿用真人避让坐标，竖屏主舞台上移到画面中部；横屏不是几何测试，而是另行输出 1920×1080 实际成片，并把主物件按横屏放大。横竖两版均经 HyperFrames lint 0/0、2.8s / 7.8s / 12.8s 三点布局 0 issue。
