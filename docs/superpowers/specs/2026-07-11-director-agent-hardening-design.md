# SPEC:编导智能体商用级加固 —— 蒸馏 Claude Code 源码工程实践(错误恢复/上下文/中断/工具门/用量)

> 日期 2026-07-11 · 状态:⚠️ **CONCERNS→已处置→可开工 T-239a~g**(MiniMax gate:1 major=S4 缺不造轮子节 + 1 minor=token 估算误差,已内联;见 .review.md) · 对照宪法 [docs/产品定位.md](../../产品定位.md)
> 单一执行总账在 [BACKLOG.md](../../../BACKLOG.md)(T-239)。来源:用户诉求「让编导更好用更稳定、真正能商用」+ Claude Code 源码(/Users/zyongzhu/Workbase/claude-code-source,codegraph 已索引)蒸馏报告(T-239 调研,8 维度双侧 file:line 核实)。

## 0. 一句话

不换栈(仍 Vercel AI SDK),把 Claude Code 经过商用锤炼的**调用管道工程**装进编导:错误自动恢复(重试/退避/fallback)、对话历史窗口化(治长会话必崩必贵)、中断真一致(停止真的停)、33 工具统一门(错误信封/审计/预算)、用量可见(商用信任)。**全部落在现有栈内,无架构迁移。**

## 1. 问题(现状不够,全部已核实 file:line)

- **崩(商用阻塞)**:anthropic-adapter `maxRetries:1`(llm/anthropic-adapter.ts:37),无退避/无错误分类/无 fallback 模型;流中断=本轮作废靠用户手点重试。MiniMax cancelled 曾整轮崩(记忆实锤)。对照 CC:10 次重试指数退避+jitter+honor retry-after+529 级联换 fallback(withRetry.ts:170-548),顶层 catch 永不裸抛(query.ts:955-997)。
- **长会话必崩必贵(商用阻塞)**:前端全量 UIMessage[] 每轮全发,chat-runner.ts:1060 全量喂含历史所有 tool-result parts(单个 artifact.text 8000 字符),无 token 估算无压缩无 413 恢复。对照 CC:多级防线(tool-result 预算→microcompact→autocompact→reactive compact,query.ts:379-453)。
- **停止名不副实(体验偏阻塞)**:route 未把 `req.signal` 传 streamText(chat-runner.ts:1061-1087 无 abortSignal,已核实)——用户点停止后服务端照跑所有工具(烧钱+副作用工具照跑);中断轮 assistant 文本不落库(onFinish 才写),刷新丢半轮。
- **33 工具遇错体验抽奖(体验)**:部分工具 execute 内 catch 转人话 `{error}`,部分直接裸抛给 SDK——错误形态不一;无统一审计/成本归因/结果预算强制。对照 CC:buildTool 单接口分离 schema/权限/渲染/截断,fail-closed 默认(Tool.ts:362-792)。
- **零用量追踪(商用信任)**:chat-runner/route 无任何 usage 捕获(grep 核实)。用户自带 key,「这次对话花了多少」商用必答。对照 CC:per-request usage 累计+session 成本+预算硬停(cost-tracker.ts:250-323)。
- **regenerate 重复落 user 消息(真 bug)**:route.ts:157-158 每请求 createMessage 无去重,重试轮写重复行(已核实无去重路径)。
- **stepCountIs(5) 静默腰斩**:多工具长任务第 5 步后模型没机会总结收尾(chat-runner.ts:1081)。

## 2. 设计(7 切片,全在现有 Vercel AI SDK 栈内)

> **复用/参照锚**:CC 源码 QueryEngine.ts:184-1177(loop 状态机)/query.ts:241-1729(turn 循环+typed 终止)/withRetry.ts:170-548(重试退避)/Tool.ts:362-792(工具接口)/microCompact.ts:37-50(tool-result 清体)/cost-tracker.ts:250-323(用量)。CreatorOS 触点:chat-runner.ts、chat-tools.ts(33 工具)、frontend/src/app/api/chat/route.ts、llm/anthropic-adapter.ts、model-config(fallback 可配)、ai_messages(usage 列)。

### S1 错误恢复层(治「崩」)
- 请求重试:错误分类(可重试 5xx/429/网络断 vs 不可重试 4xx/内容审核)+ 指数退避(500ms×2^n 封顶 32s + jitter)+ honor retry-after;adapter maxRetries 3-4 且可配。
- **fallback 模型走 model-config 用户可配**(项目铁律:模型不写死)——主模型连续失败→换用户配的 fallback spec 流开始前重试一次。
- 终止原因 typed 打点落日志(completed/aborted/retry_exhausted/…),可观测。

### S2 中断真一致(治「停不掉/丢半轮」)
- `streamText({ abortSignal: req.signal })` 贯通;onAbort 把已产出部分文本+已完成 tool parts 落库(与 T-128 同存储);长操作工具(截图/web.read)execute 接受 signal 提前退出。

