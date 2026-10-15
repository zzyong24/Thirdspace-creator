# T1294 模型设置、向量消费者与常驻充值只读盘点

已读 T1294 SPEC、BACKLOG/PROJECT/PROJECT_CONTEXT、产品流程3.29.0（与项目一致）、项目 oil-ui-pro0.10.0、存量项目参考及T1022 UI_RULES。这是改动前的源码盘点与设计建议，不是实现或验收。正式源/测试/控制面写入0，未读密钥、用户数据库，未调模型/资金/外部服务，未重启App。当前Codex失败诊断由另一代理负责，本报告不重复推断根因。

保留现有紫色品牌 `#6d4aff`、画布 `#f8f9fc`、Noto Sans SC、14–16px正文、8/12/16px控件/卡片/面板圆角与24/20/16px间距，复用SectionCard、SettingsFormRow、Button、Input、既有选择控件，不改tokens或全局导航风格。只做当前模型页及充值/聊天入口局部调整。

## Root 已确认的默认判据

1. 非null、已保存的完整 `modelRouting.choices` 原样优先。包括旧 `vision/image` 混合来源与隐藏的embed字段，不为默认官方覆盖它们。
2. null且 `legacyExecutionEngine==='codex'`，视为旧明确Codex选择：text/vision/image为Codex，video/audio/embed为official。
3. 其它null默认全official。不能依据激活类别、SKU、catalog、`hasSecret`或旧密钥猜来源。旧Key/模型行原样保留，用户主动选self时仍可使用。
4. 一个纯backend policy复用于GET投影、`resolveRootExecutionRoute` 和 `prepareChatRouting`；不由UI自动PUT初始化null，不由GET写设置。新根使用上述effective选择冻结v2；已有可信父/v1/v2冻结路由优先，不能给在途任务改源或重发unknown。

现状：`settings.service.ts:576` 返回存储choices（可null）与revision；`persistence-client.ts:5790` 对null只投影 `{effectiveChoices:{},capabilities:[]}`；5845/5853对null走v1 legacy。只给下拉框填official会造成“屏幕官方、实际旧resolver”的分歧，必须同一policy贯通。`use-assistant-engine.ts:34` 当前以choices是否非null判v2，Root负责相应hook/cache接线；本代理UI候选不改该文件。

新GET投影只能依据真实已验签metadata生成状态；来源official不代表ready。官方未提供、无账户、未核实、暂不可用分开显示，不能拿catalog可选项或持有token合成可用。仍沿原PUT+expectedRevision CAS+GET读回，不清Key，不把一次bootstrap当运行模型ready。

## 图片：一处入口，保真实协议和旧mixed选择

现状 `model-capability-source.tsx:10` 六family把vision“图片理解”和image“图片生成与编辑”分开；`settings-model-region.tsx:24` 的self image又渲两张生成/编辑全表单。

设计只留四个可见用途：**文本、图片、视频、语音转文字**。图片只有一个来源选择，覆盖理解/生成/编辑；用户主动改图片来源时，同一次CAS把 `vision` 与 `image` 同设为official/self/codex。其它来源和隐藏embed保持原值。若原vision/image不同，下拉显示“当前分别设置”，并写清“理解：自配；生成/编辑：Codex”等真实状态；在用户未动此下拉前，保存文本等其它修改必须逐字保住旧二值，不暗中统一。

图片配置展开后只一个面板：

- 官方/Codex：一行理解、生成、编辑分别标真实状态；官方若缺编辑，不把生成可用冒充编辑可用。
- 自配：保“图片理解模型”与“图片生成与编辑模型”两组确有不同协议的必要字段；不是重复来源。理解真正用 `asset.classify` 的chat/vision接口，生成/编辑用image接口，不能把生图modelId或Key盲套理解请求。
- 编辑通常复用生成配置；原专用edit覆盖存在时，收在“高级：独立编辑配置”，保原行/草稿/Key，用户可主动修改，不自动清空或复制秘密。

**可以复用的原能力**：`backend/src/modules/ai-runtime/multimodal/resolve.ts:261–291` self image.edit在无专配/专用env时依次兼容 `image.generate`、`image.default`、`CREATOROS_IMAGE_*`。因此统一生成/编辑表单不需要新共同凭据系统，也不需要从服务端把旧secret读到前端。已有 `image.edit`/`image.edit.default`/`CREATOROS_IMAGE_EDIT_*` 优先级保留。`source==='official'` 未命中就明确拒绝，不能向self静默回退；原T831边界保留。

