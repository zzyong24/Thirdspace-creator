# 真实作品数据管线 2.0 设计(逐字稿 · 作品初始化 · 采集指令化 · 复盘评论 · 明细数据)

> **SPEC 状态:gate CONCERNS → 本文已补清 F1–F4(blocker/major)→ 可开工;F5–F8 minor 开工中带修。** 评审记录见 [REVIEW_LEDGER](REVIEW_LEDGER.md)。
> 对应任务:BACKLOG **T-030**。对标(存他人作品)本批不做,已拆 **T-031**(deferred,单独 SPEC + gate)。
> 上位宪法:[产品定位.md](../../产品定位.md);上游 SPEC:[data-source-pipeline-design](2026-06-30-data-source-pipeline-design.md)(T-007 调度底座)、[data-foundation-and-director-chatbox](2026-06-30-data-foundation-and-director-chatbox-design.md)(§7 数据底座)。
> 定稿 2026-07-01(gate 后修订版)。

## 0. Gate 处置摘要(2026-07-01 CONCERNS → 补清)

独立 reviewer + 3 核查子代理坐实:方向合宪、范围干净(对标已拆 T-031)、ASR capability 对齐现有 image/video 抽象、每切片有测试路径。开工前必须处置的已在本版补清:

- **F1(blocker,§4.5/§6.1)**:`artifacts` 表**加 `origin` 列**(迁移 0010),auto-fill 写入强制带 `origin="reconstructed"`——这是 §5 原则3 / §9 铁律2「AI 不直接写领域实体」的**唯一审计标记**。
- **F2(blocker,§7)**:加**消费侧隔离**第二道边界——reconstructed 产物在 imported 项目续做新内容时不得静默当作「用户已确认前提」。
- **F3(major,§4.2/§10)**:澄清评论回填边界——`audience_signals` 无 aweme_id 锚,**存量评论无法按作品回填**,只有新采集能带 `publication_id`。
- **F4(major,§9)**:imported 进度现状 ~86%(review 阶段=0),须**把 review 也置 100**;免 gate 分支当前不存在,需新加。
- **F5–F8(minor,开工中修)**:宪法引用编号精确化 / capability 枚举校验点 / ffmpeg+ASR 失败分类+存在性预探 / 幂等 JSON 查询确认。

## 1. 背景与目标

T-007 已把「调度 + 采集(主页指标 / 评论)」底座搭好(scheduled_job/job_run、node-cron、runScheduledCollection 确定性 runner、live dispatch)。用户实测后要:采集不只是「抓指标」,而要让创作者**真正拥有自己作品的全量真实记忆**——每条已发布作品要有**逐字稿**、**基于逐字稿重建的创作链**、**真实评论**、**创作者后台明细数据**,并在项目/复盘里如实呈现。

目标:**把「已发布真实作品」从"只有粗指标的壳"补成"有逐字稿 + 有创作链 + 有评论 + 有明细数据的完整历史项目",采集用普通人能懂的自然语言 + 模板来配。** 直接服务宪法 §3 飞轮、§7 数据底座(替换 mock/seed)。

## 2. 范围

**本批做(T-030):**
1. **逐字稿内置提取(可配云端 ASR)**:抓作品同时拿逐字稿,按 `aweme_id` 绑 imported 作品;已发布作品逐字稿灌进 `script` 阶段。新用户初始化每条视频都提。
2. **作品初始化 auto-fill 分析**:基于逐字稿 + 真实指标,AI 重建研究/策划,直接填各阶段(标 `origin="reconstructed"`,**不逐条确认**);视频数据取真实值。
3. **已发布 100% + 自由跳阶段**:imported 进度=100%(含 review);研究/策划/脚本/制作/发布/复盘可自由跳(绕 gate)。
4. **复盘真数据 + 评论**:复盘用真实指标;每作品评论显示到复盘栏,前 100 条。
5. **采集指令化 UX**:「新建任务」抄 WorkBuddy —— 自然语言提示词 + 友好频率(不露 crontab)+ 从模板入手。
6. **创作者后台明细数据采集(D8)**:**D8a** 作品列表明细(16 字段)经导出流程落库→喂复盘核心指标/漏斗;**D8b** 单视频分析页(观众画像/来源/留存/关键时刻)= 更大工程,**先标规划中,D8a 后单列跟进**(reviewer/用户可改)。

**本批不做(拆走):**
- **对标库(存他人作品)= T-031**,deferred。采集侧只留 `is_self` 归属 hook(默认本人)。
- 视频编辑/剪辑/导出(宪法 §8 边界,永不做)。

