# T-1029 结果优先创作工作台服务合同

状态：独立服务合同终审 PASS；产品范围以 T-1029 SPEC、DEC-WORKBENCH-1029 为准。2026-09-30。

## 数据真值和边界

项目是账号下的创意容器；一个项目有多个 output。output 的 `contentType=video|image|article` 与可空 `targetPlatform` 分开存。旧 output 的目标平台仍为 null；只有显式平台化动作才要求目标。账号、项目、output 均由后端重读，不能信客户端传来的 accountId。文章首屏本地写作无需公众号绑定或完整 Brief；平台发布仍按真实授权能力判断。

新图文 output 创建事务同时建立唯一 `graphic_post` Artifact 和空版本，且建立锚点唯一约束 `(accountId,outputId)`。`graphicPosts.get` 纯读取，不隐式创建。图文正式文档为 `{schemaVersion:1,title,body,summary,tags,imageUses:[{assetId,assetFileId,order,role}],sourceRefs,ruleSnapshotRef}`，所有字段允许空值，`role=cover|card`，图像引用只接受已激活、同账号的文件版本。Artifact 版本不可变，当前指针 CAS。视频正式口播继续归 `output_script`，公众号正文、标题和摘要继续归 `wechat_article`，平台标题、简介、标签归对应平台的 PublicationRevision。图文 title/tags 属于 `graphic_post` 主稿；发布平台的同名字段是独立发布修订，不静默同步。

`creativeResults` 是 application 编排层，只保存不可变的 `{resultId,accountId,projectId,outputId,targetPlatform?,kind,typedCandidateRef,baseVersionId,ruleSnapshotRef,sourceRefs,requestDigest,createdAt}` 索引。候选正文的唯一 owner 是对应的图文、文章、视频或发布模块；不在编排层另存候选正文。候选只由 AI/worker 产生，用户显式采纳才由后端 owner 写正式版本。索引与底层候选在同一事务或 durable outbox 中建立；失败不得出现可采纳的悬空索引。

## 允许矩阵与字段消费者

矩阵中“允许”表示可请求生成候选；具体能力须先为 supported。所有未列出的组合（包括 article 的 tags、image/video 的 `body` 交叉等）返回 `UNSUPPORTED_DELIVERABLE`。`platform=null` 表示平台无关主稿；只有目标平台行生成发布物料。小红书允许 image 和 video，抖音/快手允许 video，公众号允许 article。平台不改变用户显式选择的作品形式，平台和类型不匹配返回 `UNSUPPORTED_OUTPUT_TYPE`。

| outputType / targetPlatform | kind | 候选唯一 owner → 正式字段 | 采纳 operation 与 CAS |
| --- | --- | --- | --- |
| image / null 或 xiaohongshu | title, body, summary, tags | `graphic-posts` → `graphic_post.title/body/summary/tags` | `graphicPosts.candidates.adopt` → Artifact expectedCurrentVersionId |
| image / null 或 xiaohongshu | cover, image_card | `graphic-posts` 媒体候选，引用既有 assets 任务 → `graphic_post.imageUses` | `graphicPosts.mediaCandidates.adopt` → Asset 确认 + Artifact expectedCurrentVersionId |
| video / null 或 douyin、kuaishou、xiaohongshu | script | `scripts` → `output_script` 现有段落/结构 | `scripts.candidates.adopt` → 现有脚本版本 CAS |
| article / null 或 wechatOfficialAccount | title, body, summary | `articles` → `wechat_article.title/sections/summary` | `articles.candidates.adopt` → Artifact expectedCurrentVersionId |
| article / null 或 wechatOfficialAccount | cover, image_card | `articles` 媒体候选，引用 assets 任务 → `wechat_article.visualBriefs/imageUses` | `articles.mediaCandidates.adopt` → Asset 确认 + Artifact expectedCurrentVersionId |
| image / xiaohongshu；video / douyin、kuaishou、xiaohongshu | publish_title, description, publish_tags | `publishing` → `PublicationRevision.title/description/platformTags` | `publications.candidates.adopt` → expectedCurrentRevisionId；无 Publication 时使用 output+platform 唯一首版 CAS 创建 |
| image / xiaohongshu；video / douyin、kuaishou、xiaohongshu | publish_cover | `publishing` 媒体候选 → Publication.coverAssetId | `publications.mediaCandidates.adopt` → Asset 确认 + expectedCurrentRevisionId |

