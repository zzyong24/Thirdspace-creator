# T1341：恢复素材详情对真实标签的读取

## 已发生事实与原证据

本任务承接用户T1300全功能修复与素材整理真实验收。Root已核13dd最终包的原素材63公开taxonomy标签159/usage1及实际详情页DOM/截图，要求独立登记，不以API采纳成功覆盖用户详情显示。当前只登记事实和待审最小设计，未START/无生产W。

包source `13dd66ceb3b296461b54f544b78aab3a08058b6b`，DMG SHA `922cb618742cf49d2487b7c41884e52c2880d1a076bb002ac018f929033ee9b7`；本轮owned主服务53768/user-913c490b-1/grp-913c490b-45，asset-913c490b-63经原真实素材任务132确认成功，tag-913c490b-159实际挂载。不得修改原标签/素材/调用或重发模型。

原只读诊断位于 `docs/verification/t1315/final-root/runtime/bound-final-13dd66ce/formal-ui-readonly/runtime/diagnostic-v1/run/`。正常1366×900的独立详情DOM及已实看截图显示标签“—”；最小桌面1024×680的原DOM也显示“—”，但v1截图未滚到标签，不能称该最小窗口标签画面已看见。图片960×540正确。原BEFORE/AFTER公共taxonomy与模型账本逐值不变，知识正文/sourceNote两窗口各通过。

**原v1 flow失败不能冒目标RED**：程序先错误要求详情panel含素材名，实际名称位于card，不在panel；其自然退出与超时是夹具假设失败，标签/自然尺寸硬断言未到。真实DOM/图所见tag缺失与该错误栈分列保留。B仅在新副本透明纠正名称定位后补目标断言，旧runner、RESULT/截图/锁不覆写；0业务写/0模型。

与T1075边界：原任务修tagTarget expectedVersion和生图proof；本任务是已真实写入taxonomy后素材详情读取投影缺失，不复写原写入/生图证明协议。

## 只读源码线索与待独审最小方向

`frontend/src/fixtures/selectors/assets.ts` 的 `buildAssetSummariesFromResources` 仍从 `canonicalDataset.entityTags/tags` 为真实assets.list资源行生成tags。这是现役消费者代码线索，需继续核实际assets-data→selector→列表/详情以及taxonomy权限端口；不能仅凭一个函数名认定全部根因。

候选方向是沿现有真实taxonomy授权，给素材列表/详情资源投影批量携带实际标签；不新增标签管理功能、不改标签写入/AI语义判断、不扩大workspace或跨组读权、不拿advanced标签管理页代素材详情。查询必须无逐asset额外请求的N+1；空标签诚实空，未知/拒绝沿原行为，不用fixture假标签回填。不为这项读投影顺改其它素材字段、契约或全局权限。

完整精确源与测试写集、批量端口/查询次数边界和现役合同见本次追加设计。Root独立评审后才支持test/runtime，真实目标RED与装配核后才授最小生产W；当前没有允许编辑的生产路径。

## 必要验收边界（设计待定，当前NOT_RUN）

- 原真实公口taxonomy assignment与素材列表→详情可见标签对应同asset/tag，正常及1024×680真实页面读取、返回/刷新一致，原图片/文件/描述/标签写口和模型calls逐值不变；无标签/多标签/真实中文名不丢。
- 同组真实身份、同user其它组、跨user、错asset/tag/归档及原taxonomy授权保护沿现有合同；不能用用户全域list拼跨组标签。
- 列表批量和翻页查询次数可核，不按每asset发额外请求；原canonical演示数据如仍用，只用于明确测试来源，不覆盖真实资源。
- 公共受控RED→最小读投影GREEN与必要类型/contract/边界/超时/孤儿/LED047范围；UI读不会发模型或改采纳结果。若最终包需更新，固定打包/新owned绑定后真实素材页再验；不能替换旧包静态文件冒原包通过。
- 沿原正请求/观察至少120000ms、保更长值；独立外层覆盖串行/启动/清理；原ID/旧FAIL/UNKNOWN全保。没有实际执行的结果保持NOT_RUN，最终正常/最小正式UI合同与report另按支持流程绑定。

