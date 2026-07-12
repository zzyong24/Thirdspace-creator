# 开源许可收录(gate-F1 minor 处置)

> SPEC 2026-07-11 execution-layer-video-pipeline §5:MIT/Apache-2.0 依赖集成时须在
> app「关于/开源许可」页收录 LICENSE+NOTICE 全文(桌面产品惯例)。
> 当前 frontend **尚无「关于/开源许可」页** —— 本目录先做归档单一真值,页面落地时
> (T-255b 或 UI 切片)从这里取全文渲染。TODO 锚点:`backend/src/modules/execution/video-render/executor.ts` 头注释。

| 依赖 | 许可 | 引入切片 | 全文 |
|---|---|---|---|
| HyperFrames(npm `hyperframes`,HeyGen 开源,视频渲染引擎 CLI) | Apache-2.0 | T-254a | [hyperframes-LICENSE-Apache-2.0.txt](./hyperframes-LICENSE-Apache-2.0.txt) |
| GSAP(npm `gsap`,合成模板时间线动画) | 标准 GSAP 许可(免费 tier,详见 gsap.com/licensing) | T-254a | 上游 `node_modules/gsap/LICENSE` |

注:HyperFrames 上游仓(2026-07 时点)无 NOTICE 文件,故仅收录 LICENSE;T-255b 若集成
OpenCode/goose 等引擎,在此追加行 + 全文。
