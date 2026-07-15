# T-321 日拉不认「已绑定链接的已发布项目」→ 建重复项目 根因调研

> 调研日期 2026-07-14 · 只读 · 备实现。关联 [T-030 SPEC](../superpowers/specs/2026-07-01-real-works-data-pipeline-v2-design.md)、BACKLOG T-321。
> 症状:用户手建项目「CreatorOs系统」已在抖音发布并**绑定视频链接**;每日拉取新作品数据时**没判出该链接=已有项目绑定的作品** → 新建一条重复「历史作品」imported 项目(已发布),原手建项目仍卡「立项中」0%。
> 诉求:对**已发布+已绑定链接**的项目,日拉的**创作数据/封面/标题/简介 直接写回原项目**(有更新就更),**不新建**。

---

## ① 日拉建项目链路 + 去重键现状(有没有比对绑定链接)

**链路(backend/src/modules/ingestion/ingestion.service.ts):**
- `refreshDouyin`(:653)抓作品 → 循环(:699)对每条 record 调 `service.ensureImportedProject`(:701)。
- ingestion 的 `ensureImportedProject` wrapper(:518):
  1. **先** `ports.projects.ensureImportedProject`(:521)—— 建项目(见去重键)。
  2. **后** `ports.publishing.resolvePublication({platform, externalId})`(:531)—— 命中既有 publication 则只拿其 id 喂 metrics;未命中才 `createImportedPublication`。
- 随后 `ingestMetrics`(:722)→ resolvePublication → appendSnapshot(指标落到命中的 publication)。

**去重键(create-vs-update 判定点)= `backend/src/modules/projects/projects.service.ts:744` `ensureImportedProject`:**
- 唯一判据是 `repo.findImportedByRef(ctx, {platform, externalId})`(:747)。
- 实现 `backend/src/modules/projects/projects.repository.ts:349`:
  ```
  where userId=ctx.userId
    AND source='imported'                          ← 硬过滤,只看 imported 项目
    AND platform_ref ->> 'platform'   = ref.platform
    AND platform_ref ->> 'externalId' = ref.externalId   ← 只比 projects.platform_ref
  ```

**结论:去重键只比对 `projects.platform_ref.externalId` 且只在 `source='imported'` 行里找。它从不比对 `publications.externalId`。** 手建项目绑定的 aweme_id 落在 `publications.externalId`(见 ②)、`source='manual'`、`platform_ref` 为空形状 → `findImportedByRef` 永远 miss → 走到 :764 **建新 imported 项目**。ingestion wrapper 那步 `resolvePublication`(:531)虽然能命中手建项目上已有的 publication,但发生在 create **之后**,只用于 metrics,**不回头阻止重复建项目**——这是双重疏漏的根。

---

## ② 绑定链接落库字段

用户「绑定视频链接到项目」= 稿面发布包区的「登记已发布」表单:
- 前端 `frontend/src/features/draft-workbench/register-published-form.tsx`:粘链接 → `parseDouyinAwemeId`(:89)→(项目无 output 先 `createOutput` :104)→ `client.registerPublishedPublication({ params:{outputId}, body:{platform:'douyin', externalId:awemeId, externalUrl, title} })`(:112)。
- op = `outputs.publications.register`,handler `backend/src/modules/publishing/publishing.transport.ts:150`:调 `service.createImportedPublication(ctx, outputId, {...})` 落一条 **status=published + external_id=awemeId** 的 publication(幂等于 (platform, externalId))。

**落库位置:`publications.externalId`(= aweme_id),`publications.contentOutputId` 指向手建项目的 ContentOutput;项目本身 `source='manual'`、`platform_ref` 仍空。** 即绑定信息在 **publishing 表**,不在 **projects.platform_ref**。

**日拉能否拿到它做匹配:能。** `resolvePublication({platform, externalId})`(publishing.service.ts:452 → repo `findByExternalKey` :478)按 (platform, externalId) 全量查 publication,跨所有 output/项目;返回行含 `contentOutputId`。再经 `projects` repo `getOutput(ctx, outputId)`(projects.repository.ts:212,已 innerJoin output→project)拿到 `output.projectId` = **属主项目**。这条反查链现成,只是当前 create 判定没用它。

---

