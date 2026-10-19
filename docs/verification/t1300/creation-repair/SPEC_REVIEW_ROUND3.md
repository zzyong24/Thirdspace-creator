# T1300 round3：联合创作增量独立方案评审

结论：**PASS，仅通过本轮 creation 冻结协议补修方案。** 无开放的 must-fix／blocker／major。该结论不通过尚未实施的代码、新增 TDD RED／GREEN、新 production 候选或联合创作真实功能验收。

评审者：`/root/sol_spec_review`，独立于 C 方案作者与 B 实施者。遵 Root 授权只读核源码、证据及锁；C 释放后仅写本报告与同名前缀输入 JSON，没有改输入、产品、控制面，没有运行测试、模型、构建、浏览器或审核登记。

| 锁定对象 | SHA256／身份 |
| --- | --- |
| 源码检查基线 | `fc53f3fbd628d8be059abc5cff5290be9b9fe87e` |
| 主 SPEC | `bf9837ac87b8c3315d5f904e8bf6b6d510bb862eee9f6b7a479f4562049add59` |
| `t1300-creation-frozen-protocol-delta.md` | `e6de6763fa1571e10a696839ac512faa4232399b35618011a2eed01fce8031e1` |
| `INPUT_LOCK_ROUND3.json` | `21982cad9a67c9395bcdaf8d9f1010f4d2ec03fc9506e9790ba85f36daa76032` |
| 原 round2 主完整字节快照 | `4a841aa69025c7b82c61ab6153dcb568b4520b506358450b578c80cbdc20d0aa` |
| `modules.config.json` | `71ed206de6ff9070db2788158575dd6ac2af8ecf0cae588a02b8f9d556879407` |

独立逐项核算 lock 的 **18 个输入，全部匹配**。原主快照 19,929 字节为新主 20,685 字节的精确前缀；原矩阵、runtime design、56 键目录、round2 delta／锁／评审及原 candidate 证据没有被覆盖。两个允许新增文件当前确实不存在。module 差异仅 T1300 新增 creation-repair 步骤、精确写集及 acceptance 依赖；没有重写已完成步骤事实或放宽其他 module 权限。

## 根因与证据口径

真实 A11 公共提交 HTTP200，原 task `execution-task-7032dd5c-cf2c-4c0f-89fd-d68fd76e3aef` 随后 failed／`CHAT_WORKER_INPUT_UNAVAILABLE`，原 aiTask、会话和 sourceMessage 身份留存。提交的合法 writingContext 是 brand=null、sourceAssets=[]，不能删掉它或伪造账号来规避失败。旧 candidate 的成功样本仅属于旧源码／产物，A-FIRST-WINDOW 明确 U11-U12 FAIL、其余部分项未验，没有借文章 work.editor 成功代签 work.creation。

源码强定位与实际已取得原件分开：

- `chat-work-creation-tool-host.ts:39` 内层按 resolvedWritingContext 选择 director-v2；`:45` 外层 adapter 未传 definitionOptions，`chat-host-tool-adapter.ts:28,43` 默认重建 v1。`execution-chat-tool-ports.service.ts:45-48` 的原 validateTask 比较冻结 version，拒绝该装配；dispatcher `:174,522-528` 在调用前执行该门并归一错误码。
- `work-candidate-source.service.ts:43-45` 目前仍按 target.writingContext 布尔值猜 creation 版本；同文件 `:60` 的完整定义严比会继续暴露不一致，所以必须同时修来源消费者。
- calls=[]／nextSequence=0 是 B 当场公共只读观察，原 HTTP JSON 未单独保存；方案已如实保此限制。未取得原任务完整 frozen payload，故不能把静态链推断写成已经读过该原件，更不能冒充新增受控 RED。

上述现象足以支持最小补修及后续验证设计，不足以单独证明所有同码失败的唯一根因。

## 合同与验证充分性

