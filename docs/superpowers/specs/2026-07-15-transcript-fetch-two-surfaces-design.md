# SPEC:单视频逐字稿抓取扩到两个新 surface(T-349)

> **非全局 · 单条按需按钮 · 复用现成失败韧性**。给「对标选题视频」和「已发布作品视频」各加
> 单个视频粒度的逐字稿抓取,把失败面收敛到单条(避开抖音风控大批量失败)。
>
> 对齐 [docs/产品定位.md](../../产品定位.md):逐字稿是选题/脚本/复盘的核心素材;抓取以「单条
> 按需、首次失败可重试、下轮幂等补」为诚实预期,不做批量一次抓全。

## 0. 一句话定义

对标选题视频(benchmark_works)+ 已发布作品视频,各加**单个视频**「抓逐字稿」按钮:对标视频
**照 favorites 先例**(transcribeOne 原语 → 存 benchmark_works.transcript 独立落点);已发布作品
**先打通已有逐字稿展示**(imported project 的 output_script artifact),仅未导入的纯发布记录才真抓。

## 1. AS-IS 现状(源码证据)

### 1.1 单视频逐字稿逻辑层已稳(不重造)
- `transcribe-runner.ts`:可配 ASR(SiliconFlow/OpenAI/Groq)+ 未配自动降级本地 Whisper 免 key +
  逐条失败隔离 + ffmpeg 重试 + 冷却退避重试(T-230)+ 幂等 + 17 单测。**不稳只在外部抖音面**
  (iesdouyin item_list 空实测 27/50、_ROUTER_DATA 风控、通道限流冷却)。
- **精确复用原语**:`favorites-distill-runner.ts:57` `transcribeOne: FavoritesTranscribePort`
  = `(ctx, awemeId) => Promise<string | null>`,复用 transcribe 原语(iesdouyin+ffmpeg+云ASR),
  图集/无口播/空转写返 null(诚实 skip,非失败)。调用点 `:158 const text = await deps.transcribeOne(ctx, item.awemeId)`。

### 1.2 对标选题视频:有 awemeId 无 transcript(明确空白)
- `backend/src/schema/benchmark.ts:32` `benchmarkWorks`:有 `awemeId`(:39,唯一锚
  `ux_benchmark_works_aweme_v2` user+account+platform+aweme_id)、description(标题)、统计列;
  **无 transcript 列、无视频直链列**。teardown(`benchmark-teardown-runner.ts`)**只用标题+统计**喂 AI。
- **落点先例**:`favorites_items.transcript`(schema/favorites.ts:49,text 列 + distill_status +
  ix_favorites_items_distill)——他人作品逐字稿**独立落点、永不建 imported project/artifact**
  (origin 隔离,T-235d-distill)。对标视频照此加列。
- UI:`frontend/src/features/topics/topics-supply-region.tsx` 对标面板(BenchmarkSourcesPanel + 对标作品展示)。

### 1.3 已发布作品:逐字稿多半已存在,只是没打通展示
- `backend/src/schema/publishing.ts` `publications`:有 externalId(平台作品 id)、externalUrl。
- 自有已发布作品**逐字稿已作为 imported project 的 output_script artifact 存在**(runner 经
  `findImportedByRef(platform=douyin, externalId=awemeId)` 绑定);稿面 `draft-workbench-page.tsx:117`
  是其读侧。但 publishing-center/publications surface **不展示、不触发**逐字稿。
- 缺口:publications(externalId)↔ 已有 output_script artifact **没打通展示**;纯发布记录(从未
  导入)才需真抓。

### 1.4 抓取失败面(用户明确担心,设计要吸收)
- iesdouyin 分享页 item_list 空(实测 27/50 失败,已靠登录态 detail 回落缓解)、_ROUTER_DATA 风控、
  通道限流冷却整批快速失败。**→ 单条按需触发把失败收敛到单条,天然避开批量集中抓的最大失败源。**

## 2. 目标不变量(TO-BE)

| ID | 不变量 |
|---|---|
| TR-01 | 对标视频**逐条**可点「抓逐字稿」→ 存 benchmark_works.transcript;成功显稿、失败诚实标可重试 |
| TR-02 | 对标视频逐字稿**独立落点**(benchmark_works.transcript),**永不建 imported project/artifact**(origin 隔离,同 favorites) |
| TR-03 | 已发布作品**优先打通已有逐字稿展示**(imported artifact);仅从未导入的纯发布记录提供「抓逐字稿」 |
| TR-04 | 抓取**全部复用** transcribeOne 原语 + douyinGateway 限流通道 + 幂等锚;已有 transcript 复用不重抓 |
| TR-05 | **非全局**:无批量一次抓全入口;单条触发,诚实预期「首次失败可重试、下轮幂等补」 |
| TR-06 | 抓取走 model-config transcribe.audio capability(不写死模型;未配降级本地 Whisper) |