### S3 对话历史窗口化(治「长会话必崩必贵」)
- **借力现成语义**:honesty 规则 6 已声明「context.* 结果用户已在卡上看到,模型只有指针权」(chat-runner.ts:479)——正是 microcompact 的语义前提。喂模型前投影(不动存储):N 轮之前的 tool-result part 内容替换为 `[结果已展示,需重读请再调工具]`(CC TOOL_RESULT_CLEARED_MESSAGE 同款)。
- 粗 token 估算(chars/3)超阈值→保近 K 轮+更早历史截窗。**[gate-F2] 估算误差交代**:chars/3 对中文偏保守(中文 1 字≈1-2 token),属工程近似;阈值取模型有效窗口的 **80%** 作缓冲边距抵消误差,超缓冲即截窗,绝不贴边。**不抄 CC 的 LLM autocompact 全家桶**(那是塞代码库的 CLI 需要的;对话产品「窗口化+卡片作外部记忆」够)。

### S4 统一工具门 defineChatTool(治「33 工具抽奖」= CreatorOS 的 hook 层)
- **[gate-F1] 不造轮子核实**:①仓内——T-239 调研已 grep 核实 chat-tools.ts 33 工具错误处理**分散无统一门**(screenshot/web.read/generate 等 execute 内 catch 转 `{error}` 人话,topic/script/diagnose 等裸抛给 SDK;无统一审计/预算层),确无现成抽象;②OSS——Vercel AI SDK 的 `tool()` 本身无 error-envelope/审计中间层(官方模式即由调用方 wrap execute),LangChain 类框架的 tool wrapper 绑定其运行时不适配本栈;故结论=**在 tool() 之上薄包一层是官方推荐形态,非重造**(与 CC buildTool 思想同源,但实现只有几十行包装函数)。
- 包装器:统一 try/catch→`{kind, error}` 信封+humanizeError、结果字符预算强制、审计打点(工具名/耗时/成败/usage 归因挂点)。33 工具机械迁移。
- **候选卡确认门保留不动**(铁律②的正确形态,比 CC 终端 permission prompt 更适合桌面产品)。

### S5 用量可见(商用信任)
- streamText onFinish `totalUsage` 落 ai_messages 新列(input/output/cache tokens+modelId,一条轻迁移);价格表随 model-config 用户可配(自带 key 价格因人异,不写死);会话角标「本会话累计 tokens/估算费用」。

### S6 regenerate 幂等 + 步数收尾
- user 消息去重(重试轮不重复落);stepCountIs 改「步数上限+最后一步禁工具强制收尾」(AI SDK prepareStep),多工具任务不再静默腰斩。

### S7(可选)长任务完成回填对话通知卡
- ai_tasks 完成→conversation 内 system 卡轻量通知(拆片/批量归因跑完主动告知,不靠用户轮询)。**不抄 CC subagent 体系**(ai_tasks dispatch 范式已对)。

## 3. 边界(不抄什么,防走样)

- 不抄:Ink 终端渲染/renderToolUse 协议(卡片体系更好)、终端 permission prompt(确认门已对)、JSONL transcript(DB 更强)、LLM autocompact 全家桶(轻方案够)、多云 auth/529 容量级联(自带 key 无关)、fork subagent/worktree(无 CLI 多代理场景)、prompt-cache 字节技巧(缓存由 provider 管)。
- 模型/价格全部 model-config 用户可配,绝不写死(项目铁律)。
- S3 投影不动存储(ai_messages 原样全量,只改喂模型的视图)——可回滚、不丢数据。

## 4. 切片(拆 Task;依赖:S4 先行给 S1/S5 统一挂点,余各片独立)

- **T-239a** S4 defineChatTool 统一门(信封/审计/预算,33 工具迁移)
- **T-239b** S1 错误恢复层(分类重试/退避/fallback 可配/typed 终止)
- **T-239c** S2 中断真一致(abortSignal 贯通+部分产出落库+长工具可中断)
- **T-239d** S3 历史窗口化(tool-result 清体+token 估算截窗,投影不动存储)
- **T-239e** S5 用量可见(usage 落库+价格可配+会话成本角标)
- **T-239f** S6 regenerate 幂等+步数收尾
- **T-239g**(可选)S7 长任务对话通知卡

## 5. 验收

- 拔 key/断网/流中杀 provider:自动重试退避,fallback(若配)接管,会话不崩可继续;终止原因日志可查。
- 点「停止」:服务端 1s 内停止工具执行,已产出文本刷新后仍在。
- 50+ 轮长会话:喂模型的 tokens 有上界(日志可查投影后大小),不再线性膨胀,不撞 prompt too long。
- 任一工具抛错:统一人话错误卡,格式一致;审计日志有工具名/耗时/成败。
- 会话角标显示累计 tokens/费用;regenerate 不产重复 user 行。
- 三端 typecheck+单测绿;AI 行为改动重启后真机复测(纪律)。