“生成简介”“生成标签”在视频作品 UI 指向 `description/publish_tags`；图文主稿的“摘要/标签”指向图文行，发布卡另称“发布简介/发布标签”。公众号“配图/封面”只有具备 output 绑定的媒体端口后才可用。不能把当前 `publish.package` 的默认 output/抖音实现用于其它平台；旧入口保持兼容。

## 操作、状态和幂等

1. `projects.outputs.create({title,contentType,targetPlatform?,clientRequestId})`：省略类型默认 video。targetPlatform 必须属于统一 platformId；验证已选账号拥有 project，平台与类型满足矩阵。返回 ContentOutputResource 加可空 targetPlatform。同一项目、key、输入摘要返回同一 output；摘要不同 409。
2. `graphicPosts.get({outputId})` 返回 `{artifactId,currentVersionId,document,versions}`。新建 output 已有空稿；非 image/跨账号 404。 `graphicPosts.versions.create({outputId,expectedCurrentVersionId,document,clientRequestId})` 验证全部图片文件和来源归属，以 Artifact CAS 写版本；同 key 同 digest 回原版本，异 digest 409。
3. `creativeResults.generate({outputId,kind,targetPlatform?,clientRequestId,sourceItemId?,ruleOverrides?,bundleId?})` 先检查矩阵和能力，解析当前账号正式规则和来源，冻结 `baseVersionId/ruleSnapshotRef/sourceRefs`，调用矩阵指定 owner 的生成端口。返回 `{resultId,taskId,typedCandidateRef,status}`。省略 targetPlatform 继承 output.targetPlatform；显式值只能与非空 output.targetPlatform 相同，冲突返回 `TARGET_PLATFORM_MISMATCH`；output 为 null 时仅可在矩阵允许的平台中显式指定，平台化结果不反写 output。 同账号、output、key 同 digest 回同一 result；异 digest 409。失败前若有持久任务，重试先按 key 查询，不重复生成。
4. `creativeResults.list({outputId,bundleId?,cursor?,pageSize<=50})` 和 `get({resultId})` 先验账号/output，返回 owner 候选的真实状态、字段值、来源及错误。状态 `queued|running|awaiting_confirmation|succeeded|failed|cancelled|adopted`；游标稳定按 createdAt+resultId。失败候选不可采纳，旧正式版本不变。
5. `creativeResults.adopt` 是按 owner 判别的联合请求：稿件为 `{resultId,expected:{owner:"graphic_post"|"output_script"|"wechat_article",versionId},editedValue,clientRequestId}`；已有发布物为 `{resultId,expected:{owner:"publication",mode:"existing",publicationId,revisionId},editedValue,clientRequestId}`；首次发布物为 `{resultId,expected:{owner:"publication",mode:"create",outputId,platform,expectedAbsent:true},editedValue,clientRequestId}`。与 result owner 不一致为 `OWNER_MISMATCH`。响应同样判别为 `{owner:"graphic_post"|"output_script"|"wechat_article",versionId,resultId,status:"adopted"}` 或 `{owner:"publication",publicationId,revisionId,resultId,status:"adopted"}`。首次发布的 `(accountId,outputId,platform)` 唯一索引+事务 CAS 保证两人并发只能创建一个；输者得 `VERSION_CONFLICT` 并重读现有 publication。 `editedValue` 按 kind 判别为 text、string[] 或 imageUses[]；后端重查 candidate/result/output/account、baseVersion 和素材，绝不跨字段写。同 key 同 digest 回原采纳回执，异 digest 409。
6. `creativeResults.bundles.create({outputId,items:[{kind,targetPlatform?}],clientRequestId})`：后端仅编排，每项调用上述单项端口，`bundleId` 与 item 的确定性 key 在 DB 持久化。同 key 同 item 集返回原 bundle；不同集合 409。 `bundles.get/list` 返回每项 resultId、状态、错误与 `queued|running|complete|partial_completed|failed|cancelled` 汇总；部分成功立即可读、编辑、采纳。刷新从服务端 bundleId 重建，不依赖浏览器临时内存；重试仅重启失败项，并复用 item 幂等键/原成功项。
7. `creativeCapabilities.list({accountId,projectId?,outputId?})` 为唯一创作可用性入口，逐 `platform × outputType × kind` 返回 `supported|known_unavailable|unknown`、稳定 `reasonCode` 与 lastVerifiedAt。由后端读取已注册生成端口、当前模型配置、素材执行能力和平台发布能力（`platforms.capabilities.list`），不能从 enum 推断。已知未接线为 `known_unavailable/ADAPTER_NOT_READY`，尚未核验为 `unknown/NOT_VERIFIED`；缺绑定仅影响发布，不阻断本地写作。generate/adopt/发布操作再次校验实时能力，前端按结果显示可用或原因。