## ③ stage 跃迁逻辑 + 为何没跃迁

**stage 枚举**(`contract/src/primitives.ts:33` `projectStageName`):`brief → research → planning → script → production → publishing → review`。**首阶段 `brief` = 「立项准备/立项中」**(:34 注释:「brief 是项目的第一个阶段——新建/选题立项」)。手建项目默认从 `brief` 起、progressPct=0。

**跃迁入口** `backend/src/modules/projects/projects.service.ts:875` `transitionProjectStage`:
- 非 imported 且 target=completed → 跑 `validateStageGate`,不过就卡 `needs_review` + 抛 `StageGateError`(:894-919)。
- **imported 免 gate 自由跳**(:893 `isImported = project.source==='imported'`,:890 注释;SPEC §9/F4)。

**为何手建项目没跃迁到已发布:**「登记已发布」的 `outputs.publications.register` handler(publishing.transport.ts:150)**只建 published publication,从不调 `transitionProjectStage`**。绑定动作不碰项目 stage → 手建项目原地停在 `brief`(立项)。而日拉新建的那条 imported 项目在 `createProject` 时被把**全 7 阶段置 100 / currentStage=review**(:701-726,`isImported` 分支),故它显示「已发布 100%」。两者叠加 = 用户看到的「重复历史作品已发布 + 原项目卡立项 0%」。

---

## ④ 现有回填 / origin 隔离(能否回填已发布项目 / 是否被隔离挡住)

- **指标回填**:`ingestMetrics`(:560/722)按 (platform, externalId) resolvePublication → `analytics.appendSnapshot`。指标其实**落到命中的那条 publication**(即手建项目上的);但项目重复已经建出来了。
- **auto-fill 重建**:`backend/src/modules/ai-runtime/reconstruct-runner.ts`(taskType `reconstruct.project`)—— **断言仅 `source='imported'`**(:10/:57「非 imported → 整任务失败,不触发 auto-fill」),产 research/planning artifact **强制 `origin='reconstructed'`**(F1)。
- **origin 消费隔离(F2)**:`creative-context.ts:317/510` 遇 `origin='reconstructed'` 不当「用户已确认前提」。
- **对本 bug 的影响**:origin 隔离**不是**另建项目的原因(它在 create 之后才起作用)。真正另建的原因是 ① 的去重键。但它对**修法有约束**:若 merge 采用「把手建项目翻 `source='imported'`」的做法,会让该项目**变得可被 `reconstruct.project` auto-fill**——而它已有用户真手写的研究/策划。**修实现时:merge 后不要对已有用户创作链的项目触发 reconstruct**(或让 reconstruct 跳过已存在的 user-origin artifact),避免把手建内容旁边塞 reconstructed 版本。

---

## ⑤ 精确修点(改哪几个函数 + 签名 + 建议逻辑)

**唯一同时握有 projects + publishing 端口的 seam = ingestion wrapper**(projects 模块够不到 publications,故不在 `findImportedByRef` 里改)。

### 主改:`backend/src/modules/ingestion/ingestion.service.ts:518` `ensureImportedProject` wrapper
把「先 create 后 resolve」翻成「先 resolve 判属主,再决定 merge / create」:
1. 先 `resolvePublication({platform, externalId})`(把现 :531 提到 :521 之前)。
2. 命中既有 publication → 经**新增 projects 端口** `getProjectIdByOutput(ctx, pub.contentOutputId)`(薄封装 repo.getOutput→`output.projectId`)拿属主项目。
3. 属主项目存在 → **merge,不 create**:调新增服务方法 `mergePublishedWork(...)`(见下),返回 `{ projectId: 属主, outputId: pub.contentOutputId, publicationId: pub.id }`。
4. 未命中 publication → 落回现有 `ports.projects.ensureImportedProject` create 路径(行为不变)。