## 3. 关键决策(2026-07-01 用户拍板)

| # | 决策 | 理由 |
|---|---|---|
| D-a | 对标本批不做,拆 T-031 | 避免本批含数据归属/方向变更 |
| D-b | 逐字稿走**云端可配 ASR**(model-config `transcribe.audio`) | 本地 faster-whisper 是 Python 依赖将来跑不了;云端可配合「多模态须可配」铁律 |
| D-c | 历史作品分析**直接 auto-fill,不逐条确认**(仅 imported) | 30–71 条逐条确认不现实;历史重建≠新建领域实体;由 `origin` 标记 + 消费侧隔离守住(见 §7) |
| D-d | ASR 首个 adapter = **OpenAI 兼容 `/v1/audio/transcriptions`** | skill 里 SiliconFlow(`FunAudioLLM/SenseVoiceSmall`)已验证,一个 adapter 覆盖 SiliconFlow/OpenAI/Groq |
| D-e | 明细数据**不搬 TzFilm 的 AppleScript**,移植其导出流程到我们 Playwright+`.auth/` | TzFilm 依赖用户真 Chrome + macOS + 11 个坑;我们复用其字段映射/踩坑知识,运行时用自己的无头链路 |
| D-f(OQ-1 定案) | 采集指令化**模板 + 自然语言 prompt 都做** | 用户明确要自然语言;模板为主路径(0 LLM),NL prompt 经 schema 约束分类到同一 intent 枚举,非开放 agent |

## 4. 数据模型变更(迁移 0010,全 additive)

### 4.1 `model_configurations` —— 无 schema 改动
`capability` 已是自由字符串。新增约定值 **`transcribe.audio`**,复用现成列。

### 4.2 `audience_signals` —— 加 `publication_id`(评论按作品可读)
```sql
ALTER TABLE audience_signals ADD COLUMN publication_id TEXT;  -- nullable
CREATE INDEX ix_audience_signals_pub ON audience_signals(user_id, publication_id);
```
**F3 边界(诚实)**:表**无 `aweme_id` 列**。评论**新采集**时,ingest 上下文持有 `aweme_id`(来自 douyin-cdp 抓取),据此查 `publications.externalId=aweme_id` 得 publication → 回填 `publication_id`。**存量已入库评论无 aweme_id 锚 → 无法按作品回填,需重采**。开工前须确认 ingest 链路此刻确实拿得到 `aweme_id→publication` 映射(否则新评论也回填不了)。

### 4.3 逐字稿落点 —— 复用 `artifacts`
建 `script` 类 artifact,`contentData` 存 `{ transcript, source:"transcribed", awemeId }`,作 `script` 阶段交付物。**F8 幂等**:查询先按 `project_id` + `artifact_type='script'` 过滤(小集合),再 JSON 匹配 `content_data->>'awemeId'`;已存在则跳过(单用户 ~30–130 条,JSON 内查可接受;可选把 awemeId 冗余存列)。

### 4.4 `scheduled_job` —— 采集指令化(见 §8)
`prompt` 承接自然语言指令;`schedule`(cron)保留为**内部编译目标**;加 `is_self BOOLEAN DEFAULT TRUE`(归属 hook,为 T-031 预留)。

### 4.5 `artifacts.origin` —— **F1 blocker,§5.3 例外的审计前提**
```sql
ALTER TABLE artifacts ADD COLUMN origin TEXT;  -- nullable;历史行空=旧数据(视为 user)
```
`origin` 生命周期:`reconstructed`(AI 历史反推、未经确认)→ **用户编辑/确认后翻 `user`**。缺此列则 auto-fill = AI 无标记直写领域实体(违 §9 铁律2)。`createVersion` 加可选参 `origin?: "user"|"reconstructed"`(默认 `user`);auto-fill 路径**强制**传 `reconstructed`。

## 5. 逐字稿可配 ASR 管线