错误码固定：`OUTPUT_NOT_OWNED`、`UNSUPPORTED_OUTPUT_TYPE`、`UNSUPPORTED_DELIVERABLE`、`TARGET_PLATFORM_MISMATCH`、`OWNER_MISMATCH`、`CAPABILITY_UNAVAILABLE`（附 reasonCode）、`SOURCE_UNAVAILABLE`、`CANDIDATE_NOT_READY`、`MEDIA_BINDING_MISMATCH`、`ASSET_NOT_CONFIRMED`、`VERSION_CONFLICT`、`IDEMPOTENCY_CONFLICT`。归属错误对外用 404，不泄露其他账号是否存在。

### 状态机与恢复

单项合法转换：`queued→running|failed|cancelled`；`running→awaiting_confirmation|succeeded|failed|cancelled`；`awaiting_confirmation→adopted|failed|cancelled`；`succeeded→adopted`。文字候选可以直接 `running→succeeded`；媒体生成有真实文件并完成绑定校验后进入 `awaiting_confirmation`，可预览、可调用 media adopt，但尚未加入正式稿。media adopt 在同一可恢复流程中先调用既有 Asset 确认、再执行 owner CAS；两步完成后直接 `adopted`。普通文本 adopt 只接受 succeeded。adopted 是结果终态。failed/cancelled 不修改旧 result；`creativeResults.retry({resultId,clientRequestId})` 建立新 resultId/new task，`retryOf` 指旧 result，复用相同 output/kind/上下文快照且重查能力；同 key 重放回同一新 result。旧结果供审计和刷新阅读，不可采纳。

Bundle item 引用一个当前 resultId，重试时仅将失败 item 指向新 resultId，保存旧 retry 链。按下列顺序派生汇总：全 queued 为 queued；全 cancelled 为 cancelled；全 succeeded/adopted 为 complete；全部为 failed/cancelled 且至少一个 failed 为 failed；无 queued/running 而存在 awaiting_confirmation 时为 running（等待用户采纳媒体）；存在任意 queued/running，且已有 succeeded/adopted 与 failed/cancelled 并存时为 partial_completed；存在任意 queued/running 的其余组合为 running；没有 queued/running/awaiting_confirmation，且成功与失败并存时为 partial_completed。awaiting_confirmation 可预览、可单独 media adopt；adopted 计为成功。无需 skip 操作，用户可以保留候选不采纳，bundle 此时如实保持 running。bundle 状态由服务端 item 状态派生，不手工宣告完成。刷新先读 `bundles.get`，再按 resultId 读候选；不可只依赖 sessionStorage。

### 新增操作的具体样例与权限

下列 ID 为说明字段形状的示例。除 `creativeCapabilities.list` 的已登录账号读取外，所有操作都要求登录用户、当前账号与 project/output/result 的服务端归属链相同；list/get 也要验归属。写操作有 account 作用域的 clientRequestId 幂等键。跨号一律 404 `OUTPUT_NOT_OWNED`，不可据错误区分资源存在。

