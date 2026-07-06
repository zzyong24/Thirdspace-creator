# CreatorOS 用户视角走查 + 逐控件测试报告

> 方法:真实启动项目(Postgres + Next.js 16 + http://localhost:3000),以**普通创作者 + 细致测试工程师**双重身份,在浏览器实际操作——点击、填表、AI 对话、采纳、立项、建项目、切主题、存偏好、跑采集。日期:2026-07-05。分支:`feat/make-it-runnable`(所有测试改动都在子分支,main 未动)。
> **结论先行:项目真能跑,创作侧 + AI 完全能用且质量高;唯一硬伤是采集(数据回流断)+ 账号状态误导,外加一批文案/交互细节问题。**

---

## 一、✅ 已验证能用(实测通过)

| 项 | 验证方式 | 结果 |
|---|---|---|
| 启动 | db:up + Next dev + 打开 | 一次成功,8 主页全渲染,dispatch 全通,**全程零 console 错误** |
| **AI 出题** | 让 AI 出"AI 效率工具"选题 | 调 minimax 出 **8 条专业选题**(带潜力分 84-95/类型/切入/理由/采纳门) |
| **核心创作链路** | 实操走一遍 | AI 出题 → 采纳 → 候选池 → 立项 → 建项目 → 两阶段稿面,**全链路真实落库** |
| 建项目(两路径) | 立项 + 手动模态 | 都成功;模态含画幅(横/竖屏)+ 创作模式(AI全流程/协作/手动) |
| 复盘阶段 | 导航到 /review | 可访问,诚实空态(暂无明细→去采集 / 未盲预测→去盲预测)+ 内嵌编导对话 |
| 设置·账户 | 改昵称→保存 | 真持久(PATCH /me,侧栏立即更新) |
| 设置·偏好 | 切换开关 | 开关正常工作 |
| 设置·外观 | 选"深色" | 暗色模式正常(data-theme=dark,背景变深,可读) |
| 设置·模型配置 | 读输入框 | minimax/MiniMax-M3 正确显示,**密钥正确 mask 为「已配置(留空不变)」** |
| 设置·技能 | 点技能展开 | prompt 可查看/编辑(system+template 两个 textarea) |
| 设置·存储 | 读配置 | 路径可配、真实磁盘容量 494GB、分类用量 |
| 账号切换器 | pointer 点击 | 弹出「绑定新抖音号」入口(正常) |
| 全站空态 | 各页 0 数据 | 一律诚实空态,无假数据糊弄 |

**总评:创作引擎是真的、活的、专业的。** 一个创作者现在打开就能:填定位 → AI 出选题 → 采纳 → 立项 → 写脚本(AI 辅助),体验流畅。

---

## 二、🔴 严重问题(影响可用性 / 误导用户)—— 三条全部已修复

> **修复批次**:线 A(采集+账号,commit `T-144 采集抓不到数据根因`)+ 线 B(搜索实时,commit `fix(search): 搜索索引实时化`),均在 `feat/make-it-runnable` 子分支,main 未动。搜索已 live 验证;采集端到端待用户真机扫码验。

### 1. ✅ 采集静默失败(T-144)—— 已修
自动化页 3 个采集任务点「立即运行」后 `external_sources` 仍 = 0、采不到数据、前端无错误提示。根因:扫码只建登录态、没建 external_source 采集源,采集器 fallback 到已退役 canonical 源。
**已修**:新增 `ensureDouyinSource(ctx)`(确定 id `extsrc-douyin-${userId}`,无源建/有源复用);扫码后建 external_source + platform_account;3 个采集器的 `src-douyin-canonical` fallback 全部改为 `await ensureDouyinSource(ctx)`(grep 确认已清零)。**采集端到端(真机扫码→采到数据)待用户自己验。**

### 2. ✅ 账号状态三处不一致 + 虚假承诺 —— 已修 + live 验
原:设置说「已连接·可采集」,首页切换器说「未绑定」,实测采 0 条——互相矛盾且「可采集」是虚假承诺(登录态 ≠ 能采集)。
**已修 + live 验证**:徽标改 3 态(未连接 / 「已扫码,采集源尚未就绪·重新扫码或运行一次采集即可建源」/ 可采集),`statusDouyin` 返回 `sourceReady`。实测徽标现在诚实显示「已扫码,采集源尚未就绪」,不再假承诺"可采集"。

---

## 三、⚠️ 中等问题(体验瑕疵)

### 3. ✅ "七步"废弃文案跨页残留 —— 已修(用户可见 3 处)
产品早改**两阶段**(脚本→复盘),但"七步流水线"编号(③/⑤/⑦)散落在页面副标题。**已修**:`shell-router.tsx` 用户可见的 3 条 `pageDescription`(账号⑤/日历⑦/选题③)已去掉「(七步X)」尾注。(代码注释里的"七步"是内部溯源标注,不面向用户,保留。)遗留 1 处:搜索/项目卡的 stage 显示旧阶段名「研究」(读侧 `PROJECT_STAGES` 白名单不含新建项目 startStage `brief` → fallback),纯展示、归下面小项。

### 4. ✅ AI 出的选题采纳后归类为"手动灵感"—— 已修 + live 验证(T-149,commit `c5ff296`)
选题池把 AI 出题采纳的候选统计到「手动灵感」而非 AI 来源。**根因**(子代理定位):**采纳路由错**——Copilot 里 `topic.generate` 是纯 Vercel AI SDK tool、**不建 ai_task** → 无 taskId → 走不通 `confirmTask`→`createFromAIResult`,只能落 `createCandidate` 手动門,而该門契约锁死 `source: z.literal("idea")`;且 `chat-runner.ts:544` 的 map 把 AI 真实渠道 `t.source` 丢了。**端到端修 6 处保 provenance**:契约 `z.literal("idea")`→`candidateSource.default("idea")`、service/transport 透传 `source`、chat-runner map 补 `source`、chat-tools 返回类型加 `source`、采纳卡走 `normalizeSource`(只放行 trend/benchmark/demand,含 idea/positioning/knowledge 兜底 idea,不自造渠道)。**验证**:四包 typecheck 0;chat-candidate-card+chat-tools 100 测 + candidate.contract 12 测(独立复跑绿);**live 验证**:直接 dispatch `candidates.create` 传 `source='trend'` → 连库确认真落 `trend`(門解锁生效、不再被锁 idea)。**诚实存疑**:完整 Copilot-UI 采纳流因合成事件驱动不了 Copilot 覆盖层(既有工具局限)未逐帧实机跑,但采纳路径由单测覆盖 + 后端門/透传 live 验证;另 topic-node 对 positioning/knowledge basis 的 source 提示词未优化(属提示词质量、不影响本 bug 数据正确性,未顺手改)。

### 5. ✅ 「使用情况分析」默认开着 —— 已修(默认关)
`docs/PROTECTION.md` §4 明确「telemetry 默认关 / 零收集」,但 `analyticsEnabled` schema/repository/service 默认全 =`true`,与隐私原则矛盾。**已修**:4 处默认翻 `false`(schema 列 + DDL + repo defaults + service getPreferences fallback),2 处默认断言测试同步更新,settings 测试 37/37 绿。**补注**:该开关是 **dormant**(全仓无真实遥测消费点,纯 UI),翻默认是原则对齐、功能零影响;当前用户行本就 =false。

---

## 四、💡 小问题 / 打磨项

6. **AI 没严格遵循数量** —— 要"3 个"选题给了 8 个(选题池"多候选"逻辑,单看合理,但没尊重用户明确数量)。
7. **保存无成功提示** —— 账户昵称点保存,名字立即变了(隐式反馈),但**无 toast「已保存」**,用户不确定成没成功。
8. **✅ 技能列表缺友好名 —— 已修 + live 验**。`chatbox.distill`/`script.review` 缺 `SKILL_LABELS` 词表 → `skillLabelOf` 兜底 `name:id`(显「chatbox.distill chatbox.distill」双重原始 id)。补词表:知识蒸馏师 / 合规审核编导。live 验:中文名已渲染。(核实发现真实注册 skill 里 6 个缺词表,但只有 2 个有 template 会渲染成技能行,故只补这 2 个;另 4 个是 tools 不渲染。)
9. **✅ 账号切换器 cursor —— 已修(局部)**。原生 `<button>` 加 `cursor-pointer`。**观察**:这是系统性问题(共享 Button 原语 + 全局 CSS 都无 cursor-pointer,全站按钮默认光标),只修了走查点名处;系统性 design-system 改动(给 Button 原语加)留给你定。
10. **✅ 上传 accept —— 已修(accept 部分)**。`asset-upload-button` 加 `accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.md,.txt,.srt,.vtt"` 过滤支持类型。`multiple` 未加(onChange 只取 `files[0]`,加 multiple 需改循环逻辑;且批量上传已由知识/素材倾倒场承担,本按钮偏单文件,不塞半吊子)。
11. **`@ai-sdk/anthropic` 编译警告刷屏** —— dev 日志反复打(纯 ESM + serverExternalPackages),运行时无害(dispatch 全 200、AI 真能跑),但噪音大。已评估:改 next.config 有破坏打包风险,暂不动。
12. **空态用 404 表达** —— 无定位母版时 `positioning.getProfile` 返回 404(OwnershipError),正常使用也刷 404 污染网络/错误日志(前端已优雅处理成空态,功能无碍,但语义糙)。

---

## 五、🔧 测试工具局限(非产品问题,已确认)

- preview 截图会把视口重置到 467px 窄 → 文字竖排(**不是布局 bug**,1440 下正常);
- 合成 `.click()` / pointer 事件对**部分** Radix 菜单和 `<a>` Link 不触发导航(**真实鼠标点击正常** —— 已用 pointer 事件实测账号切换器确实弹菜单、复盘页确实可访问,证明是工具局限)。
- 原生文件选择器无法用 preview 驱动 → 上传端到端未测(UI 已确认存在)。

---

## 六、未逐一测的(诚实标注,待续)

**本轮已补测 ✅(2026-07-05 第二轮)**:
- **稿面 AI 面板**:「立论点」→ 开论点骨架面板 ✅、「审核」→ 开「编导文案审核」面板(引导 L1 违禁词+L2 语义审)✅、「搜素材(联网)」→ 开联网素材搜索面 ✅;**14 个 dispatch 全 200、零失败**,AI 链路健康。
- **素材页**:每页条数 select(12/24/48/60/100)✅、「全部/按项目」切换 ✅、分页「›」空态正确 disabled ✅、存储指示真实(0.0/494.4GB)✅。空态干净。
- **知识库手动补录**:见上「补充发现」——存 + 显示均通(小 UX:默认观点地图视图易误判)。

**仍未逐一操作**(所属主链路/页面已验证渲染,多为需真实 AI 跑或数据):
- 选题页:候选卡「查看/补全/丢弃」、4 个 AI 依据出题按钮细分、排序、手动详填;
- 稿面:口播脚本编辑器细节;
- 知识库:AI 蒸馏(开 Copilot 对话)、评论回流(需评论数据);
- 发布中心:日历交互;首页:通知/Cmd+K 搜索/折叠侧栏;素材:上传(原生文件选择器 preview 驱动不了)。

需要的话继续逐个走。

---

## 七、整体评价

**成熟度(主观):创作侧 + AI ≈ 85 分,数据回流侧 ≈ 30 分(卡采集)。**

- 产品的"创作引擎"已经是**能打的成品** —— 创作侧 + AI 流畅专业,超出"半成品"预期;
- 唯一挡住"完整闭环"的是**采集**(数据进不来,护城河"越用越准"转不起来);
- 第二伤是**账号状态误导**(说可采集其实不行)。

**修复优先级建议:**
1. **P0 修采集 T-144** + 采集失败给诚实反馈;
2. **P0 修账号状态一致性**(#2:别虚假承诺"可采集");
3. **P1 隐私默认**(#5 分析默认关);
4. **P1 文案对齐**(#3 清"七步"、#4 修 AI 选题来源归类);
5. 其余打磨项(#6-#12)低优先。

**一句话:这个产品比它自己看起来完整得多——创作侧是能用的成品,就差"把真实数据这根管子接上",以及别在账号状态上误导用户。**

---

## 八、补充发现(继续细测·选题页深测)

### ✅ 撤回:选题流转漏斗计数"不准"—— 复核后是**误报**
先前报「已立项 0 / 待补充 1」疑似 promoted 没计入。**连库复核推翻**:promoted 候选 `cand-1ddf1e04-76` **有 1 条对应 `topic_promotions` 行**,`promotionsCount`=1,funnel 代码 `{ label:"已立项", count: counts.promotionsCount }` 正确会显示 1。原「已立项0」是 **stale UI / 我看漏斗的时点早于 promote 落库**,**不是代码 bug**,撤回。(与搜索那次同类:先前基于瞬时快照过早下结论,连库后修正。)

### ✅ 知识库「手动补录」实测通过(存 + 显示,连库确认)
点「手动补录」→ 内联表单(标题 input + 正文 textarea + 类型 claim)→ 填「黄金3秒开头法则」→「直接存入」。**连库坐实真落库**(`knowledge-f749c61d-152` + revision + status=active + user 正确 + 实时进 search_documents),切到「全部」列表视图**条目可见**。「直接存入」gate 在**标题**非正文(`disabled=manualTitle.trim()===0`),设计合理。(测试数据事后已连库清理,DB 回 baseline。)
- **💡 小 UX**:知识库默认视图是**观点地图**(图谱),新条目无关系 → 显「暂无数据」;手动补录存完仍停在观点地图、不跳「全部」列表,**用户易误以为没存成功**。建议存完切列表视图或给「已存入 · 查看」反馈。(我自己首轮也据此误判「存了不显示」,连库才查清是视图问题,非 bug。)

### ✅ 再次验证 AI 能用 + 出色的自我感知
点「基于定位出题」→ 调通 minimax 出 8 条,且 AI **自我感知无定位母版** → 警告「这批没定位依据、会污染候选池」→ 主动提议「先产一份定位提案」。编导 agent 行为很成熟。

### 💡 小:无定位时"基于定位出题"仍先出无依据选题
理想应先引导建定位再出题;当前是先出 8 条再由 AI 软警告要清掉(优雅兜底,但严格说交互次序可优化)。

### ✅ 建项目双路径均通(连库确认)
`projects` 表实有 2 条:立项建的 `project-85`(AI工具用了一堆) + 模态建的 `project-199`(QA测试项目),status 均 active。选题→立项→建项目、手动模态建项目,两条路径都真落库。

### ✅ 搜索索引不实时更新 —— 已修复 + live 验证通过
**原准确结论**:索引只在 server 启动时对存量建一次(buildPersistence 一次性),运行中新建/改动的实体不实时写索引;读侧(ILIKE)正常。
**已修复**(commit `fix(search): 搜索索引实时化`):
- 项目 transport 加 search fan-out(create/patch 同步 `await upsertDocument`,delete `removeDocument`);
- knowledge fan-out `void`→`await`(消"建完即搜"竞态);
- video/publication tab `entity_type` 对齐;
- 启动重建 `seedDocuments`→`rebuildUserIndex`(deleteAll+re-upsert,刷新/清孤儿)。
- 四包 typecheck 0;新 5 测 + 回归 18 + backend search 34 全绿。
**live 验证**:重启后建新项目「实时索引验证ZXCV」→ **不重启立即搜到**(结果卡正常),实时索引生效。
(附遗留小项:搜索结果卡里项目 stage 显示「研究」——读侧 `PROJECT_STAGES` 白名单不含新建项目 startStage `brief`,fallback 到默认阶段名;纯展示、不影响命中,归入下面"七步文案残留"一起清。)

---

## 九、独立自审复核结论(2026-07-06)

对 `feat/make-it-runnable`(相对 `main` 全部提交)做了一次**对抗性代码自审**(独立子代理 + 主 agent 逐条复核)。

**结论:可以合。无 blocker、无 major。** 所有重点改动核心链路读码坐实完整自洽:搜索 fan-out 无双写/无 snippet-wipe、`ensureDouyinSource` 幂等并发安全、T-149 source 透传链无断点、analytics 默认三处一致、审核门 21 补测真测行为。诚实性核查:走查报告声称的修复与提交代码一致,无「声称已修但代码没做到」缺口。

**复核后修掉的 2 minor + 1 bonus**:
1. fixture `analyticsEnabled` 两处 `true`→`false`(与后端新默认 + PROTECTION.md §4 一致,消尾巴);
2. onboarding 对 `web.search` 放开免 key(rss/browser provider 非空即算已配,不强求 hasSecret)——修前免 key 配了搜索的用户「配置联网搜索」步骤会漏判未完成;
3. **bonus**:顺藤逮到并修了 **T-148 遗留的一条静默失败测试**(`onboarding-card「全配」` mock 的 `default` 行漏给 `hasSecret`)。

剩 1 nit(`ensureAccount` `listAccounts limit:100`,单账号退化场景不可触发 + UNIQUE catch 兜底,无实际后果),记录不改。
