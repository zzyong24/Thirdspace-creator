# T-800 跨主题真实链路评测

这不是手写 `visualPlan` 的演示。三个主题都通过 CreatorOS 当前账号的真实
`video.cards` Effective Skill snapshot、设置中的 MiniMax-M3、`decideCards` 诚实门、
正式 `assembleVideoRenderProps` 和正式 HTML/GSAP 渲染器生成。

## 结果

| 主题 | 模型实际选择 | 语义覆盖 | 横竖渲染 | 等效于已验收样片 |
| --- | --- | --- | --- | --- |
| 内容创作 | contrast + sequence | 基本覆盖，但反差仍是两个框 | 可输出；9.2s 运动标记碰字 | 否 |
| 个人成长 | sequence | 漏掉“刷手机→专注更差”和“加任务→移走干扰” | 可输出；9.2s 运动标记碰字；前 8 秒无主视觉 | 否 |
| 产品认知 | plain quote + sequence | 漏掉“功能清单退出、问题解决接管”的 replacement | 可输出；9.2s 运动标记碰字；前 4 秒无主视觉 | 否 |

结论：当前链路能真实运行，所有上屏文案与 `visualPlan.parts` 也通过原文溯源；但不能承诺
“换任意主题都跑出同等效果”。跨题主要有三处缺口：

1. `video.cards v3` 的场景化示例过度围绕“输入纸卷 / 机器 / 候选 loop / 说明书”，
   对习惯和产品主题的关键关系召回不足。
2. `sequence` 渲染配方固定使用“纸张候选沿回路跑”，即使步骤语义正确，也不一定是当前主题
   最恰当的可见对象。
3. 既有文字安全测试只覆盖固定短文案；真实模型返回较长第三步时，`scene-runner` 会在
   9.2 秒侵入文字。六个横竖样片共复现 6 次。

这轮按用户要求只做诊断，不把补丁混进系统。下一轮应先让 Skill 产出“关系 + 主题对象/状态变化
提示”（不写死业务词表），再让渲染器从多个通用运动语法执行，并把真实模型长文本纳入碰撞门。

## 产物

- 模型原始候选与汇总：`model-decisions.json`、`*.decisions.json`
- 横竖实际成片：`*.portrait.mp4`、`*.landscape.mp4`
- 六格关键帧：`*.contact-sheet.jpg`
- 逐帧边界与碰撞审计：`render-audit.json`
- 可复跑脚本：`orchestrator/process/t800-cross-theme-motion-eval.ts`
- 可复跑视觉门：`orchestrator/process/verify-t800-cross-theme-motion.mjs`