| 操作 | 请求 → 正常响应例 | 额外错误/调用者 |
| --- | --- | --- |
| `projects.outputs.create` | `{projectId:"p1",title:"秋季图文",contentType:"image",targetPlatform:"xiaohongshu",clientRequestId:"k1"}` → `{id:"o1",contentType:"image",targetPlatform:"xiaohongshu"}` | 当前账号项目用户；类型冲突 `UNSUPPORTED_OUTPUT_TYPE` |
| `graphicPosts.get` | `{outputId:"o1"}` → `{artifactId:"a1",currentVersionId:"v1",document:{title:"",body:"",summary:"",tags:[],imageUses:[]},versions:[{id:"v1"}]}` | 项目用户只读；非 image 返回 `UNSUPPORTED_OUTPUT_TYPE` |
| `graphicPosts.versions.create` | `{outputId:"o1",expectedCurrentVersionId:"v1",document:{title:"秋季穿搭",body:"正文",summary:"",tags:[],imageUses:[]},clientRequestId:"k2"}` → `{versionId:"v2",document:{title:"秋季穿搭",body:"正文",summary:"",tags:[],imageUses:[]}}` | 项目用户写；旧版 `VERSION_CONFLICT` |
| `creativeCapabilities.list` | `{accountId:"acc1",outputId:"o1"}` → `{items:[{platform:"xiaohongshu",outputType:"image",kind:"tags",state:"supported",reasonCode:null,lastVerifiedAt:"2026-09-30T00:00:00Z"}]}` | 当前账号用户只读；无法验证为 `unknown/NOT_VERIFIED` |
| `creativeResults.generate` | `{outputId:"o1",kind:"tags",clientRequestId:"k3"}` → `{resultId:"r1",taskId:"t1",typedCandidateRef:{owner:"graphic_post",id:"c1"},status:"queued"}` | 项目用户写；未接线 `CAPABILITY_UNAVAILABLE/ADAPTER_NOT_READY` |
| `creativeResults.list/get` | `{outputId:"o1",pageSize:20}` → `{items:[{resultId:"r1",status:"succeeded",kind:"tags",value:["秋季"]}],nextCursor:null}`；`{resultId:"r1"}` → 同一 item | 项目用户只读；未知 ID 404 |
| `creativeResults.adopt` | `{resultId:"r1",expected:{owner:"graphic_post",versionId:"v1"},editedValue:["秋季"],clientRequestId:"k4"}` → `{owner:"graphic_post",versionId:"v2",resultId:"r1",status:"adopted"}` | 项目用户写；版本冲突 `VERSION_CONFLICT` |
| `creativeResults.adopt` 媒体 | `{resultId:"r4",expected:{owner:"graphic_post",versionId:"v2"},editedValue:[{assetId:"as1",assetFileId:"f1",order:0,role:"cover"}],clientRequestId:"k4m"}` → `{owner:"graphic_post",versionId:"v3",resultId:"r4",status:"adopted"}` | 只接受 awaiting_confirmation，先 Asset 确认再写版本；任务/文件不符 `MEDIA_BINDING_MISMATCH` |
| `creativeResults.retry` | `{resultId:"r0",clientRequestId:"k5"}` → `{resultId:"r2",retryOf:"r0",taskId:"t2",status:"queued"}` | 项目用户写，仅 failed/cancelled 可重试；否则 `CANDIDATE_NOT_READY` |
| `creativeResults.bundles.create` | `{outputId:"o1",items:[{kind:"title"},{kind:"cover"}],clientRequestId:"k6"}` → `{bundleId:"b1",status:"queued",items:[{kind:"title",resultId:"r3",status:"queued"},{kind:"cover",resultId:"r4",status:"queued"}]}` | 项目用户写；不支持项 `UNSUPPORTED_DELIVERABLE` |
| `creativeResults.bundles.get/list` | `{bundleId:"b1"}` → `{bundleId:"b1",status:"partial_completed",items:[{kind:"title",resultId:"r3",status:"succeeded"},{kind:"cover",resultId:"r4",status:"failed"}]}`；`{outputId:"o1"}` → `{items:[{bundleId:"b1",status:"partial_completed"}],nextCursor:null}` | 项目用户只读；跨号 404 |

## 媒体真值绑定及确认顺序

新 output 媒体请求由后端持久写 `output_media_attempts`：`(accountId,projectId,outputId,kind,taskId,candidateId?,assetId?,assetFileId?,clientRequestId,requestDigest,createdAt)`，`taskId` 全局唯一且绑定的 `outputId` 不可更新。先重读 output 与账号，创建服务端任务及绑定，再调用既有 `asset.generate`/封面执行端口；若现有端口仅收 projectId，增加可信 `outputId` 上下文并让执行任务 owner 指向该 output，项目级旧调用照旧。媒体任务回执不得由客户端自报候选 ID 建立绑定。