## 3. 设计

### 3.1 对标选题视频抓逐字稿(真新增,照 favorites 先例)
- **schema**:`benchmark_works` 加 `transcript TEXT`(+ `transcript_status TEXT` nullable:
  null=未抓 / pending / done / failed / skipped)+ 迁移(照 favorites 0039 范式;raw DDL + drizzle)。
- **端口复用**:复用 `transcribeOne` 原语(同 FavoritesTranscribePort;若签名不共享则抽公共
  transcribe 端口,不复制取流/ffmpeg/ASR 逻辑)。
- **单条动作**:新 op/dispatch「抓这条对标视频逐字稿」(input: benchmarkWorkId/awemeId)→
  已有 transcript 则复用(不重抓)→ 否则 transcribeOne(awemeId) → 存 transcript + status。
  图集/空 → status=skipped(诚实,非失败)。失败 → status=failed(可重试)。
- **UI**:topics-supply-region 对标作品项加「抓逐字稿」按钮(单条);有稿显「查看逐字稿」,
  抓取中 spinner,失败显「重试」。**非全局**——每条一个按钮,不做「全部抓」。

### 3.2 已发布作品逐字稿(先打通展示,非重抓)
- **打通展示**:publishing-center/publications surface 按 externalId 反查已有 imported project 的
  output_script artifact → 有则展示「查看逐字稿」(读已存在,零重抓)。
- **仅缺失才抓**:externalId 对应作品**从未导入**(无 artifact)→ 提供单条「抓逐字稿」
  (复用 3.1 同款 transcribeOne;落点 SPEC 决——挂 output_script artifact 还是独立列,
  因是自有作品可走 artifact,与对标他人作品的独立落点区分)。
- **待 SPEC 决**:自有已发布作品的抓取落点(imported artifact vs publications 关联列);
  externalId 是否等价可取流的 aweme_id(需核实 douyin externalId 形态)。

### 3.3 不做(边界)
- 不做批量/全局「一键抓全部逐字稿」(TR-05)。
- 不改 transcribe-runner 内核(已稳,只复用其原语)。
- 对标视频不建 imported project/artifact(TR-02 origin 隔离)。

## 4. 复用清单(不重造)

| 复用 | 位置 |
|---|---|
| 逐字稿抓取原语 | transcribeOne(FavoritesTranscribePort)+ transcribe-runner iesdouyin+ffmpeg+云ASR |
| 独立落点范式 | favorites_items.transcript + distill_status(schema/favorites.ts:49) |
| 限流韧性 | douyinGateway 通道 + 冷却退避 + 幂等锚 |
| 对标数据+UI | benchmark_works + topics-supply-region 对标面板 |
| 已发布逐字稿 | imported project output_script artifact(findImportedByRef) |

## 5. 验收(真机)

- AC-1:对标作品点「抓逐字稿」→ benchmark_works.transcript 落真稿;再点复用不重抓(幂等)。
- AC-2:图集/无口播对标作品 → status=skipped 诚实(非失败态);失败作品 → status=failed 可重试。
- AC-3:已发布作品(已导入)→ publications surface 显「查看逐字稿」读到已有 artifact(零重抓)。
- AC-4:未导入的纯发布记录 → 提供单条「抓逐字稿」并落稿。
- AC-5:全程无「批量抓全」入口(TR-05);单条抓失败不连坐其他条。

## 6. 切片(写完本 SPEC 立即拆进 BACKLOG,hook 强制)

- **S1 对标视频 schema + 抓取端口**:benchmark_works 加 transcript/transcript_status 列 + 迁移;
  复用/抽公共 transcribeOne 端口 + 单条抓取 op/dispatch(已有复用、图集 skip、失败可重试)。backend 簇。
- **S2 对标视频 UI**:topics-supply-region 对标作品项加单条「抓逐字稿/查看/重试」按钮 + 状态渲染。frontend 簇。
- **S3 已发布作品打通展示 + 缺失抓取**:publications surface 按 externalId 关已有 artifact 显「查看逐字稿」;
  纯发布记录单条抓取入口(落点按 §3.2 SPEC 决)。
- **S4 真机验收**:AC-1~5(含风控失败诚实态);与 T-350c 可同批重打包验。

> 依赖:S1→S2 顺序;S3 独立可并行;S4 收口。不改数据归属(加列 + 独立落点,同 favorites 先例),无需过 gate。
