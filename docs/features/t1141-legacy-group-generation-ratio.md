# T1141 核对旧图片页组的组画幅未进入新生成请求

用户要求发现问题立即建task并修复。承接T1124剩余封面/页组整合的只读核验；当前main393ce00a，未改产品、未提交真实模型生成。

当前backend/src/modules/creative-canvas/creative-canvas.service.ts的validateDocument允许image_generation未填node.aspectRatio，同时visualGroup有明确aspectRatio；只有节点显式不一致时才拒绝。prepareGenerationInput虽然读取当前group并校验原attempt，却仅把config=node的aspectRatio交给参数验证和新taskInput，没有使用组画幅作为缺省值。故从源码看，合法旧页没有显式节点比例时，新请求可能省略用户已选组比例，模型默认画幅与页组分叉。正常模板一般填每个节点，不能据此声称所有生成已坏；目前还缺本轮正式公共调用链的隔离回归。

先用当前正式service/public operation、真实group/node/attempt和隔离内存端口验证该输入族，不调用外部模型或用户库，不以import/fixture错误伪装产品RED。保原新生成参数、输入digest与页组/节点状态；同时核已有显式比例、无组节点、参考精确file、能力参数冲突及未配置情形。

如确认需修复，先补精确SPEC与独评：只有新生成缺省参数继承当前页组明确画幅，不改旧任务冻结输入/账本/原attempt回放，不自动改写旧文档或创建新任务，不让能力晚到阻断读取/保存。frontend failed-page恢复比较需一起核是否与实际有效比例相等；不能用本次默认值覆写历史task.aspectRatio=null的来源真相。原节点手动画幅、组内统一选择与用途标签仍由T1124剩余整合负责。

## 当场隔离验证

2026-10-09 16:34:05–16:34:13 UTC，当前正式service的内存持久化与prepareGenerateProposal实际运行7.919秒exit1。旧页组明确3:4、节点未填比例：返回的新inputData没有aspectRatio，断言null不等于3:4实际失败；组内显式3:4正确返回3:4，独立节点缺省仍缺省。三族均正式save/get、revision、listTasks前后完全相同，跨账号读取全部拒绝；submitCalls=0，未调用模型或用户库。能力端口显式合成fixture，不冒充真实模型；本次是backend service端口，不是HTTP或原生安装验收。源码SHA b6afcef5ff51313da8c21da0bed002c86852170f4662e8b59bfd45d1ed0e6460运行前后完全相同。

实际程序、观察和命令收据保存在docs/verification/t1141；这是真实前置诊断，尚未取得产品实施SPEC评审，不补拍为已审后的TDD。进一步只读发现：generate的existing reservation明确直接使用原冻结输入；但reserveGenerationInTransaction已有预约会与重新准备的当前输入严格比较。修复时不得把旧省略比例的冻结尝试替换成新组比例；还需验证已采用来源回放、未采纳旧候选的明确重新准备及新失败页恢复比较，不能只加一行缺省值后称完成。

当前根因已在正式service准备路径复现，仍未修复、未取得HTTP/模型或安装验收。

```mermaid
flowchart LR
 A[旧页组有明确画幅] --> B[节点未单独填写画幅]
 B --> C[核新生成实际参数]
 C --> D[缺省继承组画幅 原任务不改]
```
