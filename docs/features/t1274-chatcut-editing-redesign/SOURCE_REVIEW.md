# ChatCut参考代码静态核验

核验时间：2026-10-13。原目录见主SPEC；当前参考文件SHA256见 `docs/verification/t1274/REFERENCE_SOURCE_SHA256.json`。本文核验代码与文字是否一致，不声明原版行为、独立编译通过或真实媒体验收。引用编号对应用户给出的文件前缀。

| 模块/行号 | 核到的事实 | 按现有模式复用所需修补 |
|---|---|---|
| 04 L133–139/370–377；28 L54–61；35 L159–163 | parser输出localId/occurrence，chain输入segLocalId/instanceIdx | 共用类型与显式映射，补完整串行测试 |
| 04 L193–207/241–247/534–658 | 简化renderer过滤gap/silence、按素材分组；diff不生成重排move，新增以三字/秒估时 | renderer采用22并修时间保真；提交diff采用19，不把简化示例直接发布 |
| 22 L121/156–230/286–309/356–375 | 固定30fps、isWordDeleted恒false、前导/跨item静音未落实；stamp只含文本长度等有限字段 | 消费真实timebase/源词时间/删除范围；外层保留完整文档与源库digest |
| 28 L172–205/238–247 | 数字局部ID全局索引，文本匹配取首个；warning却说唯一 | 以素材+局部ID定身份，多个精确匹配返回待定位；不伪称已有fuzzy |
| 19 L74–170 | preservedId优先、源重叠选祖先、一项update其余clone、未分配delete | 完整可编辑集合边界；preservedId仍须校验素材/类型 |
| 19 L181–235/239–299 | add缺assetId；clone副作用只留hook | 绑定真实mediaId/精确文件，clone继承完整原字段/附件 |
| 35 L291–345 | 实际5阶段、timeline/state/library三项检查；缺marker放过 | 不称五个stamp；缺失且无法可信恢复则报错，保持合法旧流程 |
| 35 L352–389/219–241 | 没有生成PlannedItem完整源区间/type/frame；new track无ID会跳过；originals是整轨 | 补原模式所需计划转换、轨道创建/映射；保护不可重建元素 |
| 28 L321–325；35 L166–175 | 一个纠错error即整单拒绝 | 以原段保留等安全路径做明确部分候选；不能让质量校验封死手工保存导出 |
| 27 L140/174 | import type ScriptError随后new实例 | 改为实际值导入 |
| 34 L70/125/139–164 | parseTrackAlias未从sequence导出；多个新alias不累计 | 修接口并明确每个已分配槽位 |
| 29 L78–82/141–151/254–293/375 | library类型缺content；调用未定义shouldRefresh；路径与refresh草稿保护不足 | 统一任务内绝对路径与cache接口、base/dirty分离、原子刷新，沿原任务生命周期 |
| 59 | runtimeEnvelopeLine在此文件未实现，指向57 | 需要时核57；目前复用既有任务回执不引进新envelope |
| 21 L135–148/176–205；12 L246–290/357–375 | JSON schema转换stub；annotation不是运行时权限；approved由调用者传 | 使用当前contract派生schema与真实user adoption，无新权限循环 |
| 56 L302–325/486–495/582 | 并非原版framework；store stub；batch无事务可部分写入后报错 | 当前不新增该域；必要集合动作走已有backend service与事务 |
| 09 L14–32/52–64 | 旧13模块索引，称renderer/transaction未抽取 | 不把旧索引当54模块编译与完整性证据 |

明确可copy的模式：真实状态投影→Markdown编辑→校验/有证据纠错→源区间计划→保留身份的diff→用户采纳→已有backend事务与回执。当前直接逐块拼接无法证明完整可运行；核到缺口应窄补，不另写替代创作算法。
