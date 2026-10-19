# T-1023 公众号长文写作 Skill 与项目稿件闭环

> 用户要求多平台内容在系统内完成创作与查看。T-1018 已评审，T-1020 提供 `wechatOfficialAccount` 内容目标语义；本任务编码前仍须独立 SPEC 复审。方法来源为本机 `moonlit-wechat-article` v1.2.2 与 `moonlit-content-engine`；`moonlit-wechat-publisher` 只界定未来发布边界。本次不接微信草稿箱或群发。

## 用户能完成什么

用户在现有项目选择“公众号文章”目标，确认 Brief 和素材后生成长文候选；逐段审读、采纳或保留原文，保存为可回读的项目文章版本。文章预览、引用来源和配图清单随版本保存。没有绑定公众号平台账号仍可写作和本地预览；只有后续独立发布任务才需要公众号授权。系统不得用 `wechatVideo` 冒充公众号文章。

## 方法包、品牌与归属

从源 Skill 提炼“主张 → 事实/经历 → 因果 → 正文 → 逻辑审读 → 视觉简报”的通用、版本化方法。事实不足时输出待确认项，不编经历、来源或成效。逻辑审读在可选的去 AI 味改写前执行；可选环节失败时已生成正文仍可审读和保存。导入时记录源 Skill 版本、文件来源、许可/归属；逐一审查脚本，不能因为源目录含 `scripts/` 就允许执行。

项目文章始终属于当前项目的真实 `userId + accountId`，公众号平台绑定可为空。目标平台只说明写作形式，不取得另一个账号的数据权限。月明身份、宇航员线稿、绿色品牌和 `works/YYYY` 文件路径作为该 CreatorOS 账号显式选择的品牌配置版本；后端按项目账号核验品牌 profile 的 owner、选用状态及版本，再向模型提供冻结快照。无配置时使用中性通用方法，不能从平台枚举、项目标题或本机路径推断月明品牌；切换账号不得沿用前号品牌快照。源路径仅用于迁入方法，不是每个用户的输出位置。

## 文章锚点与候选采纳合同

文章产物使用 `contentType=article`。`projects.outputs.create` 增加可选 `contentType` 和 `clientRequestId`；旧请求省略类型仍默认 `video`，文章入口显式传 `article`。后端核验当前用户与账号拥有项目、请求类型为 `article`、目标平台语义为 `wechatOfficialAccount`；现有项目允许同时拥有视频与文章产物，不以不存在的项目级内容类型拦截。正文保存在关联该 output 的专用 `wechat_article` Artifact（扩展 `artifactType` 枚举），不挤占视频 `output_script`；同一项目账号和 output 只允许一个当前文章锚点，重复 `clientRequestId` 返回原 output/Artifact，创建过程失败时不留下无法回读的孤儿。当前版本的 `contentData` 使用版本化文章结构：`schemaVersion`、标题、摘要、稳定 `sectionId/order/heading/body`、待确认事实、引用的真实项目/素材 ID 与版本、视觉简报、配图使用清单；`contentText` 是从同一结构确定性渲染的完整正文。首次创建写一个空稿版本，后续版本只追加，不覆盖历史。读取按项目账号同时核验 output、Artifact、素材及版本归属。

