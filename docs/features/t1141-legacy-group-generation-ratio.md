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

## 精确实施SPEC（待独立审核，当前不改产品）

沿用现有4-build maintenance与用户“发现问题建task及时修复”。原诊断是真实评审前观察，不补拍成正式评审后的RED。限定目标：只有用户新发起或新准备的图片生成，在节点未填写比例时落实已经明确选择的页组画幅。独立节点、视频首帧比例、静态图片裁切、组内手动画幅同步和用途标签不在本次改动范围。

产品仅允许两条路径：

- backend/src/modules/creative-canvas/creative-canvas.service.ts：prepareGenerationInput读取原已保存group后，image_generation有效比例为node.aspectRatio ?? group.aspectRatio；无组仍保持省略。能力参数检查和最终taskInput/digest必须使用同一有效值，不改变prompt、mode、精确reference/file/checksum或owner。读取/保存旧文档、能力未配置的保存不受影响；新生成请求已知不支持该画幅时沿原参数错误拒绝并指引换模型/画幅，不先创建预约或任务。
- frontend/src/features/creative-canvas/canvas-editor.tsx：失败页恢复比较当前有效node ?? group比例与新任务实际冻结比例；其他prompt/mode/exact-file比较不变。旧失败task.aspectRatio=null且节点仍缺省时不能把null重新解释为当前组比例，明确提示“原任务未保存页组画幅，请用节点上的生成按当前画幅重新创作”，保留原结果/尝试。用户通过现有节点生成按钮明确再创作仍可用；原attempt核对/未知状态恢复继续使用旧冻结输入，不能自动另建任务。

旧预约严格回放：

- generate现有先读预约、frozenInput及原task的路径保持原字节语义，不因当前有效比例重新准备或修改原inputJson/inputDigest/attempt。
- reserveGenerationInTransaction在准备前读取同attempt预约并验证rowOwned/canvas/node与frozenInput。仅当已存在且原冻结图片输入缺省aspectRatio时，在准备当前比较值的私有选项中保留原“缺省不继承组”的参数语义；显式节点比例仍原样参与比较。继续原expectedRevision、workspace/parent锁、snapshot、admission期限、完整isDeepStrictEqual、digest与任务在途守卫，不用宽松字段比较覆盖差异。
- 新预约/新候选没有该历史选项，全部继承当前明确组画幅。尚未采用的旧候选若省略比例，没有已有预约时必须返回原重新准备生成候选冲突；不得悄悄升级原snapshot或账本。
- 已存在新预约带明确比例仍比较有效组比例；foreign attempt/错误canvas/node/篡改摘要拒绝。原proposalAdmission、confirmedAt/deadlineAt、父任务剩余期限、幂等key均不重新生成或续期。
- 旧预约 fixture只在内存测试库显式构造已省略比例的可信冻结形状与正确原摘要，用于兼容回放断言，不冒充实际用户旧任务或模型执行。原完整replay/unknown恢复与AI采用事务回归仍运行。

SEMANTIC_BOUNDARY_ALLOW：缺省比例只落实用户已保存的明确group画幅；历史选项只核同attempt被冻结参数，代码不选择风格、素材或含义。

验证：独评PASS后先增加有意义的正式service/transport RED：3:4旧节点缺省新准备+新generate参数应3:4；能力不支持继承画幅应拒且无新任务；组内显式、独立缺省、参考exact、跨组拒绝和旧预约恢复。正式新的RED之后最小实现至GREEN。前端原组件入口检查新失败页3:4可重试、组已改比例拒绝、旧null只提供明确再创作且不自动提交；能力未知读取/保存仍成功。明确端口spies不冒充浏览器或模型。

新公共后端整合采用当前creative-canvas-root真实service/transport、AiService提交与持久化、fresh隔离内存Db和关闭wake端口；prepare/dispatch/create/get/listTasks回读新task冻结比例、旧task/input/digest完全不变。合成模型能力和不运行wake必须在证据标明，不发外部模型请求/不读用户库，不用SQL种假成功代签实际新任务。真实HTTP/模型/安装生成仍不在本次已通过声明内。

允许测试backend/src/modules/creative-canvas/creative-canvas.service.test.ts、frontend/src/features/creative-canvas/canvas-editor.test.tsx、docs/verification/t1141/**；控制文档为当前SPEC/review/input、BACKLOG/PROJECT/DECISION_LOG/modules/events/review-events。不得修改AI公共契约、数据库schema、历史任务迁移、其他product源码或vendor。所有新增所需路径先独立recheck，不事后扩写集。

原两文件完整测试、相关assistant-system-root生成候选/采用事务原回归、frontend type、boundary/semantic/orphan、LED047、timeout公共链、diff、pmem及完整canonical。动作/请求/有限观察至少120秒；测试outer覆盖冷初始化与完整串行操作、0retry。T1140当前浏览器受测canvas-editor是watched路径，结束前不编辑该产品。按当前源码最终SHA独立实施复核；原39全局失败逐条保留，新增登记修复。不签全功能、原生安装或真实生图成功。

DEC-T1141-01：用户已明确授权缺陷修复；本次属于现有页组明确选择的落实与历史参数兼容，不改方向、公共契约、数据归属或发布标准。旧null不能冒作明确组比例；只有新用户确认的请求采用当前选择。
