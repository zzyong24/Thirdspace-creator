# T-910 CreatorOS CLI Skill 改前基线

- 日期：2026-08-24
- 范围：只读压力场景；未修改真实 CreatorOS 数据，未提交转写任务。
- 输入：要求新 Agent 仅依据改前 `creatoros-cli` Skill，设计“新增抖音博主 → 获取该博主全部作品标题与完整逐字稿 → 单条补跑 → 找出缺稿作品逐条补跑”的完整 CLI 流程。

## RED 结果

改前 Skill 只能让 Agent 知道要动态运行 `operations list/describe`，但无法稳定落到内容雷达的真实操作面。基线 Agent 明确报告以下缺口：

1. 不知道 `intelligence.sources.previewProfile/create/list`、`intelligence.runs.start`、`intelligence.items.list/get`、`intelligence.transcripts.enqueue` 的真实职责与组合顺序。
2. 不知道完整逐字稿应以 `transcript.status=done` 且 `transcript.text` 非空为准。
3. 不知道 `not_extracted`、`processing`、`extracted`、`attention` 与逐项补跑的安全边界，容易把运行中或失败项混进首次补跑。
4. 不知道博主新增后“对象已创建”不等于“首轮作品已采集”，也不知道应等待同一 task 并回读 source/run/items。
5. 无法从改前 Skill 确认列表的页码、页大小、总数和全量终止条件，只能给抽象分页建议，不能证明“全部作品”。
6. 不知道 `enqueue` 已支持单个 `itemId`，以及用户要求逐条时应每条使用独立稳定幂等键并完成“写前重读 → 提交 → 等待 → 写后回读”。

因此基线判定为 RED：底层 operation 已存在，但改前 Skill 不足以让新 Agent 可重复、无猜测地完成用户指定的内容雷达闭环。

## GREEN / REFACTOR 复测

新增 `references/content-radar.md` 并接入 Skill 后，同一 Agent 在相同场景中能够准确给出真实 operation 顺序、`meta.total` 全量终止条件、`done + text.trim() 非空` 完整正文判定、四类 transcript 状态、逐条独立幂等键、同 task 等待和写后回读，判定 GREEN。

针对首轮 GREEN 提出的高风险歧义又补充了：`externalKey` 映射、`runs.list/get`、active run 排除、`manual/retry` 选择、`skipped` 原因、失败后新重试意图键、空标题和“只含当前可见集合”的全量边界。第二轮复测判定 PASS，未发现会导致重复任务、误称全量或误判完整逐字稿的阻断问题。