AI 只保存候选结果：`candidateId, projectId, outputId, artifactId, baseVersionId, methodVersion, brandProfileVersionId|null, proposedTitle, proposedSummary, proposedFactItems, proposedSections, proposedVisualBriefs, sourceRefs`。每个候选段明确 `op=insert|replace`、稳定 `sectionId`，插入时另给 `afterSectionId|null`；后端校验新 ID 不与当前稿冲突、替换 ID 必须在基准稿存在、插入锚点必须唯一存在或为首段。标题、摘要、待确认事实均带候选值和引用，不把未经核实的事实写成已确认陈述。候选及其输入引用版本不可变，生成不更新 `currentVersionId`。空稿首次采纳只能使用 insert，在一次事务里按候选顺序建立段落；后续可插入或替换。用户发起采纳时分别选择段落 `selectedSectionIds` 和元数据字段 `selectedMetadataFields=title|summary|factItems`，请求携带 `candidateId, expectedCurrentVersionId, clientRequestId`；全不选时拒绝空操作。后端重新读取当前版本、候选、账号及引用，用 CAS 在一笔事务中只落实所选段及对应引用、视觉简报与所选元数据字段；未选段、未选元数据字段、其引用和已选配图原样保留。若选 `factItems`，用候选的完整待确认事实清单替换旧清单，UI 先展示差异并要求确认；若不选则保留原清单。空稿 UI 的“全文采纳”默认选标题、摘要、待确认事实与全部段落，但仍须用户明确确认。相同锚点的多个插入按候选冻结顺序排列，不用时间或标题猜顺序。同一账号同一 `clientRequestId` 重放返回同一新版本；候选基准过期、选区不唯一或素材归属变化返回冲突，界面引导重新审读，绝不静默覆盖新稿。普通手工编辑沿既有 `expectedCurrentVersionId` 保存门；刷新后从 Artifact 当前版本及版本列表回读标题、摘要、待确认事实、段落及对应引用。

## 配图交接与预览

视觉简报只是待制作建议，不能显示为已生成图片。正文段落可复用当前账号的已有 Asset；缺图时通过现有授权的图片生成端口创建候选 Asset，用户审看并选用后才进入文章使用清单。月明账号明确选宇航员线稿时才调用对应配图 Skill；材料图用独立材料配图 Skill，真实截图须来自实际产品或资料。图像生成或审看失败只把该项标为待配，正文仍可保存与预览。

文章版本的使用清单按段落记录 `sectionId, assetId, assetFileId, sourceKind, reviewState=selected`，可另存未选用的 `visualBrief` 和 `proposedAssetId`。候选图先经现有 `assets.commit` 成为可用的 active Asset，用户审看确认后才可选入清单；pending/failed/已删除素材不能选入。新增按 `assetId + assetFileId` 读取不可变文件预览的服务端端点，先以当前账号核验 Asset，再核验该 file 确属同一 Asset 并可读；旧文件仍在则按旧版本展示，已失效则在该文章版本标图不可用，绝不悄悄回退到 Asset 的新 `currentFileId`。现有只读当前文件的 `assets.downloadUrl` 保持旧语义。图片替换只新增文章版本，不改旧清单。每次刷新从已保存版本重建预览和清单，不从源工程 `visual-manifest.json` 或本机文件路径猜测。导出到源 Skill 格式是可选本地导出，由同一清单生成，不复制或改写原素材。

## 发布边界

文章预览和本地导出不调用微信草稿或群发 API，不展示无效的“写入草稿箱/发布”按钮。草稿箱、更新与群发须另立发布 SPEC，确定账号资格、用户确认、状态转移、幂等和真实回执后才能开放。

## 验收

- 同一选题分别用月明品牌账号和无品牌账号生成候选：前者使用明确选定的品牌版本，后者无月明身份、宇航员和私有路径；跨账号品牌/素材/候选 ID 均拒绝。无公众号绑定的文章项目仍能保存、刷新、回读和本地预览。
- 旧 `projects.outputs.create` 仍建视频；同一项目可并存视频与公众号文章 output，文章入口显式建文章 output 与唯一 `wechat_article` 锚点，重复请求及中途失败不会造第二篇或孤儿。候选未采纳不改变当前版本；空稿 insert、后续 replace/insert 只改变所选段及其引用，标题、摘要和待确认事实按用户逐项确认采纳，未选旧值保留；重复请求幂等，旧基准、并发手工保存和错账号请求拒绝覆盖。版本列表、标题、摘要、正文、事实待确认项和来源版本刷新后一致。
- 视觉简报、待配图、候选图与已选图片分别显示；候选图须 commit 且用户确认后，已选 `assetId + assetFileId` 才进入预览。换图后旧版本仍指向旧文件；旧文件失效显示不可用，不偷读新图。缺图或可选去 AI 味失败不阻断正文保存。
- 项目创建、方法候选、用户采纳、文章版本与预览在隔离数据库及浏览器走完整流程；再用本机实际模型与两账号做真机验收。仅写作不触发草稿/群发请求。安装版、模型与外部平台未实测时不得由单测代记通过。