### 支撑改:`backend/src/modules/projects/projects.service.ts`
- 新增 `getProjectIdByOutput(ctx, outputId): Promise<string|null>`(service 层暴露,内部 `repo.getOutput(ctx, outputId).projectId`;repo.getOutput 已在 :212 join output→project 带所有权门)。
- 新增 `mergePublishedWork(ctx, projectId, input:{ title?; brief?; shareUrl?; publishedAt?; coverAssetId? }): Promise<ProjectRow>`,做:
  - `patchProject`(:809)写回 title/brief(有变更才写);
  - 置 `platform_ref = {platform, externalId, shareUrl, publishedAt}`、`source='imported'`(→天然免 gate + 复盘态);
  - **复用 :701-726 那段**把全 7 阶段置 100 / review in_progress(或改为「拥有 published publication 即免 gate」分支保留 source='manual',二选一,前者最简);
  - 封面:走现成 `publishing.setCover(ctx, publicationId, coverAssetId)`(publishing.service.ts:502,幂等,已有封面不覆盖)。
- 可选加固:`findImportedByRef` 之外无需动;但可给去重加第二判据「同 externalId 的 publication 已属某项目 → 视为已存在」,由上面 seam 承担即可。

### 现有函数签名(实现锚点)
- `ensureImportedProject(ctx, {title; brief?; platform; externalId; shareUrl?; publishedAt?}): Promise<{projectId; outputId; created}>` — service.ts:185 / 实现 :744;`EnsureImportedProjectResult` :170。
- `findImportedByRef(ctx, {platform; externalId}): Promise<ProjectRow|null>` — repo:349。
- `resolvePublication(ctx, {platform; externalId}): Promise<PublicationRow|null>`(行含 `contentOutputId`)— publishing.service.ts:452;`findByExternalKey` repo:478。
- `getOutput(ctx, outputId): Promise<ContentOutputRow>`(含 `projectId`)— projects.repository.ts:212。
- `transitionProjectStage(ctx, projectId, stage, {reason?}): Promise<ProjectRow>`(imported 免 gate 在 :893)— service.ts:875。
- `patchProject(ctx, projectId, {title?; brief?; briefDetail?; starred?})` — service.ts:809。
- `setCover(ctx, publicationId, coverAssetId)` — publishing.service.ts:502。
- ingestion wrapper `ensureImportedProject(ctx, input)` — ingestion.service.ts:518;refreshDouyin 循环 :699。

### 顺带修 stage(可选、治本)
`outputs.publications.register` handler(publishing.transport.ts:150)登记已发布时不推进 stage。可在此 fire-and-forget 让属主项目跃迁到 publishing/review(或走同一 `mergePublishedWork`),这样「先绑定、日拉未到」的时刻用户也不再看到项目卡「立项」。

---

## ⑥ 实现落账(T-321,2026-07-14)

**① 主修 —— ingestion wrapper 先 resolve 判属主再决定 merge/create**(`ingestion.service.ts` `ensureImportedProject` :518):
- 把 `resolvePublication({platform, externalId})` 提到 create 之前作**主去重键**。命中且端口注入 → `getProjectIdByOutput(pub.contentOutputId)` 拿属主 → `mergePublishedWork(...)` merge、`return {projectId: 属主, outputId: pub.contentOutputId, publicationId: pub.id}`,**不 create**。未命中 → 原 create imported + createImportedPublication 路径不变(复用同一次 `boundPub` 查询,不重复查)。
- 端口(可选,向后兼容旧最小组合/旧 fake):`IngestionPublishingPort.resolvePublication` 返回加 `contentOutputId?`;`IngestionProjectsPort` 加 `getProjectIdByOutput?` + `mergePublishedWork?`。

**支撑改 —— projects.service 新增 3 个公共方法**(`projects.service.ts`):
- `getProjectIdByOutput(ctx, outputId): Promise<string|null>` — 经 `repo.getOutput`(所有权门 join)拿 `projectId`;越权/不存在吞成 null。
- `markPublished(ctx, projectId): Promise<ProjectRow>` — 幂等跃迁「已发布/复盘」态(复用 createProject :701-726 布局:前置阶段 completed、review in_progress、全阶段进度 100 → recomputeProgress=100、currentStage=review);已达标的 stage 跳过写。归档 → no-op。**不改 source**。
- `mergePublishedWork(ctx, projectId, input): Promise<ProjectRow>` — title/brief **仅在非空且有变化**时写(空值绝不抹用户手写);`platform_ref` 落 aweme 引用(merge 保留 hidden 键);再调 `markPublished`。归档 → no-op。

