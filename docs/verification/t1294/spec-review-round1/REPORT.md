# T1294 独立规格初审

当前正式SPEC（包含最终直接充值入口方案）可作为本轮已确认需求的实施合同，未发现需要先修订的阻断或重大规格问题。本文是新任务initial审查，findings为空；不重置或代签T1278旧周期，不把盘点建议、源码存在或截图状态当作实现通过。当前Main HEAD `6ff8b6e317330711e08426b1cbc39aeb243f16c1`，SPEC SHA `eb607988a1506936137420f8f94b292d0c23566fc6e7ccd6d17c2f22ea28f569`，产品宪法SHA `86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`；准确输入见BINDING.json。

## 确认、现状与必要性

已读取BACKLOG任务、完整当前SPEC、DEC-129401、两份只读诊断/模型UI库存、相关根装配/contract/status service、后端物理架构和UI规则。产品流程3.29.0与项目一致。使用项目oil-ui-pro0.10.0存量方向规范，保紫色tokens、组件及账号组交互，不引入新品牌方案。Parent转达的人类确认与DEC支持本轮默认、移除向量与交互变更；不把当前源码反推成用户批准。

两张用户基线已实际看图：一张“你好”后显示自动恢复未取得进展；另一张同时显示正在恢复与“正在检查本地Codex”。它们支持用户可见问题，不能证明Worker仍运行、网络卡住或重复预检就是原任务失败根因。诊断尚未取得所属group/taskId，business reads/model requests为0；新真实对话和原失败诊断均未发生。SPEC明确先定位原任务、需要Worker/流恢复改变时补最小写集再复审，符合不猜根因、不重发unknown的边界。

源码核实普通routing投影/PUT后GET、助手focus或legacy挂载以及根admission/派发会重新读完整status；当前service catch将取消也投unavailable。重复检查有独立实现原因，与原“你好”实际故障保持两条证据链。该问题值得在本任务修，但不能藉此删除认证、模型身份或unknown恢复检查。

## 八项范围的完整性

|需求|当前SPEC已固定的实施与验收边界|
|---|---|
|默认官方|完整已保存choices最高优先；null且服务端legacy明确codex才保旧选择；其它null官方，同一backend纯策略用于GET与两个新根，禁止UI自动PUT、按SKU/密钥猜来源，旧可信冻结不变。|
|统一图片入口|vision/image主动选择同次CAS；旧mixed未主动改前保持；理解与生图协议分别配置，生成/编辑复用原fallback，专用edit保高级覆盖；官方不支持编辑不得假ready。|
|停用向量|覆盖公开query、上下文、create/revision/采纳index/backfill与模型probe；使用原关键词检索，零新embedding请求；历史catalog、完整choices/frozen/schema及数据保解析，不DROP。|
|集中RedFox|沿原user归属、加密与configured掩码，旧highlight深链转模型页，同一配置实例；搬页不迁移Key权威或泄露秘密。|
|常驻充值|TopHeader共同位置的ai-credit-entry.tsx直接调用原受控helper，单在途/错误/卸载与切组取消，不等Settings RSC；失败可显式导航现有模型设置。只保模型页唯一原Card，不添Dialog/表单或bootstrap；余额未知不造值，原资金期限与unknown保持。|
|助手对话|只去本助手画布跳转和多余检查横条，保项目引用、正文与历史、其它画布/剪辑功能及诚实错误/恢复入口；不把删提示当修复。|
|Codex检查复用|真实user+宿主代际的非秘密成功观测与singleflight；普通metadata只peek，空缓存诚实unverified；显式切换check在写锁外，成功后原revision CAS，失败/取消不保存；单观察者取消不污染状态或反杀其它读者。|
|真实聊天|冷次实际提交在必要协议握手取得真实requestedModel再freeze；不能用假ID或永久ready，旧route仍认原ID；同一新任务公开提交→Worker→流→完成可读文本，保原unknown任务。|

这组要求没有把通用模型协议、视频/语音/本地模型等不支持的来源变成可选假能力。“按能力选择”仍受原closed schema与真实适配器支持；图片统一是来源入口合并，不是用生图模型代视觉理解。

当前contract完整六槽choices与完整frozen catalog包括embed，SPEC保历史形状而只隐藏向量入口与切断新消费者，能避免旧任务解析失败。旧self编辑已有generate/default/env兼容fallback，官方接管仍独立裁决edit，SPEC保此真实差异。关键词权限/记录与旧知识数据不因停用向量消失。

## Codex与权限/生命周期边界

