# T-1238 本地Codex统一执行文本与生图

## 用户确认与结果
2026-10-11用户先明确执行引擎为Codex，再要求继续实现：选择本地Codex时不再调用独立文本模型或生图模型。此确认取代T1057候选中“图片生成仍需额外模型”的推论。完整功能范围不切成版本或优先级；原T1227失败与未验记录保留。

本地Codex承担新文本、图片理解、结构化生成、创作编排及生图任务，包括页面、编导子任务、定时和其它后台入口。用户登录Codex即可使用其实际提供的能力；不可用时展示真实Codex原因，不要求配置另一文本/图片供应商，不静默回退。视频、ASR、Embedding与确定性宿主服务保持各自真实能力归属，不把本轮免文本/生图配置要求扩大成未授权的其它供应商迁移。

## 合同边界
后端保存默认引擎，浏览器旧偏好只用于无服务值时的迁移。新任务冻结引擎与来源，子任务继承父值；在途和历史Pi任务保持原冻结事实。所有公共可用性预检、同步生成、独立账本和Worker真实消费者使用统一路由，不假装Codex是带API密钥的模型。Codex任务不得进入文本或生图供应商adapter。

Codex模型/协议/图片能力使用随包实际支持的官方协议与真实回执，不以设置开关或提示词宣称完成。官方Codex内置生图原文件按其协议写入Codex自己的generated_images目录；CreatorOS只接收同一真实回合返回的图片字节，写入任务绑定暂存空间，再按原归属、大小、类型、路径、租约校验后经backend service回收，不读取任意Codex home路径；正文与正式实体仍由用户采纳后落库。旧供应商路径保留给Pi及原历史任务。预算、取消、unknown、幂等、原任务ID和费用账本不削弱。

## 实施与验收
先核当前协议、能力、全入口与服务契约，补DEC和独立评审后才改产品。当前实现与新范围以本SPEC为准，T1057原证据仅参考。设置UI使用oil-ui-pro与现有tokens/组件，不新增虚假按钮；保留可用基线。

要求真实前置红测及公共链回归：无独立文本/图片配置的新Codex任务可进入执行，覆盖文章/脚本/图文/发布物料/选题定位复盘/知识/雷达飞轮/视频决策/图片理解与封面配图；后台与子任务继承、Pi兼容与跨组拒绝、未登录/能力不可用不得调用API供应商。真实Codex至少文本结构化与生图各一轮；设置真实保存读回及操作/视觉证据。未执行部分诚实未验；所有执行与观察最低120秒，零retry，使用临时数据库/媒体/任务输入，不改变HOME或真实用户库，不发布。

写集在独立评审前通过实际入口清单明确。收尾按原Gate、pmem sync、完整reconcile、taskctl与可核查提交；全局既有失败保留并复用T1204，不签全绿。

```mermaid
flowchart LR
 A[设置选择本地Codex] --> B[后端保存默认引擎]
 B --> C[页面 聊天和后台新任务]
 C --> D[冻结引擎 子任务继承]
 D --> E[Codex文本与生图]
 E --> F[真实结果与候选]
 F --> G[原服务保存或用户采纳]
```

## 需求与验收编号

| ID | 已确认结果 | 验收 |
|---|---|---|
| FR-1238-1 | 设置中的默认引擎保存到原用户偏好；全窗口和后台读取同一选择 | AC-1238-1：公开PATCH→GET、刷新/多窗口、不同用户隔离；旧浏览器偏好只能在服务值未设时迁移 |
| FR-1238-2 | 所有新文本/图片理解入口在Codex模式走其官方执行协议，不调用独立文本供应商 | AC-1238-2：逐功能公共入口无文本key可执行，API resolver/供应商spy为0；真实结构化文本至少一轮 |
| FR-1238-3 | 独立生图、封面、图文/文章配图及聊天生图走Codex内置生图，不调用独立图片供应商 | AC-1238-3：无图片key的公共生成→真实图片回收/读回，供应商spy为0；真实内置生图至少一轮 |
| FR-1238-4 | 新任务冻结引擎、子任务继承、后台统一，切设置不篡改在途或历史 | AC-1238-4：切换前后父子路由、Pi旧任务、后台排期、幂等提交与恢复均保持原归属/冻结事实 |
| FR-1238-5 | 未登录/套餐或真实能力不可用时给Codex原因，不误导配API、不静默回退 | AC-1238-5：未登录、能力未支持、额度失败、拒绝、取消/unknown均保原任务，API调用为0 |
| FR-1238-6 | 原Skill/候选/CAS、真实ID、图片授权与lease/budget不削弱 | AC-1238-6：跨组拒绝、参考图片保真、候选采用、并发保存、未知回合只读恢复与预算回归 |
| FR-1238-7 | 选择Codex时设置不要求文本/图片模型；Pi切回仍保留原配置和合法功能 | AC-1238-7：设置操作、刷新、错误、窄窗与Pi回读真实视觉/交互证据 |

## 服务与执行合同