get/adopt 时通过绑定记录和执行任务双向验证 `task.owner→output→project→account`，再验证真实 candidate、Asset、AssetFile 均同账号且对应同一 task/result；生成终态成功且文件可用才能预览为“已生成”。采纳先用现有 Asset 服务确认候选并获取激活文件，后用正式稿/Publication CAS 加引用；两步需事务或可恢复的采纳状态及幂等回执，CAS 失败时已激活 Asset 保持可用但未进入作品，重试不二次确认。未形成真实文件只显示“待生成/失败”，不以提示词或建议图冒充成品。

## 规则、来源与可行性（Gate 15b）

`targetPlatform` 写入 output，消费者是 `creativeCapabilities.list`、`creativeResults.generate` 和 `publishing` 的发布能力重检。 `ruleOverrides` 由 backend 创作编排读入、验证大小/归属并冻结到任务快照，worker prompt 构建器实际消费，结果返回 `applied|not_applied` 与版本 ID；缺规则可以生成通用候选，禁止伪称应用品牌。 `sourceItemId` 由 intelligence service 按当前账号读取 source snapshot/可用正文，不能仅传 URL/标题。没有来源时用项目主题生成，并明确标记来源未用。

政策字段消费者落点（2026-10-01 复核；以下为已落地代码，实际运行验证状态见验收记录）：

| 字段 | 写入 owner | runtime 消费者 |
| --- | --- | --- |
| `targetPlatform` | `backend/src/modules/projects/projects.service.ts:1443` | `backend/src/modules/creative-results/creative-results.service.ts:174` 的能力矩阵与发布 owner 的平台校验 |
| `ruleOverrides` | `backend/src/modules/creative-results/creative-results.service.ts:108` 纳入请求摘要并转交 owner | 图文、文章、发布文案 owner 分别验证、冻结并交 Worker；不支持的项目明确拒绝 |
| `ruleSnapshotRef` | 图文、文章、发布文案 owner 冻结当前正式规则 | `backend/src/modules/creative-results/creative-results.service.ts:63` 返回 provenance；采纳时 owner 验证冻结版本归属 |
| `sourceItemId` | `backend/src/modules/creative-results/creative-results.service.ts:108` 转交 owner | `frontend/src/server/persistence-client.ts:2823` 图文真源读取，`:3016` 视频完整逐字稿读取；未取得正文不生成假引用 |

| FR | 来源 / owner / 保存与读回 | 判定与冷启动验证 |
| --- | --- | --- |
| FR-1029-1 | projects 的 project/output 表；新增 image/targetPlatform 经 createOutput、getOutput、listOutputs | feasible，旧行可空；首次 image 创建空 Artifact 与 output 同事务，跨号验证触发 |
| FR-1029-2 | 图文 `backend/src/modules/graphic-posts/`、文章 `backend/src/modules/articles/`、视频 `backend/src/modules/output-scripts/`、发布 `backend/src/modules/publishing/` 分别持有正式稿和候选 | 单项合同、Worker、采纳及刷新回归已接通；真实模型端到端在验收库未验证 |
| FR-1029-3 | `backend/src/modules/creative-results/creative-results.service.ts:286` 保存 bundle manifest，结果仍归各 owner | 集成测试制造一项成功一项失败，读回 `partial_completed` 并保留成功项 |
| FR-1029-4 | 定位规则由图文、文章和发布 owner 冻结、交给 Worker；不支持规则覆盖的项明确拒绝 | 目标测试通过；有/无正式规则的真实模型对照仍待验证 |
| FR-1029-5 | `backend/src/modules/intelligence/` 负责来源归属；图文和视频 owner 冻结真实正文/逐字稿 | 真源不可用会拒绝；当前临时账号雷达为空，来源端到端未验收 |
| FR-1029-6/7 | `backend/src/modules/creative-results/` 保存媒体任务绑定；图文、文章、视频 Artifact 与 Publishing 各自执行 CAS | 跨账号、过期版本、媒体文件归属和刷新恢复目标测试通过；真实双账号页面仍待验收 |

画布、旧视频制作/审核/预测/复盘、雷达研究详情仍沿原 owner 和深链，工作台只重排入口。没有真实能力的按钮隐藏或显示明确不可用原因，绝不调用空处理器。