`createSelectedModelSnapshotReader` 实际复用原resolver并记录真正命中的row/env身份（capability-model-routing.ts:142–178），不是仅拿主model替所有用途。本轮不改图片适配器/Worker能力事实，不以界面合并改变provider支持范围。

## 向量：真实调用与完整停用边界

| 现存生产入口 | 实际路径/调用 | 仅删配置为什么不够 |
| --- | --- | --- |
| 知识库搜索 | `/api/knowledge/search` route:63 → knowledgeSearchRuntime.hybridSearch → runtime:101解析spec/105 embedTexts | 有旧self行或官方embed时仍会发模型请求。 |
| 创作/聊天知识上下文 | `backend/src/application/context/generation.ts:109` → 同一hybridSearch | 不打开知识页也能调用query embedding。 |
| 知识创建/修订 | `backend/src/application/knowledge.ts:53–73` 保存后index → runtime:82 scheduleBackfill →46/53解析与批量embed | 只搜索禁用仍会后台补向量。 |
| AI采纳知识 | `persistence-client.ts:7109` →同一个indexKnowledgeDocumentBestEffort | 仍触发后台补算。 |
| 原模型连接测试 | `settings-model-test-wrap.ts:464` knowledge.search.embed → resolveEmbed → embedProbe直接HTTP | 即使不显示向量卡，旧UI/CLI/API调用仍可发外部请求。 |

根 `persistence-client.ts:6556–6678` 现有legacy/self/official向量配置、按身份领取凭据和embeddingIO；6842装配模型测试resolveEmbed。无额外独立公开向量任务生产者被本次搜索发现；现有IO Worker/adapter仍可作为保留代码，不代表它们必须继续从公开链路接线。

完整建议：

- `knowledge-search-runtime.service.ts` 改为明确关键词路径，query和index均不调用resolveEmbedSpec、embedTexts、listMissingEmbeddings、fillMissingEmbedding；不scheduleBackfill。不要用“返回null但仍调resolver/排队”的半停用。
- 保现有 `searchService.hybridSearch(...queryEmbedding:null)` 的关键词分支或直接复用同一repo搜索；`search.service.ts:243` 原ILIKE命中、workspace权限、limit、历史recordSearch保留。现有 `semanticEnabled:false, semanticError:null` 响应兼容保留，不再提示“去配置语义模型”。创作上下文在无命中时原有list fallback保持。
- 根/knowledge应用组合解除embeddingIO与凭据解析接线；模型probe旧capability分支在请求网络之前返回清楚“已停用向量检索”的结构结果，零解析/领凭据/HTTP。普通文本、图、视频、ASR probe照常。关闭端口连接不等于移除所有历史类型或Worker文件。
- UI不渲embed来源/表单/必填规则，四可见行保存时隐藏embed沿用原值或policy默认，不能因六槽strict schema使四行永远无法保存。
- **不移除** `contract/src/internal/model-routing.ts` 的embedding mode、embed choices、catalog route或完整frozen v2 schema；不删旧模型行、向量列、embeddingIdentity、历史search_document/知识revision/用户库，不新增DROP/迁移。旧在途v2仍能parse。新公共消费者不发向量请求，不再把“未配向量”当失败。
- 原关键词索引更新沿原语义，不额外遍历清空旧向量。保留历史数据不等于继续用旧vector补位；本次公共query一律不提供queryEmbedding。

## RedFox：移动配置入口，保旧接口与深链

`settings-interactive-region.tsx:185` 数据服务Tab目前仅挂RedfoxConfiguration；194旧 `highlight=redfox` 映到data-services，378按该Tab挂载。移除这个独立Tab/面板/import，改映到models，在模型区挂一份RedFox密钥卡并保 `data-highlight="redfox"`。原 `/settings?highlight=redfox` 仍应自动切模型页、滚到同一可见卡，不增加重定向网络或第二份配置实例。

`RedfoxConfiguration` 原GET只返回configured布尔，PUT/DELETE沿原contract client；`contract/src/workspace-operation-scope.ts:313–315` 它是**user级**配置，不是组级模型配置，不应因搬页把Key归属迁成组级或复制Key。保password/new-password、提交后清输入、服务端加密与脱敏错误。现有初载alive只管卸载，save的finally无卸载fence；如新位置长期挂载而scope切换，UI应按当前scope销毁草稿/拒晚回写，但后端归属仍是原user。这个是前端展示隔离，不新增凭据权威。

## 常驻右上角充值：最终直接受控打开方案