沿用 `settings.preferences.get/patch`，扩展 `assistantExecutionEngine: pi | codex | null`；null只表示尚未迁移/明确设置，后台有效默认沿旧Pi。PATCH明确值为pi/codex；浏览器首次迁移用既有compare-and-write服务约束，不能覆盖已经设置的服务值。数据仍为用户级user_preferences，不新增账号或任务权。

任务的可信runtime保存 `executionRoute`（schemaVersion、engine、protocolKind/runtimeVersion和来源），由真实后端偏好或父绑定产生，不接受模型或普通业务inputData注入。公开聊天已有显式executionEngine继续有效且冻结，未传使用同一服务默认。旧任务缺executionRoute按原Pi事实，原Codex聊天按其已有executionEngine事实；旧账本不现场按当前偏好迁移。子任务在提交事务从真实父execution记录继承，不使用准备阶段的新默认。

Worker执行规格使用明确联合类型：原API ModelSpec保持原字段；Codex规格只携带官方runtime/protocol及可选已冻结请求模型，不含API token/baseUrl、不伪造provider模型。各原Skill节点继续其schema、分步及账本，但模型调用通过受控Codex transport。实际thread/turn ID、模型身份、usage保存到原execution call/receipt，未观测模型身份为未知，不能拿API默认名冒充。原CALL预约→启动→结算与原检查点保留；未知只核对同一历史thread/turn。

原生Codex仅启用此次需要的image_generation和官方结构化输出/真实授权图片输入，保原未知MCP/apps/plugins/hooks及shell限制；不把本次要求扩大成任意命令权限。实际provider capabilities、登录类型/套餐和模型图片输入共同决定内置生图能力；authenticated不单独等同生图可用。显式保持notification媒体返回，不读任意home savedPath。图片RPC接收预算覆盖原合法30MiB图片的base64及包络，不因原4MiB帧限反杀生图；按类型、真实bytes、当前call/ref、原图receipt回收。独立生成使用业务账本，禁止冒充chat提交。

知识四类同步候选、成片视觉审核等现有宿主直调改经受控Worker/service，公共响应与候选采纳含义保持；可选视觉审核不可用不能阻断原安全导出。转录ASR保持原路径，其文本后处理同样走冻结Codex。视频生成仍沿原媒体供应商，不混入本轮文本/图片迁移。

可用性预检与真实执行共用路由：Codex文本/图片不解析API凭据；Pi仍解析原配置。业务入口未完全迁移前不能隐藏仍被需要的配置或宣称免配置已完成。实际错误复用原安全错误/参考编号及状态，不输出凭据、原始异常或完整prompt。

## 实际消费闭包与写集

完整只读盘点定位于T1227报告及本轮协议证据 `orchestrator/probes/T-1238/protocol-schema/summary.json`。实现写集限定以下当前相关叶子/模块，新增叶子与对应测试只用于本合同，不扩到无关页面/领域：

- contract：settings resources/operations；internal execution-worker、worker输入/路由/身份、asset-generation/cover/video/transcribe/chat协议；assistant-operation-catalog中实际所需工具策略。
- backend：schema/settings与主迁移日志新增assistant execution engine；旧lineage归档保持不变，迁移收敛验证纳入新增列；settings repository/service；application/generation transactional runtime；ai task创建/父提交/chat默认；execution的authority、scheduled child、model identity、generation/agentic/video/asset/cover/transcribe ports、dispatcher、flywheel；ai-runtime相关业务adapter、知识/视觉worker组合；intelligence原generation bridge。
- ai-worker：Codex官方RPC/native transport及新增可复用文本/生图provider；provider-factory明确规格联合；原Worker runtime/entry以及structured/agentic/intelligence/video/asset/cover/transcribe/processing消费者；必要scope/metadata传递与测试。
- frontend：server/persistence-client现组合根及相关能力预检；四个knowledge API route和成片视觉旁路；copilot引擎偏好/订阅与settings引擎卡/模型配置视图；相应公共服务与浏览器旅程测试。
- 控制面：本SPEC与review、BACKLOG/taskctl、DEC、实际scope/complexity授权、架构中本次执行归属增量、必要任务packet和docs/verification/t1238证据。

物理owner继续为backend领域服务与execution_tasks；Worker不直连DB。原共享工作树有其它会话改动，本任务从原HEAD创建独立托管工作树实现；独立代理按互斥文件写集并行修复与测试，规格与最终验收由主代理汇总。不能重置或提交其它会话改动。新增模型transport复用已有官方随包runtime，不引入新依赖、数据库或执行循环。

## 界面合同

沿现有设置Dialog、AssistantEngineCard及品牌tokens，不探索新视觉方向。默认引擎选择绑定原偏好PATCH和GET，保存中防重复、保存失败保持已读服务值与可重试反馈；切Codex后展示真实登录及文本/生图能力，不显示需要另配模型的引导。模型配置视图中Codex不呈现文本/图片配置要求，保Pi配置数据并在切回时读回。正常1366×900与最小390×900检查相关区域；加载、未登录、能力不可用、失败、刷新与重复选择均真实操作。改实现前留现有组件/状态基线，主操作与焦点习惯保持。