### 5.1 ASR capability(model-config 扩展,对齐 image/video)
| 扩展点 | 文件 | 做什么 |
|---|---|---|
| capability 值 | `contract/src/primitives.ts` | 加 `transcribe.audio`(**F6**:若该处有 capability 联合类型/枚举校验,须显式加到,别漏) |
| resolve | `frontend/src/server/ai/multimodal/resolve.ts` | `resolveTranscribeSpec(ctx,"transcribe.audio")`,3 层回退(DB→env `CREATOROS_ASR_*`→无兜底则 `TranscribeConfigError`) |
| provider 工厂 | `ai-worker/src/runtime/multimodal-factory.ts` | `transcribeAudio(spec,{audioBytes,language?},registry)→{text,language?}`(与 generateImage/Video 同构,仅返回形状不同) |
| adapter | `ai-worker/src/runtime/multimodal-openai-asr.ts`(新) | OpenAI 兼容 `POST {baseUrl}/v1/audio/transcriptions` multipart `{file, model}`;可注入 fetch 便单测;覆盖 SiliconFlow/OpenAI/Groq |
| 设置页卡 | `settings-interactive-region.tsx` | 加 `TranscribeConfigCard`(复用 MultimodalModelCard 结构),capability=`transcribe.audio` |
| 设置 VM | `settings-page.tsx` | `multimodalModels` 加可选 `.audio` 段 |

未配 ASR → 逐字稿功能诚实禁用 + 引导去设置(和图/视频一致)。

### 5.2 抖音取音频(复用 skill 逻辑,不移植 whisper)
`frontend/src/server/ingestion/douyin-cdp.ts` 加两导出(逻辑抄 Python skill 的 iesdouyin 通路,**均为新增,非既有**):
- `fetchDouyinVideoUrl(awemeId) → {playUrl, coverUrl?}`:GET `iesdouyin.com/share/video/{id}`(手机 UA)→ 正则抽 `window._ROUTER_DATA` → `play_addr.url_list[0]` → `playwm`→`play` 去水印。纯解析可单测。
- `streamAudioFromVideo(playUrl) → Uint8Array`:`child_process.spawn("ffmpeg",[...])` 从直链流式抽 16kHz/单声道/mp3(带 `Referer`)。

### 5.3 转写 runner(仿 asset-generate-runner)
新 `transcribe-runner.ts` + taskType `transcribe.douyin`:
```
markRunning → 对每个 awemeId:(§4.3 幂等)已有则跳过
  → fetchDouyinVideoUrl → streamAudioFromVideo → resolveTranscribeSpec → transcribeAudio
  → 建 script transcript artifact(origin 不适用,transcript=事实非重建)
  → recordStep(kind:"transcribe")
→ markSucceeded
```
**F7 失败分类**(别一条视频拖垮整批):
- ASR 未配 → 引导去设置(§5.1),整任务停。
- 取音频失败(ffmpeg 缺失 / 直链 403 / 去水印失效)→ **标该 aweme 失败、其余继续**,recordStep 记失败原因。
- 开工前探一次 `ffmpeg` 二进制存在性(环境依赖,类比 node-cron)。
端口全注入,确定性单测用 fake ASR/fake audio,不碰真抖音/真 ASR。

### 5.4 存量回填(月明水清深 ~30 条)
用户已在 `ThirdSpace/01-收件箱/蒸馏/月明水清深/` 提取好 `<aweme_id>.md`。一次性 backfill:读 `.md` → 按 `aweme_id` 匹配 `platformRef.externalId` 的 imported 作品 → 建 transcript artifact(跳过真转写)。不卡扫码/ASR,确定性入口。

## 6. 作品初始化 auto-fill 分析

### 6.1 触发与流程
imported 作品有 transcript 后,派 `reconstruct.project` runner:
```
输入:transcript + 真实指标 + 账号定位 brief
→ runStructuredNode(schema 约束)产重建包 { research, planning, hook/金句 }
→ 物化到各阶段 artifact,createVersion 传 **origin="reconstructed"**(F1 强制)
→ recordStep 记「已重建 N 阶段」;不走 candidate 确认路径(§7 例外,靠 origin+隔离守)
```
`script` 阶段用逐字稿本身(§5.4/§5.3 已灌,是事实);research/planning 是 AI 反推的重建。

### 6.2 与现有 auto-fill 的关系
S0/T-002 已有「真实指标→维度分→预填录入(人审核)」;本节补创作链(研究/策划),同样仅 imported。视频数据一律真实,不由 AI 编。

## 7. §5 原则3 / §9 铁律2 确认门例外(安全边界,gate 有条件 bless)

宪法 §5 原则3 + §9 铁律2:「AI 只产候选,人确认;AI 不直接写领域实体」。

**现状(核查坐实)**:确认门实际在 **candidate 池**;`artifacts.createVersion` 今天就**无门**,AI 已可直写 artifact。故 auto-fill 绕过的是 **candidate 确认路径**,不是一道现存 artifact 门。

**受限例外(有条件成立):auto-fill 只作用 `source='imported'` 历史作品;新建/manual 一律保留 candidate 确认路径。** 由**两道边界**守:

