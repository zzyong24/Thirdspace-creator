# 调研归档:开源 agent 引擎盘点 + 视频渲染器选型(2026-07-11)

> 支撑 [execution-layer-video-pipeline SPEC](../superpowers/specs/2026-07-11-execution-layer-video-pipeline-design.md) 的完整调研底稿。结论已进 SPEC;本文保留过程证据,免得将来重查。

## 一、开源 agent 引擎盘点(T-255 调研,2026-07 联网核实)

| 引擎 | 许可 | 形态 | 嵌入方式 | 模型自由度 | 判断 |
|---|---|---|---|---|---|
| **Pi**(earendil-works/pi,原 badlogic/pi-mono) | MIT | **agent 骨架库**(统一 LLM API+loop+默认4工具 read/write/edit/bash+会话管理),作者 Mario Zechner(libgdx) | **TS 库直接 import 进 sidecar,零子进程** | 任意 provider | **B 案并列首选**。最契合脑手分离(工具白名单/确认门全由我方代码控);风险:0.74.x 未到 1.0、弱模型实测缺数据 |
| **OpenCode**(sst/opencode) | MIT | 成品 coding agent,官方 @opencode-ai/sdk | Node 进程内 createOpencodeServer+Client | 75+ provider,任意 OpenAI-compatible 直配 MiniMax | **B 案并列首选**。社区最大(160k★)实战多;比 Pi 重(嵌整个产品) |
| goose(block/goose) | Apache-2.0 | Rust 单二进制 CLI | spawn 子进程 + stream-json | 多 provider;官方明示吃 tool-calling 质量 | 次选 |
| OpenHands SDK | MIT | Python SDK | 跨语言(需 Python 运行时) | 多 provider | 栈不合,不选 |
| Claude Agent SDK | 非 OSS | Claude Code 内核(工具/权限/subagent/MCP 全内置) | npm SDK | 绑 Anthropic 协议(MiniMax 走 api.minimax.io/anthropic 兼容口) | 黑盒+本仓已有死链教训(orchestrator/drainQueue 遗产),不选 |
| Codex SDK | — | Codex CLI 嵌入形态 | — | **仅 OpenAI Responses API** | MiniMax 不兼容,直接出局 |

**三案定夺**(用户拍板 A→B 演进式):
- A 案=确定性 executor(弱模型下最稳,本产品既有纪律)——先行
- B 案=开源引擎 executor——接口按其形状建,真需 agent 循环时 **Pi vs OpenCode 同一真任务 MiniMax 驱动实测二选一**(T-255b)
- C 案=整壳迁移——**否决**(壁垒[领域数据+工作流+确认门]流失、工程最大、体验不升)

**层级认知**(防混淆):Vercel AI SDK=调模型的库(本产品大脑现役,之上是自研 harness:chat-runner+工具门 T-239a+历史窗口 T-239d+重试 T-239b+场景 T-240);Pi=造 agent 的骨架;Claude Agent SDK/Codex=成品。**大脑继续自研 harness(壁垒),手用骨架(受控执行)。**

## 二、视频渲染器选型(T-254 调研)

- **Remotion:license 地雷**。source-available 商业协议(非 OSS):公司规模阈值触发付费席位+云渲染 per-render 条款;分发商业桌面产品大概率落入范围。**不进依赖**(用户拍板弃)。
- **HyperFrames**(HeyGen 开源,Apache 2.0):HTML-native 渲染(GSAP 时间线+puppeteer 帧捕获),**复用 sidecar 已打包 playwright Chromium**,依赖增量几十 MB。用户本人已实测迁移过(/Users/zyongzhu/Creative/e03-opendesign-hf 的 build_hf.py 注明「弃 Remotion」)——**选定 v1 渲染器**。
- 「模板+JSON props」形态被用户真实项目双验证(e03-opendesign ProofBoard.tsx+data.ts;e03-opendesign-hf 同数据驱动)。props schema 渲染器无关,将来可换。

## 三、业界架构对照(「这种架构主流吗」)

垂类 agent 主流打法与本产品逐项对应:结构化决策 JSON(12-Factor Agents:own your control flow)/确认门(human-in-the-loop 标配)/沙箱执行+产物收割(Code Interpreter/E2B 同形)/脑手分离(planner-executor)/场景化工具白名单(最小权限)。头部垂类(Harvey/Sierra/Glean)无一家套通用壳。差异化:桌面+本地数据+用户自配模型(更难打包,换数据主权)。

## 四、Claude Code 源码蒸馏(T-239 调研,已全部落地)

抄的 6 项:错误恢复(wrapLanguageModel 中间件,doStream reject=流前失败边界,SDK maxRetries:0 防倍乘)/历史窗口化(tool-result 清体+chars/3 估算+80% 边距)/abort 贯通+consumeSseStream/统一工具门(错误信封+结果预算)/用量可见/regenerate 幂等。**不抄的 7 项**(形态不合):终端渲染/permission prompt/JSONL 存储/autocompact 全家桶/多云 auth/subagent/缓存技巧。