Root最终收敛为 `frontend/src/features/settings/ai-credit-entry.tsx` 小组件：TopHeader共同位置永久挂入口，直接调用原openAiCreditCenter helper，局部opening/error、立即ref锁、防连点、卸载/切组abort、可达关闭与Esc取消、防晚connect/json/import打开。失败展示原受控错误，并提供显式 `/settings?highlight=ai-credits` 普通设置路由链接。**不新增Dialog/Card实例，不创建bootstrap表单或共享资金store。** 模型页仍唯一原额度卡，改成无条件可见，原AICR显式开通/原operation query/resume保持。

准确事实：SettingsReturnProvider只管capture/consume/epoch/焦点；Sidebar usePrimaryNavigation仍router.push，原settings route先RSC聚合读取后才渲SettingsDialog。没有虚构本地settings opener，最终无需修改AppShell/settings-return/navigation/原settings route。充值外链操作统一复用既有受控本地helper，不依赖来源/旧license/余额，不读取或显示虚构余额。

TopHeader:119共同header包含HeaderActions，后者按多个mode提前return，入口直接放共同header末端，覆盖global/project/search/overlay。用原Button outline，常驻不抢页面主动作；错误浮层有明确关闭/前往模型设置；未打开时不自动领session或发资金请求。点击开始后显示“正在打开…”和局部“取消”。

原 `open-ai-credit-center.ts:66–121` 已有group+account快照、AbortController、accounts-changed/storage、每个异步后assertCurrent、no-store/handshake/redirect:manual、fragment受控URL、取消不走浏览器fallback。小组件传 `{signal,isCurrent}`，scope改变与卸载让旧observer失效；关闭/Esc同样取消，焦点返回充值按钮。真正opener已派发后的既成打开不能撤销，保证其调用前核当前scope、取消后不再fallback或重复发起。

`settings-model-region.tsx:37` 原activation_managed filter已纳入候选改为无条件原Card，真实managedAccountStatus传入，不根据旧license隐藏；原not_configured的显式AICR入口继续可达。原bootstrap unknown的组件本地身份不会因新header复制第二实例而新增跨实例重发途径。

历史方案事实保留：原Card/Form的attempt、operation/ref、uncertain仅组件state/ref，关闭新Dialog卸载会丢原unknown UI身份，双卡也各有锁。此精确缺口是Root取消新Dialog的依据；本轮未修改该资金表单，也不把其原有跨重挂限制冒充已修。被取消的Dialog候选仅在ui-candidate的superseded文件中保留，不是当前应用清单。

## 聊天入口

`ai-copilot-content.tsx:2642` 只移除“在画布中打开”的Link及由此产生的无用import；保activeProjectChip项目引用、聊天正文、历史和其它画布/剪辑功能。hook/cache/Codex设置检查由Root与另一故障代理负责；此UI候选不删全部检查、不改任务/恢复协议。

## 有限建议写集（须Root正式审后串行应用）

本代理下一步UI候选为6个现有实际候选路径与Root明确的新小入口路径（RedFox组件原实现复用，未改源）：

1. `frontend/src/features/settings/model-capability-source.tsx`：四可见用途、图片mixed草稿/同次CAS、隐藏embed保值。
2. `frontend/src/features/settings/settings-model-region.tsx`：单图片配置面板、生成/编辑复用、RedFox新位置、官方真实状态。
3. `frontend/src/features/settings/multimodal-model-configuration.tsx`：必要时给原image表单调整标题/说明或内部advanced包装，不另造密钥系统；已有独立edit配置保留。
4. `frontend/src/features/settings/settings-interactive-region.tsx`：旧Tab删除与redfox深链映射。
5. `frontend/src/features/settings/redfox-configuration.tsx`：只读复用原实现，当前候选不改API/保存逻辑；如后续真实scope问题必须先补准确回归再扩写集。
6. `frontend/src/components/shell/top-header.tsx`：共同位置常驻Root确认的小充值入口，直接原helper；失败时显式设置路由。
7. `frontend/src/features/copilot/ai-copilot-content.tsx`：只去聊天画布Link，保引用。
8. `frontend/src/features/settings/ai-credit-entry.tsx`：新小入口，直接原helper；不挂第二Card。

