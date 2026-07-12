# SPEC 审核记录:controlled-agentic-runtime(T-256,吸收升级 T-255b)

- **裁决**:⚠️ CONCERNS(cross-family MiniMax gate)→ 7 findings 全内联处置 → 可开工(待用户审 SPEC)
- **summary(原文)**:脑手分离/受控自主循环骨架成立,复用锚全部代码坐实(6+ 点抽查零断链),合垂类定位、守住封号纪律与确认门壁垒;两处 major 需开工前补(引擎循环 vs 铁律1/4、T-256a 重造风险),均可闭合故 CONCERNS 非 FAIL。
- **合定位**:守住四壁垒(对话循环不外包/引擎自由限推理/raw browser-shell 不暴露/副作用只经端口+确认门/判定规则挡"什么都塞 agent"),正面回应"滑向通用电脑 agent"风险。

## findings 处置(7 条全内联)
- **[major-M1] §6/§9 引擎循环 vs 宪法铁律1/4** → 新增 §6.1:引擎每步推理回接 model-config(选可配 OpenAI-compatible endpoint 的引擎指向 modelFor 解析,无法回接→淘汰);铁律4 只约束"产物入库那一跳",循环内中间推理显式豁免(不落库);Pi/OpenCode 非 Claude Agent SDK,铁律1 不违背。
- **[major-M2] §1/§6 弱模型循环反转前 SPEC 结论、缺兜底** → T-256d 加"达标线+不达标退回 material.gather 结构化多发"分支,不强行必选。
- **[major-M3] §5 目录列举已 T-253 交付非"雏形"** → T-256a 收窄为仅工具探测+工作区感知,目录列举显式标"复用 chat-tools.ts:762 不新建"。
- **[minor-m1]** 判定规则做成建任务时真 gate(classifyLoopType,不匹配拒建),非纯文档。
- **[minor-m2]** 干跑形态分类:发布/删除强制,搜索/抓取默认不强制。
- **[minor-m3]** denylist 复用现有两份之一不引第三份,"统一 denylist"列随手项。
- **[minor-m4]** 落 BACKLOG 时 T-255b 标"已并入 T-256b/d"。

## 复用抽查(reviewer 坐实,全命中)
SURFACE_TOOL_SCOPES chat-tools.ts:2865 · defineChatTool chat-tool-gate.ts · T-255a executor-registry+run-execution-task.ts:70-96(超时+abort三腿+awaiting_confirmation)· denylist execution/sensitive-files.ts + ai-runtime/local-read-security.ts:17-46(两份,minor-m3)· local.read listing chat-tools.ts:762 · web 搜索+分窗 chat-tools.ts:90/:1982 · material.gather 单发 :1918 · T-207 sweep 在。
- 日期 2026-07-12