本轮用户已授权功能修复，Root明确本窄问题无需重复用户确认；这不是技术方案PASS或实现授权。T1300原事实、13dd三族后台功能PASS、原material v1观察器错误与详情真实缺失分别记录。

## 2026-10-17 最小投影方案（独立设计审核输入，尚未START）

B已用新asset-only-v2透明副本修正panel-name前置，原标签期望保持。原素材63/tag159/usage1前后全等，两个窗口及刷新后四个实际标签断言均FAIL；运行inner1/10.3237s、outer1/13.3946s，CLOSED/DISPOSED、全部登记PID消失、afterdrift空。原v1/旧锁不改；V2_OUTPUT_INDEX位于原formal-ui-readonly/runtime/diagnostic-v1/asset-only-v2，SHA f95fb322996feef3ec721ce060706154423ee84cb17a52f710cfc1fd391755f4。此为真实13dd公共UI目标失败；后续受控服务/投影主链仍须准确输入锁及改产品前RED，不把两个证据类型互相冒充。

### 原合同上的 additive DTO 与安全降级

`AssetResource` 增加可选只读 `tags?: Array<{id:string,name:string}> | null`。`[]`仅代表实际成功读到0关联；null/旧DTO缺省代表未读到/不可用，不用canonical补值。没有新HTTP endpoint、表、迁移、写入或标签管理能力。

真实selector只映射该字段name到既有AssetSummary.tags，并透传可选tagsReadState为known/unavailable；明确的演示builder保其独立数据语义，不把演示标签贴到真实asset。真实已知空标签仍“—”，已知标签显示原真实中文名称，不排序/重写语义；unavailable仅标签区显示“标签暂不可用”，不新增按钮或把整页切错误态。标签搜索仍消费同真实tags，不能只修详情使列表搜索继续漏标签。

素材原list/get/search和原权限必须先成立，投影随后批量核实际可读ID，再取标签；原资产guard错误/跨user/scope/撤销不可被投影catch吞掉成可见实体。只对已经合法读到资源后的标签附加查询失败降级为null，并记录安全错误类型；保图片、预览、下载与导航正常。新增tag I/O不能反杀上一版可完成的素材浏览/下载。

### 有界批量与无递归

资产service新增内部有界readableAssetIds端口，调用本repo**同一个现役readableGate**+去重ID的IN查询，一批最多200；不能复制/重写/收紧现有grant/归属规则。原公开list/search最大100和分页保持。

taxonomy私有批量读取先通过这一个真实port过滤读权，再仅在entity_tags JOIN tags中按双方user、entityType=asset、这批可读asset IDs与实际tag ID关联一次取完，按assignment.createdAt/id稳定返回。没有资产就0条附加SQL；一批新增查询上界2条（一次同gate资产可读性复核+一次own entity_tags/own tags关联），与素材数量无关。原文件/回填查询另计，不声称全列表总共2条。禁止遍历每asset调用guard、逐asset网络/SQL、读取全user标签后反扫、Object.values寻找别组关联。

taxonomy的端口是可选typed内部依赖；未注入不能退回全user查询，该投影拒绝并使tags unavailable。真实persistence组合根必须注入同tx/现service端口。assets.service.get不反调taxonomy，避免taxonomy原guard→assets.get递归；asset transport的可选只读projection统一AssetResource出站，至少list/get/search一致，独立旧factory无port返回tags:null而非伪造[]。不改通用workspaceFilter、assets可读授权或taxonomy现写口的守卫/版本/CAS。

### 精确拟生产W（10件）