- **边界①(重建时,F1)**:reconstructed 产物**必带 `origin="reconstructed"`**(§4.5)。D4 断言:manual 项目不触发 auto-fill;所有 auto-fill 产物必带 origin。
- **边界②(消费时,F2)**:任何把 artifact 当「用户已确认前提」消费的链路——**creative-context 装配 / ChatBox 数据底座注入 / candidate 生成 / SEAM 上下文透传**——遇 `origin="reconstructed"` **不得静默当已确认**:要么排除出「已确认前提」上下文,要么显式标注「AI 历史反推、未经你确认」。用户编辑/确认该产物后 `origin→"user"`,方视为确认。D4 补此消费侧断言。

理由:imported 项目**可继续新建 output 创作**,reconstructed 产物与新决策今天无隔离;仅边界①(重建时按 source)拦得住 manual、拦不住「在 imported 项目上基于 AI 反推续做新决策」。边界②补上消费侧隔离,例外方成立。

## 8. 采集指令化 UX(WorkBuddy 式)

### 8.1 新建任务弹窗改造(`automations-island.tsx`)
- **去裸 cron**:频率改「周期 / 按间隔 / 单次」+ 每天/每周下拉 + 时间选择器 → 前端**编译成 cron** 存 `schedule`(不露给用户)。
- **自然语言提示词**:承接 `scheduled_job.prompt`,写「每天抓我主页新作品」等。
- **从模板入手**:列表页模板卡:`每天抓我的新作品指标` / `每天抓我作品的最新评论` / `每天拉我的作品明细数据`(D8a)/(对标模板 T-031 后补)。模板预填 `{name, prompt, intent, 默认频率}`。

### 8.2 指令 → 采集意图解析(OQ-1 定案:两者都做)
采集动作是固定小集合(self.metrics / comments / self.detail[D8a];他人=T-031)。**不做开放 autonomous agent**(避 T-007 死链坑)。
- **模板/显式选择 = 主路径**:模板直带 `intent = {collector, params}`,0 LLM。
- **自然语言 prompt 经 schema 约束分类**(Vercel `generateObject`,合 §9 铁律)映射到同一 `intent` 枚举;解析不出回退让用户选模板。
`intent` 落 `sourceKind`/`prompt`;runner 复用 T-007 `runScheduledCollection`(逐字稿/明细是另 taskType,不混)。

## 9. 已发布 100% + 自由跳阶段

- **进度 100%(F4)**:`ensureImportedProject` 建项目后,把**全部 7 阶段**(含 `review`)`progressPct` 置 100 —— 现状 review=0 致均值 ~86%,须显式补 review;推荐在 `ensureImportedProject` 返回后**显式刷新进度**(而非埋 createProject 循环)。D5 断言 imported=100%。
- **自由跳阶段(F4)**:`transitionProjectStage`(实际 L817,免 gate 分支**当前不存在**)加:`if (project.source==='imported')` → 跳过 `validateStageGate`,任意跳;新建项目仍走 gate。开工前核对 `validateStageGate` 除校验外**无副作用初始化**(若有,跳过会漏初始化)。D5 断言:imported 可跳、manual 仍受 gate。

## 9b. 创作者后台明细数据采集(复盘真数据源,D8)

参考 `/Users/zyongzhu/Workbase/TzFilm-Douyin-Tool`(已跑通,但 AppleScript+用户真 Chrome,不搬运行时)。

- **D8a(可做)**:移植「导航数据中心→作品分析→投稿列表→点『导出数据』→截 `作品列表.xlsx` 下载→openpyxl 等价解析」到我们 **Playwright + `.auth/` 无头链路**;复用 TzFilm 的 16 字段映射(播放/完播/5s完播/封面CTR/2s跳出/平均时长/主页访问/粉丝增量/点赞/评论/分享/收藏 + title/pub_date/status/genre)+ 踩坑知识(登录态过期校验 PK 头、Garfish 微前端健康检查)。落库(新表或复用 metrics)→喂复盘核心指标 + 漏斗。**无 aweme_id 维度**(导出是全量列表),按 title/pub_date 匹配作品。定期任务 ≥1h/次(风控)。
- **D8b(更大,先标规划中)**:观众画像/来源/留存曲线/关键时刻 **xlsx 导出没有、TzFilm 也没拿**,需单独抓创作者后台「单视频数据分析页」——per-video UI 抓取,工程量大。复盘这几个 tab 先诚实标「规划中·D8a 后跟进」,不摆假数据(宪法 §8/T-010 一致)。

## 10. 复盘真数据 + 评论

