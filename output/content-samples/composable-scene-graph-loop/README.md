# T-802 可组合 Scene Graph 动效 Loop

这组样片验证的不是一套固定模板，而是 CreatorOS 正式 `video.cards@v4` Skill 生成受限 Scene Graph，
再由同一套 HyperFrames/GSAP renderer 编译。模型负责按内容选择对象、构图和状态变化；代码只负责协议、
原文溯源、双画幅重排、安全检查和兼容降级。

## 结果

- T-803 按用户实看反馈重做了比例：横屏使用宽构图，竖屏不再整体缩放，而是按上下层级重新排版。
- 6 个主题的实测视觉联合宽度为主舞台的 64.9%–98.1%，高度为 53.4%–84.0%；最大单体面积不低于 9.1%。
- 放大没有用遮挡换占比：计划态主体间最大相交比例为 12.6%，低于 18% 硬门；24fps 全输出帧仍是 0 文字碰撞、0 越界、0 降级。

- 冻结 6 个跨主题案例，每题 2 个候选；首轮 11/12 个候选通过结构门，1 个 MiniMax 候选经 5 次协议返修仍失败，诚实记为硬失败。
- 独立 Codex judge 与 MiniMax 生成模型隔离。首轮内容评分发现 `customer-evidence` 胜者虽有 83 分，
  但非套版感仅 9/15；自动把这条反馈回灌同一 Skill 再生成 2 个候选，复判后晋级到 93 分、13/15。
- 六个最终胜者为 87、89、91、89、91、93 分；非套版感分别为 12、13、14、14、14、13，全部达到验收线。
- 从实际 DOM 与 GSAP 轨迹计算的对象/构图/运动三轴完整指纹，6/6 唯一，唯一率 100%。
- 6 个主题 × 横竖屏共 12 条真实 MP4。按 24fps 检查 12 秒内每一个输出帧，合计 3456 个画面时点：
  0 文字/物件碰撞、0 越界、0 页面异常、0 Scene Graph 降级。
- 设置页没有复制另一份提示词：它继续读取运行时 official registry，聚焦测试锁定为同一个 `video.cards@v4` 正文；已有账号 overlay 和恢复默认规则不变。

## 总览

- [横屏六主题总览](./landscape-midpoint-contact-sheet.jpg)
- [竖屏六主题总览](./portrait-midpoint-contact-sheet.jpg)
- [横屏四时点分镜](./meeting-overload.landscape.storyboard.jpg)
- [竖屏四时点分镜](./meeting-overload.portrait.storyboard.jpg)
- [独立评分](./judge-results.json)
- [第二轮薄弱题评分](./customer-loop-round-2-judge.json)
- [逐帧审计与实际轨迹指纹](./render-audit.json)
- [候选生成记录](./candidates.json)

## 真实样片

| 主题 | 横屏 | 竖屏 | 最终分 |
| --- | --- | --- | ---: |
| 功能越多不等于产品越好 | [横屏](./feature-overload.landscape.mp4) | [竖屏](./feature-overload.portrait.mp4) | 87 |
| 通知挤压睡眠 | [横屏](./sleep-notifications.landscape.mp4) | [竖屏](./sleep-notifications.portrait.mp4) | 89 |
| 素材多但发布少 | [横屏](./material-bottleneck.landscape.mp4) | [竖屏](./material-bottleneck.portrait.mp4) | 91 |
| 同步信息不等于做决定 | [横屏](./meeting-overload.landscape.mp4) | [竖屏](./meeting-overload.portrait.mp4) | 89 |
| 保存记录不等于理解 | [横屏](./archive-understanding.landscape.mp4) | [竖屏](./archive-understanding.portrait.mp4) | 91 |
| 客户喜欢不等于购买 | [横屏](./customer-evidence.landscape.mp4) | [竖屏](./customer-evidence.portrait.mp4) | 93 |

## 可复验

```bash
# 生成候选时显式传入临时凭据；脚本不会写入密钥
T802_GENERATOR=minimax MINIMAX_API_KEY='***' \
  backend/node_modules/.bin/tsx orchestrator/process/t802-scene-graph-loop.ts

# 使用独立评审产生的 winner-map 重建正式 HTML
backend/node_modules/.bin/tsx orchestrator/process/t802-scene-graph-loop.ts --render-only

# 按 24fps 全输出帧检查，并从实际 DOM/GSAP 计算三轴指纹
node orchestrator/process/verify-t802-scene-graph.mjs

# 渲染 12 条真实 MP4
node orchestrator/process/render-t802-samples.mjs
```

本轮没有把 API Key 写进项目、样片或报告。生成链使用同一个官方 Skill、`decideCards` 协议校验和
MiniMax provider；由于仓库现存 T-332 迁移门阻止读取旧的无 scope 本地行，本次评测显式使用同正文的
official Skill 快照，不把该既有数据库漂移伪装成本任务结果。