- contract/src/resources/assets.ts：只读tags摘要兼容字段。
- backend/src/modules/assets/assets.repository.ts：同readableGate的有界ID批量读取。
- backend/src/modules/assets/assets.service.ts：typed内部readableAssetIds端口。
- backend/src/modules/assets/assets.transport.ts：统一资源只读投影与安全降级，不改变原operation动作。
- backend/src/modules/taxonomy/taxonomy.repository.ts：有界实际关联JOIN。
- backend/src/modules/taxonomy/taxonomy.service.ts：先资产读权过滤的typed批量服务。
- frontend/src/server/persistence-client.ts：同实际服务根的只读端口薄注入，业务留backend。
- frontend/src/fixtures/selectors/assets.ts：真实资源只映射真实tags/状态，不fallback canonical。
- frontend/src/features/assets/assets-page.tsx：仅AssetSummary只读状态类型与同tags消费，不新增UI入口。
- frontend/src/components/resources/asset-detail-panel.tsx：标签区known标签/known空/unavailable三态，沿原tokens/布局。

assets-data分页、文件兜底与标签写口不改；无全局权限/新API/新schema迁移/Worker/模型路由/SDK/原call变化。出现额外实现路径先报准确delta，不能以“projection”泛扩。

### 必要主链、边界与交付

公共服务前RED须实际新owned素材/真实taxonomy tag及挂载→原assets.list/get/search→真实AssetResource→real selector/详情原consumer；权限/服务/投影不能mock成功。读投影精确测试、错误降级与query上界可用端口spy观测，但不代真实主链。保持原13dd UI目标RED；改源码后同服务链GREEN，再新固定包同真实素材场景正常/最小UI/列表搜索/详情/返回刷新，原source/media/模型calls不变。前瞻正式报告与allowlisted真实浏览器动作在执行前补准确合同，不靠hashcheck收尾。

测试矩阵至少含0/1/多资产标签、100条/两页/200去重上界与201拒绝、真实中文名、旧DTO未知、无标签真实空、repo故障unavailable且原素材/图片/下载可用；同gate授权共享资产与非法跨user/scope/撤销、foreign tag/错entityType/错asset关联不漏；list/get/search一致与查询次数无N+1。保持AssetResource其它字段、文件读取、标签写入权限/expectedVersion与AI采纳回执。

精确测试W与可执行预算见下，当前不授测试执行/生产。既有更长正执行/请求不缩，原持久task期限取min不续期；原UI observer预算6000/6600/8400秒保持。新owned key/库仅本轮隔离fixture，不复开主53768/旧UNKNOWN库；主服务直到真实素材尾验/来源交接完成由C唯一停。

### 精确拟测试W与实际预算

仅以下6件W，不授权tests glob：

1. backend/src/modules/assets/assets.repository.integration.test.ts：同readableGate的原grant/撤销/legacy与有界批量。
2. backend/src/modules/taxonomy/taxonomy.repository.integration.test.ts：双方own JOIN/空0query/1与100或200同附加常数查询/foreign tag拒绝。
3. backend/src/modules/assets/assets.contract.test.ts：真实transport list/get/search统一摘要，端口读取故障降级不伤原预览/下载。
4. frontend/src/features/assets/assets-data.test.ts：真实DTO→selector不受canonical同ID污染，真实空/省略/null状态。
5. frontend/src/features/assets/assets-page.test.tsx：现真实DetailPanel挂载标签三态及原?q标签过滤，不另造孤立假组件。
6. frontend/src/server/__module_integration__/asset-taxonomy-read-projection.persistence-client.test.ts（允许新增）：真实persistence/factory→dispatch→原资产权限→taxonomy批量→AssetResource→buildAssetsViewModelReal，不stub最终tags/guard。

受影响只读回归仅 backend/src/modules/assets/assets.service.test.ts、backend/src/modules/assets/asset-search.test.ts、backend/src/modules/taxonomy/group-taxonomy.integration.test.ts、frontend/src/features/assets/assets-interactions.test.tsx（四路径现场均存在）；不修改这些文件或重跑SDK/模型大套。

