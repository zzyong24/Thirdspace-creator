# T-1201 独立 SPEC 只读评审

日期：2026-10-10。评审范围：`docs/features/t1201-knowledge-graph-error-contract.md`；仅只读核对产品、测试、实际第一次回归日志。未修改仓库、Git、任务或产品；未运行会产生仓库文件的测试命令。

结论：**PASS（测试合同校准方案成立；不是实现/测试绿灯）**。

评审 SPEC SHA256：`e9b1c533488f3600dbb809114dbb0e2ceb347dcdc8fda0af992b7a1338c2c1b4`。

## 事实与根因

1. 第一次实际日志 `knowledge-regressions-first.log` 第239–240行记录19文件148例，147通过、1失败。失败断言是寻找原串 `无可用 LLM 凭据`；日志第143–146行的实际 `knowledge-graph-error` / `role=alert` 面板已渲染完整 `还没有可用的 AI 模型。完成设置后，回到这里即可继续。`。日志的3次失败来自同一用例重试，不是3个不同故障，不重写历史为通过。
2. `knowledge-graph-view.tsx:331` 使用 `fetchCreatorApi('/api/knowledge/relate', {method:'POST'})`。非成功或候选无效响应抛出接口 `error`，在第349行经过既有 `describeUserError`，不是裸渲染 API 错误。错误面板第498–505行直接显示转译结果。
3. `ai-error-humanize.ts:90–93` 的 `model_not_configured` 规则明确匹配 `无可用 LLM 凭据`，输出上述完整确切人话。`describeUserError` 优先调用该规则；后续兜底透传逻辑不会越过已经命中的模型规则。现有独立 `ai-error-humanize.test.ts:270–272` 也精确断言该原串映射到同一句文案。
4. `api/knowledge/relate/route.ts` 鉴权后只读知识清单、调用模型产候选；失败响应 `{error:message}` / HTTP400，符合现有fixture。本路由未调用关系落库；前端的 `createKnowledgeRelation` 与 `router.refresh` 只在用户采纳后的另一处理器中发生。`fetchCreatorApi` 是单次 `fetch` 包装，没有重试实现。
5. 评审时 `git diff HEAD --` 对图谱产品、错误适配、HTTP包装和该测试文件均为空，证明这些文件在当前工作树与HEAD相同；测试仍保持原始400缺模型fixture和陈旧原串断言。本轮未改这些产品文件的描述与当前证据一致；本检查不宣称对本轮全部产品文件或历史提交做了审计。

## 方案成立条件

仅修改 `frontend/src/features/knowledge/knowledge-graph-view.test.tsx` 该请求失败用例即可成立：

- 保留 `ok:false`、`status:400`、`error:'无可用 LLM 凭据'`，继续实际点击 `AI 找关联` 并等待内联错误面板。
- 对错误面板精确断言完整人话，不只检查存在、泛化片段或任意alert；同时明确原始凭据术语不在面板中。推荐直接断言面板 `textContent` 与完整文案相等。
- 在错误面板完成渲染后断言 `fetchMock` 正好调用1次、`createKnowledgeRelation` 从未调用、`mockRouter.refresh` 从未调用。已有每例清空这3个mock，断言不受其他用例污染。
- 保留图谱其他成功/空候选/采纳/删边用例；修改后实际重跑图谱全套和知识全套，保留真实红/绿结果，不能用本评审替代执行。

这不是为洗绿删除错误边界：原来的失败输入、错误面板存在性保留，展示合同改为独立错误适配已定义且实际日志已显示的行为，另增加了调用与副作用边界。无需改API响应、错误转译或产品行为。

无需修正 SPEC 的确定性阻断项。`未调用 createKnowledgeRelation` 是组件单测中的落库调用边界，不能单独冒称真实数据库未写的集成证据。范围不扩展到其他图谱权限/模型质量/大图展示问题。

## 本次读取对象 SHA256

| 对象 | SHA256 |
| --- | --- |
| knowledge-graph-view.tsx | `3662fd5f13dd4a0318877d0cf1cbce8968b1f42558c4d0d9ca7e798c96a3407c` |
| ai-error-humanize.ts | `4fe33a5e977424aa07e6e4292993986e9d9b09f94bd0abbdfa0121e953b9bebb` |
| ai-error-humanize.test.ts | `a29982c0ffec58cb06c185a756247a160edb265310f9c17972a982b0ffbdbdc8` |
| knowledge-graph-view.test.tsx（修改前） | `220b9198de30573eab65c6c2596aeef2383c2b9402f68e4f19f0ada36bfc1594` |
| relate/route.ts | `bfbb16e13ff4abe0b7070769cfb81b7c6952956a8edf3ea2daae207cde416167` |
| http-transport.ts | `3c89798b49c372bdb60be1cb255fe1b85ea9449752c97d7bdb4bdad1bff79302` |
| knowledge-regressions-first.log | `7506f92eb4a2285a97346f17d63e8fb86001b089c93a8658431631651a3ae224` |

本评审未补拍红/绿，当前真实全套结果仍为147/148，待主会话按方案实际实现和回归。