| 复核重点 | 方案判断 |
| --- | --- |
| 三消费者与历史版本 | 纯 helper 只解析 creation read/propose 的完整 v1/v2 prefix 和 64 位 hash 格式；无族为空、单 propose 子集合法，重复／混版／未知拒绝。host 内层、外层及 adapter.current、source 使用同一冻结选项，不按当前偏好重签历史。 |
| 完整定义与上下文 | prefix 只选择原 workWritingContext 选项，仍由原 prepare 重建并严比 schema、description、hash、effect、execution。合法 v1 无写作上下文、合法 v2 有真实解析上下文均应继续可用；缺真实上下文／摘要或真实目标不一致拒绝。合法空写作选择不得被性能／质量门反杀。 |
| source 分族 | source 同时涉及 editor 和 creation，方案明确分别构造／核验，不让 creation 的 workWritingContext 覆盖已审 editor 旧协议。原单工具历史子集、editor 三 owner／旧 v1/v2／markdown 兼容仍要求回归。 |
| 可信来源与安全拒绝 | 保原消息、task/call/turn、proof、target／digest、group/account/user 归属及完整定义核验；错 hash／description／schema／effect／execution、跨组／错来源必须拒绝。原 legacyJoint v1 无 proof 的窄兼容和 v2 proof 门均不放宽。 |
| AI 候选及采纳 | proposal 仍终态输出，不增加 AI 写正式稿能力。原 source.read/readSource、文章／图文各自 owner 采纳、同请求幂等、当前版本 CAS、精确读回及脚本／另一平台隔离继续成立，不改采纳业务服务。 |
| 新增 TDD | 明确先保存 v2 外层 version 错误与真实 submit／lease／生产组合 Host→validateTask admission RED；不能只有 helper 测试或手工短路 Host。修后同一组合再贯穿 adapter.current、准入、read/propose、settle/finish 消息、source 与独立采纳。现有旧组合多数手工组装且无 writingContext，新增准入测试正好补当前遗漏。 |
| 精确范围 | 仅三生产文件（creation host、source、纯 creation protocol）和五指定测试及专属证据目录；不改 contract、worker、通用 adapter、dispatcher、validateTask、采纳服务或 inspect 权限。module 写集与 delta 一致。 |
| 回归与执行预算 | 五聚焦测试、backend 类型、必要契约／editor 来源组合、boundary／semantic／timeout，原 120 秒以上预算、test/hook180秒和无重试要求保留；不以全量盲跑取代当前公共缺陷复现。未实施方案不要求现在已有红绿结果。 |
| 新 production 真实链 | 修后重新构建并绑定新源码／binary／sidecar／可安装包，使用全新 owned DB/media，通过公共入口重建夹具和新任务。真正联合一键→两份预览→分别采纳→刷新→脚本／平台隔离才可关闭缺陷；不在原失败任务续跑／重发，不用受控成功或旧包成功给新包签 PASS。 |

```mermaid
flowchart LR
 A[原冻结creation版本] --> B[显式解析v1或v2]
 B --> C[内层及外层使用同选项]
 C --> D[原严格公共准入]
 D --> E[read与proposal终态回执]
 E --> F[来源再次完整核验]
 F --> G[两平台分别预览采纳并读回]
```

方案充分覆盖本次已知断点与其三个真实消费者，没有另扩平台或状态机。新增受控证据仍须证明完整组合实际经过这些节点；后续实施独评不得仅据本方案 PASS 或聚焦 helper 绿作结。

## 环境与尚待执行

旧 controller 正常 stop 后真实记录 exit143、signal=null、端口无监听；`old-candidate-shutdown.json` 明确 flushCompletionVerified=false。方案没有把143写成shutdown0／完整drain，不再写旧 DB/media，而用新 owned 根建夹具。旧数据和失败证据保留，这一选择不依赖未取得的 flush 完成证明。

candidate 仍是 production sidecar 测试授权模式，不能代签真实激活、原生壳、Keychain／defaults、IPC 或现用 App。既有签名 controller、loopback／端口／TTL、私钥不传业务子进程和不安装／发布边界不变。

本报告只评 round3 增量含义与验收设计；原40公开功能／56键矩阵、完整 Gate 和所有尚未发生的真实旅程继续待验。C 应以本次主 SPEC 精确 SHA 沿原 reviewctl lineage 记录 **recheck**，不得换新 initial、自签或追溯声称已修。完成本报告及输入 JSON 后，评审者释放写权给 C。
