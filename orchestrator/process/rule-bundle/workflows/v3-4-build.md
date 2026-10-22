# v3 · Stage 4 — BUILD

## 目标

按用户可感知的垂直切片交付真实能力。每片是 `BACKLOG.md` 一个任务，在同一片内闭合读、写、可见反馈和验收；不允许“写真读假”或用文档增长冒充进度。

## 上下文入口

开工运行 `context-plan.mjs --task <T-ID>`，按 `read_root` 读取 `required_reads`，按项目根读取 `required_project_reads`，再读任务 SPEC 和相关代码。仅派发、并行或自治执行使用 `context-compile.mjs <T-ID>` 生成 Task Packet；交互式单人任务不生成包。发现具体依赖时扩展读取，不全局扫读未激活规则。

用已有任务事实确定五问落位：谁拥有；前端/后端/数据/宿主边界；Create / Modify / Test 文件；不应触碰的目录；最小验证。答案只服务当前任务，不新增 Spec、台账或审批。命名服从项目技术栈；同一概念在 Spec/API/UI 尽量同名。注释解释为什么、不变量和兼容陷阱，不复述代码。

动笔前应用已加载的 `rules/global-rules.md` 最小实现阶梯；选定可满足验收的方案后继续实现，不把逐级评估变成额外研究阶段。

## 每片 DoD

1. 对齐已确认 FR/FLOW、数据路径与操作签名；方向、范围、公共契约或数据归属改变先走变更。
2. 缺陷、核心业务、parser、数据/安全边界先做预期失败的 RED，再写最小实现到 GREEN。探索性 UI、纯样式、文档或无可执行行为的配置不制造失败测试，改用视觉、类型、语法或 smoke；交互行为仍需测试。
3. GREEN 后仅在已触及代码有明确收益时做行为不变整理：去重、改名、缩小职责、收紧类型、删除临时兼容/死代码；有实际修改才重跑聚焦验证；未修改不重复运行。加功能、改交互/公共接口/schema/数据归属或扩大 write_set 不是重构，另开任务。
4. 走真实集成路径；UI pack 激活时验证 intent → outcome、写后读、空态/错误、返回/刷新及最小视口。薄 fixture 不得冒充真实 witness。
5. 运行项目或 Packet 的 focused + required verification，回写受影响真相源，用真实 commit/evidence 完成任务。

首片前必须有可运行的绿基线。不确定性断路器只在 Research Gate 触发时暂停当前片，其他可就绪任务继续。

## 门与证据

> **检查：** 必过 `gates/13-tdd-gate.md`；UI pack 激活时加 `09` / `10`，mock 存在时加 `08`，Research Gate 打开时加 `04`；跨片用 `consistency-gates.md`。

PASS 需当前 commit、命令输出、适用时的红→绿证据和真实路径 witness。骨架见 [`_COMMON.md`](_COMMON.md)。全部切片关闭后进入 SHIP。