缓存只用于减少重复观察，不持有Token/线程/创作内容，也不替代实际Worker认证/运行错误。SPEC未承诺跨进程持久verified记录；冷启动无真实ID时不能从localStorage、模型名称或旧UI状态补ID。状态检查的私有worker协议目的可在精确候选中说明，不能据此扩大到生成/恢复Worker修改或新增持久probe数据库。实际provider/auth失效仍准确报错，不能因取消写出“能力不可用”缓存。

当前peek/check与冷admission必须保持一个请求的原预算及真实task/fence/route归属；诊断列出的readiness120000+execution120000+grace10000及无上界FIFO不能被短UI观察帽截成模型失败。原规范要求耗尽后保真实任务与原ID、不续资金/任务deadline，SPEC明确继承这些原约束。实现时的具体缓存generation来源、过期/失效和晚回执拒绝、双读单flight/单观察者与全取消应以诊断列出的同域公共测试实证，而不是把“缓存命中”写成永久ready。

默认策略、状态服务、关键词runtime等业务保持backend owner；frontend persistence-client仅装配service ports，Worker不直连库，UI不读取secret或执行模型。现有schema/endpoint保持兼容；诊断中条件建议的新增purpose、内部状态或准确路径须由Root在正式候选/写集逐项绑定，不由本报告自动准入一切建议。若真实原失败涉及任务claim、lease、stream或unknown恢复，该准确根因与写集应另按SPEC约定补充复审后才实现。

## 新增充值入口与取消的精确复核

Root在未record的初轮内明确收窄为 `frontend/src/features/settings/ai-credit-entry.tsx` 及直接相关测试：直接复用原 `openAiCreditCenter`，传真实observer signal/isCurrent，显示opening/error与单实例防连点；不挂第二AiCreditCenterCard、不新增充值码表单/Dialog、不reserve/bootstrap、不新共享资金store或服务authority。错误只显示真实helper结果，用户可显式走原设置路由。原模型页无条件保留唯一原额度卡；不把未配置显示为ready，也不造余额。这是常驻充值原需求的必要现有链路接入，不是新资金能力。

曾提出的小Dialog复用卡存在已确认边界：原AiCreditBootstrapForm的attempt、inFlight、operationRef与uncertain仅组件本地state/ref，卸载重开或两个实例不能自然保跨入口unknown身份。Root已撤回该方案，因此当前没有依赖“旧卡已有跨实例能力”的伪前提，也没有顺带改资金authority；原卡历史卸载问题未被本报告签为已修。库存报告/WRITE_SET中早先Dialog与资金会话建议只作盘点历史，**当前正式SPEC优先，未准入被撤回的Dialog或共享资金状态**。

`frontend/src/server/settings-model-test-wrap.ts` 的 knowledge.search.embed 当前分支实际 resolveEmbed后直接embedProbe，故在网络/凭据解析前返回停用结果属于用户明确停用向量的必要窄写集。只删UI或query仍会留下该公开probe，当前SPEC已明确覆盖；不据此改变历史embedding catalog/frozen/schema。

RequestContext当前没有AbortSignal，不能声称本轮已实现HTTP断开传播至所有backend PUT。内部status service只对收到的真实observer signal隔离取消；客户端关闭/切组后未知的已受理保存仍可能在服务端完成，应保原revision与unknown/读回核对，不自动重发、不伪报已保存，也不能把取消等待当服务器已撤回或零写。这与当前“取消仅结束本观察者、检查失败/取消不伪造已保存”的诚实边界一致，无需凭空扩API。

## 验收充分性与未验

规格要求受影响单元/契约、类型、边界和timeout门；UI存量桌面/窄窗/200%、保存重开/取消失败/旧选择/图片mixed/RedFox旧深链与充值常驻。AI编用例、隔离Playwright真实操作留图，不能mock自有设置API或用截图代保存结果；新Codex对话必须同ID观察完成与可读文本，HTTP200/只有进程或helper测试均不算聊天通过。原生App自动化仍未授权，打包安装打开交用户验收不代原生自动化PASS；不推送/部署Growth/真钱操作。

截图基线与库存已有明确存量方向；最终界面尚未渲染或操作，本次不打视觉分、不声称界面有效。当前没有执行测试、服务、公开用户业务读取、模型、资金、App或包构建。本轮没有伪造TDD或原失败任务证据。

```mermaid
flowchart LR
 A[保留用户原选择和失败任务] --> B[设置明确来源与真实检查]
 B --> C[普通metadata只peek]
 C --> D[冷提交取得真实ID后冻结]
 D --> E[同一真实任务完成再验收]
```

初轮findings为空表示当前需求及已核边界足以进入准确候选与实施；不表示模型/界面/聊天问题已修复，Root仍负责正式控面、最终精确候选与真实公共链验收。