Root另串行负责7个必要根/消费者路径：`backend/src/modules/ai-runtime/capability-model-routing.ts`（纯default policy，现index已export *无需改barrel）、`frontend/src/server/persistence-client.ts`（投影/两根及断向量IO/probe注入）、`backend/src/application/knowledge.ts`、`backend/src/modules/search/knowledge-search-runtime.service.ts`、`frontend/src/server/settings-model-test-wrap.ts`、`frontend/src/features/knowledge/knowledge-interactive-region.tsx`（去语义未启用/配置提示）、`frontend/src/features/copilot/use-assistant-engine.ts`/`assistant-engine.ts`（两文件由Root接cache/实际检查，计作一个职责但准确列两路径）。合计Root这组准确8源；不让UI候选覆盖Root hook/cache改动。

最终无需改channel-model-configuration.tsx或整个settings Dialog host；小入口同域测试 `ai-credit-entry.test.tsx` 已交，真实TopHeader+原helper通过受控fetch/opener夹具验证，零外部调用。

无需改SQL、历史contract/frozen schema、search.repository/service、token文件、Growth、模型provider/credential dispatcher。`open-ai-credit-center.ts` 原helper本轮保持；若发现实际缺陷需先以真实故障扩准确写集，不能为header重复实现它。

测试建议见 `WRITE_SET.json` 的同域既有测试路径。Root若需新增专门top-header或credit helper测试文件，先正式登记，不由本代理扩写集。本轮未写或运行任何测试，不记RED/GREEN。

## 设计简图与待真实走查

```text
全局页眉   [当前页面/项目]                  [原动作] [充值]
设置 · 模型
  按用途选择模型
    文本       [官方 ▼]    [配置]
    图片       [官方 ▼]    [配置]   理解/生成/编辑分别标真实状态
      原mixed：理解自配；生成/编辑Codex（主动选新值才统一）
      自配展开：理解模型 | 生成与编辑共用模型
                高级：原独立编辑覆盖（有则保留）
    视频       [官方 ▼]    [配置]
    语音转文字 [官方 ▼]    [配置]
  [保存来源] [重新读取]     CAS冲突保草稿
  RedFox API Key（原加密/掩码/归属）
  AI额度与消耗（原显式AICR开通/查询/恢复）
AI助手：原输入/图片/项目引用，只有对话，不显示画布跳转
```

源码走查结论：上述真实入口和缺口已定位。没有渲染、没有看当前截图、没有浏览器操作，**未验证实际视觉/保存/聊天成功**。后续隔离Playwright按1366×900、1280×800、1024窄窗及200%缩放留同数据前后图；检查四行控件、充值不挤主动作、Tab/Enter/Esc和焦点返回。

真实操作族：新用户official GET且无自动PUT；旧完整self/Codex不被覆盖；null旧Codex三用途保留；旧mixed只改文本后图二值保持，主动改图片同CAS统一；CAS409/PUT已受理但GET失败留草稿；图片编辑仅支持生成时诚实显示；保存/重开仍能取得旧Key状态；RedFox旧深链/保存/移除/失败/切scope；充值全header mode常驻，局部关闭/Esc取消并返回触发焦点；点击单在途、局部取消/切组/卸载与json/import晚回零打开，原unknown不重发；搜索、知识创建/修订/AI采纳/创作上下文/旧probe capability，全部embed resolver/凭据/Worker/HTTP计数0，关键词命中/历史数据仍在。Codex真实提交同任务完成由另一代理公共链验证，不把本报告当其PASS。

## 候选交付与真实证据归属

`docs/verification/t1294/ui-candidate/ui-layout.candidate.diff` 最后成功生成SHA `1181eef92ae797f293e3e484b85b9ab817d171b9c48ea99c9cb5551f322bafa0`，7源已由Root串行应用；本代理只读复核七份候选字节均与当前Main一致，未执行生产写。之后生成脚本的一笔提示文案修订因Python引号语法失败，未生成新files；原脚本仅历史生成记录，禁止对已应用源重新运行。

Root的实际 `ui-red.log` 为15FAIL/122skip，`ui-focused-green.log` 为15PASS/122skip；本代理读取原日志核对，仅引用这组结果，不代签全量/UI视觉/真实Codex。原six-row旧fixture失败真实保留；精确两测试迁移补丁 `tests/legacy-four-row-migration.candidate.diff` 保12→12及8→8的it声明、不删CAS/unknown/scope等族。Esc/关闭4例在 `tests/entry-close-followup.candidate.diff`，未由本代理运行。Root另跑的类型/边界/公共链，以其当前完整日志和退出码为准，不能把本代理7源syntax-only检查当类型或运行PASS。

此处是候选作者的事实/机械自检，不能作为自己候选的独立视觉评审。实际隔离浏览器和独立评审由Root另派，未在此报告冒充完成。
