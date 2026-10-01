# T-1037 制作工程实现与真实证据

2026-10-01。任务进行中，不能作为完整公共服务、前端工作台或客户端验收 PASS。

## 已发生

- 独立评审 round1 CONCERNS `f447504eb2ca`，修订旧 assetId 删除与新版 itemId 删除的唯一兼容行为；round2 PASS `03cbb3aedc96`，taskctl 已启动。
- 实现内部结构编辑 helper：旧稿明确保存时稳定身份、默认值合并且未知字段保留、精确前值摘要、批次校验、目标类型/ID 守卫、单项删除、字幕失效重点清理、不可变输入。
- `plan-red.log` 是新模块未实现时的真实 import 失败，未运行断言，不能声称七项断言均先失败。
- `unchanged-legacy-boundary-red.log` 是实际行为红测：1 failed / 6 passed。新增时长检查误伤了只改字幕的旧合法素材；仅检查本次新增或改时间的项后，`plan-final-green.log` **7 passed**。
- `contract-regression.log`：旧视频 props 和 production 合同 **23 passed**。`contract-typecheck.log`：tsc exit0。
- backend 全量类型检查原始失败保留；第一轮含本次测试数组可空和联合类型收窄问题，第二轮这些错误已消除。最后一轮仍有其他模块14个旧测试类型错误，本次 production-editor 没有类型错误，不能报 backend 类型检查全绿。物理边界检查仍为 T-1026 已登记的 Copilot 两项新基线违规，本次未改相关文件，不宣称门卫通过。
- T-1036 真实选型和 ChatCut 当前工程实测已提交 `34e3b6a9` / `18884d1a`；用户桌面 ChatCut 未提交剪辑修改，validateOnly 移动候选后真实 item 全量回读一致。

## 接下来必须完成

1. 历史/保存回执与渲染请求 schema、迁移及公共事务/CAS/幂等服务。
2. contract operations、transport/client 注册与组合根 Asset/项目素材/执行任务 port。
3. direction 的卡片 ordinal / B-roll file 引用与稳定身份、明确移动/删除的协议适配；当前内部 helper 尚不足以宣称有 direction 的方案可正确预览与成片，禁止提前接成可用按钮。
4. 具体 output 入口和旧方案新旧共享真值兼容，保存不生成、冻结渲染与真实采用关联。
5. SPEC 全部归属、公开读回、重启、并发、断线、首屏外素材及完整旧调用链回归。

本文件的 helper 单测不是服务、预览或出片验收。T-1038—1041 与父 T-1035 均未完成。