- **评论按作品可读**:§4.2 加 `publication_id` + `publications.comments.list(publicationId, limit=100)` op(user-scoped)+ service/repo 读 `audience_signals where source='comment' and publication_id=?`。
- **F3 边界**:仅**新采集**评论能带 `publication_id`(ingest 时 aweme_id→publication);**存量评论无法按作品显示,需重采**——复盘评论区空态诚实标「未采集/需重采」。
- **复盘页评论区**:`analytics-review-page.tsx` 加评论 tab/区,当前作品前 100 条(文本 + demand_tag)。
- **核心指标/漏斗**:接 D8a 明细(替换现 0/fixture);观众/留存 tab 待 D8b(标规划中)。

## 11. 待定 / 数据卡点(Open Questions)

- ~~OQ-1~~ **已定案(D-f)**:模板 + 自然语言分类都做。
- **OQ-2(待用户)**:D8b(观众画像/来源/留存)本批做还是标规划中?**建议先 D8a**(价值大、确定能拿),D8b 单列跟进。
- **DATA-1**:云端 ASR 的 provider/baseUrl/model/key 用户在设置配(SiliconFlow `FunAudioLLM/SenseVoiceSmall`,skill 已验证)。已确认用硅基流动 key;D1 前可放 `frontend/.env.local` 的 `CREATOROS_ASR_*`(已 gitignored)。
- **DATA-2**:真采集主页作品/评论/明细需扫码登录——`frontend/.auth/douyin/` **已存在登录态**(2026-07-01,不用重扫)。
- **DATA-3**:存量回填要求 imported 作品 `platformRef.externalId` 与 `月明水清深` 逐字稿 `aweme_id` 重叠——运行时核一次;不重叠则需重跑一次带 aweme_id 的 refresh。

## 12. 切片(BACKLOG Task,每片垂直真做 + tsc + vitest + 冒烟)

- **D1 · ASR capability**:`transcribe.audio` + `resolveTranscribeSpec` + `transcribeAudio` 工厂 + OpenAI 兼容 adapter + 设置页 `TranscribeConfigCard`(**F6** capability 枚举点落实)。
- **D2 · 逐字稿管线**:`fetchDouyinVideoUrl`/`streamAudioFromVideo`(**F7** 失败分类 + ffmpeg 预探)+ `transcribe-runner` + transcript artifact 幂等(**F8**)+ dispatch `transcribe.douyin`。
- **D3 · 存量回填**:读 `月明水清深/*.md` → 按 aweme_id 建 transcript artifact(不卡扫码/ASR)。
- **D4 · 作品 auto-fill 分析**:迁移 0010 `artifacts.origin`(**F1**)+ `reconstruct.project` runner(schema 约束,写 origin=reconstructed)+ **消费侧隔离**(**F2**)。断言:manual 不触发、产物必带 origin、reconstructed 不被当已确认前提。
- **D5 · 已发布 100% + 自由跳**:`ensureImportedProject` 全 7 阶段置 100(**F4** 含 review)+ `transitionProjectStage` imported 免 gate。断言 imported=100% 可跳、manual 受 gate。
- **D6 · 复盘评论**:`audience_signals.publication_id` 迁移 + `publications.comments.list` op + ingest 按 aweme_id 回填(**F3** 边界)+ 复盘页评论区(前 100)。
- **D7 · 采集指令化 UX**:友好频率编译 cron + 自然语言 prompt + 模板卡 + intent 分类(D-f)。
- **D8a · 明细数据导出采集**:Playwright 移植导出列表流程(16 字段)+ 落库 + 喂复盘核心指标/漏斗。
- **D8b · 单视频分析页(规划中)**:观众画像/来源/留存/关键时刻——先标规划中,D8a 后单列(OQ-2)。

## 13. 验收

- 各切片:tsc(contract/backend/ai-worker/frontend 四层)净 + vitest 绿 + 确定性冒烟。
- 端到端(需 DATA-1/2):配 ASR + 复用 `.auth/` → 建「每天抓我新作品」→ 立即运行 → 作品有逐字稿(script 可见)+ auto-fill 研究/策划(标 origin=reconstructed、消费侧不当已确认)+ 复盘显 D8a 真指标 + 前 100 评论;项目列表已发布=100% 且可自由跳。
- 存量:D3 回填后月明水清深 ~30 条 imported 作品 script 阶段出真逐字稿(不需扫码/ASR)。
- **§5 原则3 / §9 铁律2 守护**:D4 测覆盖「manual 项目 auto-fill 不触发」+「reconstructed 产物不被消费侧当已确认前提」。
