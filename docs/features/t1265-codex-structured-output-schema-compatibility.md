# T-1265 修复本地Codex结构化输出Schema适配导致真实400

三个已保存原任务的同user/group/call/thread/turn历史只读核实：原回合均failed、itemsView=full，仅userMessage，原错误HTTP400 invalid_json_schema：planning.thesis/topic.preference缺required覆盖全部properties，topic.enrich遗漏oneLiner。没有正文或图片，未耗尽原期限。诊断仅4entry配置核验+3原thread/read，省account读取、不评登录/模型可用，不启动新turn；实际自然exit0、SDK和父资源全部闭合、源pin相同。原当场UNKNOWN、原调用账本及usage/费用缺失保持，历史read不是当场RPC frame。实际证据docs/verification/t1261/db4669-incremental/original-three-turn-schema-rejections.json SHA0230c0022608f4597eb73f16f7ed9315883a5145c999e0dcdbe4d2a5e87d108f、closure f4c4c4f1ac71d48ccbd93f9cd82a723935dcb0e923ead0fc07d918c65a035ac0。

已读正式源ai-worker/src/runtime/codex-provider.ts44直接把任意request.responseFormat.schema传native outputSchema，未适配严格格式；原AI SDK/structured-node后置业务Schema仍负责结果验收。用户已经授权修验收问题并使用本地Codex执行文本和生图，不需要独立provider/model/key；本修复不改变引擎、归属、模型配置、候选采纳或AI不直接写库边界。原T1261三轮审核不重置。

正式写集仅ai-worker/src/runtime/codex-provider.ts、必要的同目录纯结构适配helper及对应provider公共链回归/本叶验证工件；合同、业务Schema/Zod、native turn身份/取消/usage/费用处理及UI不在写集。先独立评审最小适配选择，再在全部旧profile闭合后TDD。结构适配不得按业务名称或关键词判断内容：SEMANTIC_BOUNDARY_ALLOW仅用于协议结构验证与提示序列化，无创作语义。不得全optional强制required、擅自加null/去null、截开放dictionary或移除合法union/ref来让严格schema过关。本次明确选择全部JSON responseFormat在首次turn前携带原完整Schema文字约束，由同Codex一次生成并继续原AI SDK/Zod/业务边界验证；不再把任意业务Schema直接交给native outputSchema。这样保原optional/default、开放record及原业务输入族，不引入未经完整证明的兼容子集检测。纯结构提示序列化不得改写Schema/结果或解释创作内容。实施选择及已有用户授权来源见DEC-T1265-CODEX-JSON-SCHEMA-ADAPTER；这不声称用户逐项确认某种Schema算法。独立评审必须核原严格合法Schema能力仍由原验证保持，不补新模型配置，不转其他provider，不在400之后自动第二turn，不重放原三任务、不延长原期限。

验收先真实原provider公共RED，不能用历史read冒TDD。覆盖原三业务schema、optional/nested optional/开放record/array/union/ref及递归未知族、严格合法schema、非JSON请求、图片输入和取消/原回合绑定/一次turn/usage真实投影；每族用原业务验证检查结果，不仅helper检查参数。有意错误结果仍由原schema拒绝，不放宽后置验证。正常JSON输出须可被原AI SDK解析，无markdown包裹或丢字段取巧。修复后干净提交、新开发包、原49能力及完整103、170/7/Pi1/Doocs2分母独立公共复验和截图/账本。缺原素材六项与App拒绝自动化授权继续未验，原失败保留，不签全绿；按pmem/reconcile/taskctl实际Gate收尾。

官方格式规则仅作协议边界依据：[OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)。官方严格对象要求required覆盖属性、additionalProperties=false；这不能代替原业务Schema或当场运行实证。

```mermaid
flowchart LR
 A[原实际失败] --> B[窄范围独立评审]
 B --> C[公共链真实红测与集中修复]
 C --> D[开发包及完整独立复验]
 D --> E[人查看结果和明确未验项]
```