**② 治本 —— register 顺带跃迁 stage**:
- publishing `ServiceDeps` 加可选 `markOwnerProjectPublished?(ctx, outputId)`;`PublishingService` 加 `markOwnerPublished(ctx, outputId)`(best-effort 吞错,绝不阻断登记);`publishing.transport.ts` register handler(:150)建 publication 后调它。
- composition root(`persistence-client.ts`)接线:ingestion projects 端口补 `getProjectIdByOutput`/`mergePublishedWork`;publishing `markOwnerProjectPublished` = `getProjectIdByOutput` + `markPublished`。

**关键决策 —— source 不翻 imported**:manual 属主翻 imported 会被 `reconstruct-runner`(断言仅 imported,:57)+ transcribe auto-fill(遍历 `listImportedWorks`=source='imported')吃到 → AI 重建逐字稿/研究/策划覆盖用户手写内容(§④)。去重已由 `publications.externalId` 主键承担(manual 也能被 `resolvePublication` 再命中,不依赖 `findImportedByRef`),故**保持原 source**、只补真实数据 + 显已发布。幂等由「同 aweme resolve 到同一 publication → 同一属主 → 同一 project」保证。

**测试**(`ingestion.merge-bound-project.integration.test.ts`,真 pglite,5 例全绿):命中 manual 属主 merge+不新建+保持 manual+不在 listImported;空 desc/未变 title 不覆盖用户 brief/title;二次日拉幂等不累积;未命中照旧建 imported;register `markOwnerPublished` 跃迁 review/100 不改 source。**回归**:ingestion/projects/publishing 全 17 文件 200 例通过;`backend tsc` 干净。

---

## ⑦ 复盘:T-321 没根治 —— register 侧 publication「抢锚」真根因(T-323,2026-07-15)

用户 2026-07-15 重装后仍见同名作品两条(一条已发布 / 一条复盘中)。读码链路锁定 **T-321 漏掉的一步**:

**真根因(register 侧,非日拉侧)**:
1. `register-published-form` → `outputs.publications.register` → backend **复用 `createImportedPublication(manualOutputId, {externalId: aweme})`**(register-published-form.tsx:7 明注)。
2. `createImportedPublication`(publishing.service.ts:491-495)**先 `findByExternalKey(platform, aweme)`,命中即 `return existing`** —— 若该 aweme 已被**上一轮日拉自动建的 imported 重复项目**的 publication 占了(锚在 imported output),就直接返回那条,**根本不在 manual output 上建 publication**((platform, external_id) 有 partial-unique,第二条本也插不进)。
3. 后果:用户 manual 真项目**没有自己的 publication** → 日拉的指标/封面全落 imported 重复上;T-321 的 merge 按 publication 反查属主 = **imported 重复**,于是一直 merge 到重复、manual 被晾着。register 的 `markOwnerPublished(manualOutputId)` 只把 manual 项目 stage 翻已发布(空壳),数据仍在重复上 → **两个项目、真数据在错的那个**。

**为何 T-321 没覆盖**:T-321 治的是「日拉命中 publication → merge 到持有它的项目」,默认「持有 publication 的就是正主」。但当 publication 被**空壳 imported 抢先占锚**时,持有者恰恰是**错的**那个。T-321 的「顺带修 stage(可选)」只翻了 stage、没重锚 publication 归属。

**T-323 修法(register/日拉命中 imported 空壳占锚时重锚)**:
- 命中的既有 publication 属主项目 `source==='imported'`(自动导入空壳,无用户手写内容),而本次 register 的 output 属于用户 manual 项目时:
  - 把该 publication **重锚到 manual output**(`content_output_id = manualOutputId`),或在 manual output 建新 publication 并把 imported 的真实指标/快照并过来;
  - imported 重复项目 **归档(archive,非删)**——保留可追溯,但不再作独立作品显示;
  - manual 项目跃迁已发布 + 吃到真实指标/封面。
- 数据归属沿用 T-321 已过审「**manual 为 canonical**」原则(manual 有用户手写内容,imported 是自动空壳),不新开 gate。
- 幂等 + 边界:manual↔manual 命中不动;两个都 imported 时按 T-321 现状 merge;archive 幂等。
- **验证**:重打包后真机 —— 已发布并绑定链接的 manual 项目,日拉后作品并入它(数据/封面到位)、不再出现孤儿 imported 重复。
