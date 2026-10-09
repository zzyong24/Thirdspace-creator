# T1127 完成路径独立准入判断

- 审查时间：2026-10-09T13:29:04Z
- 当前 HEAD：`6c35033e66be24c618426dd0cb84569572e75023`
- SPEC SHA256：`8e856198c20eea876da52401c2179d3c1b29ea8c261bf57815f35e20eaea0234`
- `taskctl.mjs` SHA256：`f5d9660c87023b1320ba3703bd3b7ef6df9044356b271f6751d0343ea366e65d`
- `frontend-validation.mjs` SHA256：`47c79d66e687b913d3d9a848dda50429f551bae071646d5efbed9263e1c38727`
- modules SHA256：`6d4ca5a4a00b3fcdaeb269a7c422286213c0ebca7711ff2a587acbeba5fcb074`

## 结论

**路径 B 符合已审 T1127 范围，但只能作为有审计记录的验收元数据校正；路径 A 不是当前 SPEC 的必要补充。**

T1127 的用户可见改动是共享 `ChartFrame` 中孤立点的几何渲染。已审 SPEC 明确允许“当前公共浏览器或组件回放”，要求同一输入在 1366/900 下检查坐标、圆点、null 断开、摘要并由主 Agent 看图；它没有定义服务端页面导航、refresh/back、持久业务对象切换或跨页 journey。正式 `run-chart-visual.mjs` 正是为首轮独评 REV-001 后加入的当前主线组件采证入口。把这一任务事后扩成真实服务端前端旅程，会新增数据准备、页面宿主和旅程语义，超出原已审 12 路径范围。

`taskctl complete` 对 `验收=待验` 没有按 SPEC 类型细分：它无条件调用 formal frontend journey validator。该 validator 明确要求 `data.mode=non-fixture`、真实 browser/desktop、logic/surface/journey 三层以及 journey contract。T1127 的五日合成静态输入不能诚实标为 non-fixture，也不能虚构 refresh/back 或服务端 journey。因此，当前证据不能通过路径 A 的 formal journey 门，且不应伪装通过。

另一方面，`taskctl` 明确接受 `验收=—`；只有任务文档链接了 `frontend-journey-contract` 才禁止标 `—`。T1127 SPEC 没有该合同，且其已审验收类型是局部确定性组件回放。因此，当前 `待验` 是登记时把“需要实际视觉证据”误等同为“需要 formal journey”的元数据错分。将它机械校正为 `—` 不等于取消视觉验收：原专用 runner、组件 10 PASS、两视口像素/坐标证据、主 Agent 看图、7 测试/5 产品、公共 backend 组合、类型、LED-047、静态门和完整 reconcile 要求必须全部保留。

## 允许路径 B 的必要约束

1. 校正必须在 `taskctl complete` 之前由主会话留下明确 DEC/控制面证据，说明 `—` 表示“不适用 formal journey contract”，不表示“无前端验收”。不得直接手改状态；验收列的机械校正也必须保留审计来源。
2. 不得删除或弱化 SPEC 的当前主线组件回放、1366/900、真实 Chrome PNG、root 人工看图、null 不连线、摘要和源冻结要求。
3. 不得把合成五日输入改写成 non-fixture，也不得补造 refresh/back、服务端旅程或 PAGE_SPEC。
4. 现有专用 runner SHA `50558af4…`、视觉记录 SHA `a7c36c5b…` 与最终源/测试/完整 reconcile 收据仍需在完成 evidence 中逐项引用。
5. 若后续产品范围新增真实分析页面装配或用户旅程，则该后续任务应使用 `待验` 和 formal journey contract；本次 `—` 不能成为通用豁免。

## 路径 A 的适用条件

只有在 T1127 正式扩展为真实服务端页面旅程、补充非 fixture 代表数据、页面宿主与 logic/surface/journey 合同，并重新独立评审后，路径 A 才成立。当前不应为了满足通用 validator 而临时扩大已审任务。

本报告不执行元数据修改，不签 T1127 complete，也不代签尚未终结的完整 reconcile 或其他全局债务。
