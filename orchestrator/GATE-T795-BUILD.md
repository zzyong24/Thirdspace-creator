# T-795 BUILD Gate — 用户封面画面要求贯穿生成链

日期：2026-08-12

状态：PASS（内部工具参数、封面 Skill、任务分派与最终生图 prompt；未调用用户真实生图模型）

## 用户结果

用户现在可以在项目编导对话中直接说：

> 生成封面，画面里要有一把剪刀切断混乱流程，人物在右侧，不要电脑。

`cover.generate` 会把这句话中的画面要求写入独立 `visualRequirements` 参数。该参数会进入
`cover.brief v3` 和最终 image prompt；不是只留在聊天上下文里，也不会被当成数字、成绩或事实出处。

## TDD 与验证

RED：

- `cover-brief.test.ts` 证明旧模板仍为 v2，缺少用户画面要求占位和优先级说明。
- `chat-tools.test.ts` 证明工具执行会丢掉 `visualRequirements`。
- `cover-runner.test.ts` 证明封面策划 facets、最终生图 prompt 和候选诊断均收不到该要求。

GREEN：

```text
ai-worker focused: 1 file / 1 test PASS
backend cover chain: 3 files / 346 tests PASS
backend settings/effective Skill: 2 files / 21 tests PASS
frontend settings: 2 files / 26 tests PASS
frontend affected: 2 files / 21 tests PASS
ai-worker full: 48 files / 356 tests PASS
ai-worker / backend / frontend / contract typecheck: PASS
boundary scan: 0 new violations (5 baseline)
semantic boundary: PASS
orphan scan: 0 errors (100 existing warnings)
```

全量 backend 首次并发运行出现 17 个与本次无关的 ingestion/intelligence PGlite 测试 5 秒超时；
将这 3 个文件单 worker 重跑后 `75/75 PASS`。因此记录为并发环境拥塞，不把首次全量命令冒充全绿。

## 兼容与边界

- 留空、空格或旧调用不传字段时，不追加用户约束块，旧封面路径不变。
- 工具与 runner 双层 trim，并将输入有界裁到 1200 字。
- 用户要求优先于自动主视觉与构图建议，但不能覆盖事实、版权、安全和封面文案诚实门。
- 设置页与运行时继续读取同一官方 `cover.brief` 注册表；用户已有自定义 Skill 覆盖会保留。
- 即使旧自定义模板没有 `{{userVisualRequirements}}`，最终生图 prompt 仍会确定性追加要求，避免失效。
- 不新增页面、数据库、provider 或第二套封面生成器；资产仍为 pending 候选，用户采纳后才绑定项目。

## 诚实边界

本 Gate 证明参数贯穿和提示词装配工作，未调用用户实际配置的图片模型，因此不声称已经验证某个
provider 对复杂中文构图要求的遵循度。实际效果仍受图片模型能力影响，可基于真实结果继续做下一轮评估。
