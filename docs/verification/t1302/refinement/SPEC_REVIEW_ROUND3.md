# T1302 原 lineage round3 复核

评审者 `/root/sol_review_t1303`，按委派使用 GPT-6.1 Sol high；未核验极速开关或声称跨模型族独立性。沿原审核链 `CONCERNS[REV:3e95dc34dc6a]` 复核 round2 的唯一问题 REV-001。本轮判断：**REV-001 在方案与精确写集层面已解决，无开放 blocker/major，无随改新增阻断**。严格 JSON 保留原 finding，只有 status 与 resolution_evidence 改变；正式结论由 C 的 reviewctl 计算，不重开 initial 或重置轮次。

| 绑定 | 精确身份 |
| --- | --- |
| 冻结 commit | `e0f0941d2164b0c4ac58ec2cb37780c1d05df948` |
| 主 SPEC SHA256 | `9ceb88d8216547f6d62ee9814fb14a8f472d949725121777db001db9f5878f57` |
| delta SHA256 | `0907b3c91832a9339c92cad63e375c3a26db07f0272fd26905c6dee7cc51e210` |
| INPUT_LOCK_ROUND3 SHA256 | `53f3c1823bda4201edf82191a9d00223926d2eec2a89991981678ca4720421bf` |
| constitution | `orchestrator/SYSTEM_ARCHITECTURE.md`，沿用未变 SHA `eb1826d4c09054df622d9718c38ca372bd19833e72bd1a752757631a5747c1df` |

实际核对 63 个锁定输入 SHA，零漂移。原55项中51项逐字沿用，变化仅主 SPEC、当前 review、delta、modules 配置；round2 主文是本轮主文完整前缀，initial 原稿仍是完整前缀。相对 `6f11f81…` 的 frontend/backend/contract/worker diff 为空，产品与测试未提前实施。只读 `reviewctl context T-1302` 确认上一轮确为 CONCERNS、open REV-001，未把它误称 FAIL 或实际测试 RED。

修订只把现存 `frontend/src/features/copilot/work-candidate-adoption.ui.integration.test.tsx` 从只读变为精准可写：允许真实 summary/展开动作及同文件操作 helper，禁止 test-only 强制展开、取消默认折叠、跳过保护族或改期望值。原 body/key、fields/facts、恢复/锁定/零自动写、脚本与另一平台隔离断言全部保留。delta“精确写集与串行职责”和“REV-001 精确测试适配”、主 SPEC 追加说明及 `REV001_SCOPE.json` 一致；modules 的模块写集及 `ui-refinement` 步骤写集均有这一个新增测试路径，未增生产文件。

通俗说，旧测试现在获准像用户一样先展开，再做原来的选择与恢复核对。此前“必须默认闭合，却禁止适配必跑测试”的冲突已经消除。生产仍只两 card，原两 card 测试不变；hook/来源/locked/confirmed/采纳合同、renderer/native 和其它范围没有随改新增变更。

这只是方案销账：真实展开适配、前置 RED/GREEN、真实导出、生产公共旅程和视觉尚待实施后验收。本轮零测试、模型、服务及产品操作；没有回写 T1303 原五 RED/增量 RED/120/19 或旧源码绑定，没有消除 T1301 历史缺证、T1300 round3/父矩阵或未决用户裁决。只写本报告与同名 JSON，未改 SPEC/控制面；交付后释放全部写权。