公共组合固定2个串行case，每case3600s、hook180s（最多4hook=720s）、startup与inner finally各180s，内串行完整上界2×3600+720+360=8280s；child9000s，独立outer10800s覆盖前后完整输入hash/setup/PGID清理。不以outer续业务单根，retry0/单worker，正public请求180000ms且原更长budget保持。其它回归按实际collection数量/原每it期限装配独立完整外层，锁前给实际命令与数学覆盖，不能拿同9000数字盖未核全suite。

case1在新owned filePGlite/media中真实公开建组/上传/PUT/completeUpload/创建taxonomy tag与assign→list/get/search→real VM/详情consumer/文件SHA，原hard/soft期望自然失败后保完整before。没有模型请求；若现役upload自然登记classify等AI任务，诚实保存原ID/状态且不启动worker/不伪0任务，不加suppress flag绕正常入口。case2沿真实公开migration preview/apply制造合法resource grant，再核目标组素材只读可见且原assign/remove拒绝，原groupResourceGrants previewRevoke/revoke后list隐藏/get拒，另crossuser/未授权组/legacy对照。migration装配未成功须列fixtureFAIL，不能用它冒目标RED；原已核group-taxonomy授权族可精确继承，但不能伪称该case公共迁移完成。产品前至少case1完整投影链须目标RED成立，权限附加族通过或精确已审同consumer继承后才签GREEN。

新增自有docs仅 docs/verification/t1341/{control,runtime}/** 和 IMPLEMENTATION_RESULT.md，原B v1/v2及13dd候选/原任务全RO。新外盘owned根待C精确授权，key仅fixture专用0600、日志不含auth/握手/原IPC临时fence；测试不能连当前主库。最终新包素材UI沿已证v2 observer的新副本+实际binding重验，0新model/标签写、知识已通过不重复。

### 现役agentic素材采纳回归的必要测试维护（额外3件精确W）

以下是当前发现的现役test源，不是改历史run/锁/旧索引：

- frontend/src/server/__module_integration__/agentic-task-tool-visibility.persistence-client.test.ts
- frontend/src/server/__module_integration__/agentic-knowledge-native-binding.persistence-client.test.ts
- frontend/src/server/__module_integration__/agentic-skill-catalog-isolation.persistence-client.test.ts

三份当前素材段在采纳前asset全DTO不变，采纳后也exactEqual旧DTO。新只读tags暴露了本次真实批准挂载，因此仅该字段必须变为本次批准集合，不能为了保持旧测试隐藏新摘要，也不能删掉整个asset隔离断言。

维护前保存三份原完整字节/SHA；采纳前仍asset全等；采纳后expected由beforeTags加本次正式receipt.tagId/proposal.tag的批准集合产生，先断言真实taxonomy等该批准集合，再对afterAsset.tags作稳定id/name集合等价核验，**其它asset字段逐值全等**。不能只使用实际taxonomy结果自证，也不能仅忽略tags不核值。原task合法重复confirm后asset与taxonomy两者全值不增不变，0新AI/模型；排序仅集合比对，不泛归一化其它字段。

执行仅上述3现役文件各自material受控分支（独立新label/0供应商），不重复collect/research/SDK大套。原公共主链和其它断言保持；具体3branch脚本/源码机械diff、实际case collection与外层数学界锁前给Root核。原T1334/35/37所有历史PASS/FAIL/快照/索引只读，不补写为新DTO版本通过。

三份material-only回归实际it当前均28800000ms（8h），不能套公共新2case的3600s上界而缩短它们。每文件通过现役T1334_CASES=material选择真实一个material it，保8h、原constraints.timeoutSec1800/maxTokens100000与持久deadline不变；独立global30600s、child34200s、独立outer36600s，含原hook180s、完整前后hash/启动和清理余量。三文件若外层串行监督，另总outer至少117600s=3×36600+7200总setup/hash+600总cleanup；不以单个36600覆盖3个8h。最终实际config/collection/命令和层级数学在装配锁里逐项核。旧输出index若直接引用这3现源，明确是当时字节的历史引用，恢复来源为修改前原字节snapshot+原commit；不得改旧index或继续声称其当前源引用0drift。
