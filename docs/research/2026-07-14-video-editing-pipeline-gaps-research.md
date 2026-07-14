# 视频剪辑管线质量诊断:文字重合 / 字幕校准 + 对话式剪辑切入点

- 日期:2026-07-14
- 类型:代码调研(源码蒸馏 + 根因诊断)
- 触发:用户实测两个质量问题 ①文字重合(画面文字叠一起)②字幕校准不对(字幕时间轴/位置对不上)
- 管线形态:确定性模板渲染 —— HTML+GSAP(`template.ts`)→ hyperframes 无头 Chromium 抓帧 → ffmpeg 编码(`executor.ts`)
- 结论拍板:待用户(本文档是诊断依据,不含决策)

---

## 0. 全链路一句话

```
上传 粗剪视频(.mp4/.mov) + SRT 字幕 + 口播稿
  → 四决策 runner(video-decisions-runner.ts):①分场 ②信息卡 ③B-roll ④双语字幕
  → VideoDecisions(结构化 JSON)→ 预览卡过目(video-decision-preview.tsx)
  → 确认 → assembleVideoRenderProps(组装器)→ VideoRenderProps(contract 单一真值)
  → generateVideoRenderHtml(template.ts,纯字符串→HTML)→ hyperframes 抓帧 → final.mp4
```

关键性质:**template.ts 是纯函数字符串生成器,没有任何 DOM 测量**;所有卡片尺寸是**硬编码预估**,所有字幕时间**原样信任 SRT**。这两点分别是两个质量问题的根。

---

## 1. 文字重合根因(代码位置 + 机理)

### 1.1 定位方式:绝对定位 + 贪心行流,坐标由「预估高度」算出

卡片/B-roll 全是**绝对定位**(`position:absolute`,`clip()` 注入 `left/top`,
`backend/src/modules/execution/video-render/template.ts:159`)。同场景多张卡的位置由一个**贪心行流布局** `place()` 现算:

- `template.ts:690-709` `place(w, h)`:从 `contentX` 起横排,`px+w>rightEdge` 就换行 `py += rowH + GAP`(`GAP=18`,`template.ts:80`),`rowH` 取本行卡片**预估高度**的最大值。
- 换行的纵坐标 `py` **完全依赖上一行卡片报出来的 `h`**。

### 1.2 病根:`h` 是硬编码预估,与真实渲染高度脱节

`renderCardBase()`(`template.ts:351-449`)给每 kind 卡片返回一个**写死或按条目数线性估算**的 `height`,但内容是不定长文本 + 自动换行,真实高度经常超估:

| kind | 预估 height | 代码位置 | 超估场景(→ 真实高度 > 预估 → 压到下一行卡片上) |
|---|---|---|---|
| stat | 固定 `160` | `template.ts:368` | `label` 长文本换行(`label` 直接吃整句 content,见 §3) |
| quote | 固定 `92` | `template.ts:377` | 金句原句在 620px 宽、`font-size:30px/700` 下换 2–3 行 → 实高远超 92 |
| list | `60 + items*50` | `template.ts:395` | 单条 item 超一行(`font-size:26px`)按 1 行算 → 每条都少算 |
| compare | `96 + rows*32` | `template.ts:419` | 每半栏仅 ~370px 宽(760 的 flex:1),item 20px 换行 → 少算 |
| code | `64 + lines*30` | `template.ts:431` | `white-space:pre-wrap`(`template.ts:435`)长行软换 → 少算 |
| image | 固定 `240` | `template.ts:441` | 图相对稳定,风险最低 |

`place()` 用少算的 `h` 决定下一行 `py`,于是**下一行卡片被排在了上一行卡片的真实内容区里 → 视觉重合**。这是纯字符串生成器的结构性缺陷:它无法知道 Chromium 实渲后的真实盒高。

### 1.3 放大因素

- **同场景卡片同屏共存**:每张卡 `duration = 场景末 - card.at`(`template.ts:722`),即卡片从各自 `at` 出现后**一直留到场景结束**;同场景多卡会同时在屏(`decideCards` 会为一场产多张,§3),预估误差叠加。
- **富动画偏移只做粗略 +20**:`renderCard()` 给 bar/strike/metaphor 叠层后只 `height += 20`(`template.ts:461-467`),不精确。
- **卡片区无「字幕安全区」避让**:`place()` 只避让 PiP 口播头安全区(`template.ts:696-704`,`pipSafeX/pipSafeY`),**不避让底部字幕带**。字幕固定在 `bottom:56px`(`template.ts:774`),竖版卡片从 `contentY.pip=340` 往下流(`template.ts:112-121`),卡片多时 `py` 一路增长会侵入字幕区 → 卡片压字幕。
- **字幕自身无 `max-width`**:字幕盒 `display:inline-block` + `left:0;right:0` 居中(`template.ts:774-775`),超长中文行会撑到接近全宽再换行,但不与其它字幕重叠(单轨,§2)。

### 1.4 小结

文字重合 = **「用硬编码预估高度做绝对定位布局 + 零真实测量」**。文本一长就超估,`place()` 把后续卡片压进前一张的真实内容区。次因是卡片区不避让字幕带。锚点:`template.ts:690-709`(布局)、`template.ts:351-449`(预估高度)、`template.ts:774`(字幕带位置)。

---

## 2. 字幕校准根因(时间轴从哪来 / 怎么对齐 / 哪步错位)

### 2.1 字幕时间 100% 来自上传的 SRT,AI 无权改时钟

- 契约铁律:`contract/src/resources/video-render.ts:71-81` —— 「SRT 主时钟铁律:start/end 来自用户上传的 SRT,决策 runner 只做错字校正与英文行补全,不改时间」。
- runner 实现:`decideSubtitles()`(`video-decisions-runner.ts:373-397`),**逐行把 `startSec/endSec` 回填成原 SRT 值**(`video-decisions-runner.ts:391` 注释「时间轴永远回填原值 —— 模型无权改时钟」);AI 只出 `{index, zh, en}`,连时间字段都没有(prompt schema `videoSubtitleLineSchema` 只有 index/zh/en,`ai-worker/src/prompt/templates/video-decisions.ts:183-187`)。
- SRT 解析:`backend/src/modules/ai-runtime/srt.ts:30-58`,`00:01:02,345 → 秒`。

### 2.2 渲染侧怎么和帧时间对齐

- 合成时钟 = 秒。口播视频 `<video id="th">` 是一个 clip,`data-start="0"`、`data-duration=DUR`(`template.ts:631`),`DUR = talkingHead.durationSec`(`template.ts:588`)。
- 每条字幕是一个 clip,`data-start=cap.start`、`data-duration=end-start`(`template.ts:768-776`);hyperframes 抓第 `t*fps` 帧时,`data-start<=t<data-start+dur` 的 clip 可见。
- **对齐的隐含假设**:合成时刻 `T` 的视频音频内容 = SRT 说在 `T` 出现的那句话。**仅当 SRT 时间戳来自「正在用作口播头的这条视频、从 t=0、同速率」时才成立。**

### 2.3 哪一步会错位

1. **两个独立时钟,从不回锚音频**:视频走自己的时钟(从 0),字幕走 SRT 时钟(从 0),系统**从不对真实音频做强制对齐/重识别**。SRT 相对真实说话音频若有恒定偏移或线性漂移,每条字幕都偏,且无人纠。
2. **粗剪剪掉「口误段」后时间轴平移**:用户按指引在剪辑软件里「粗剪掉口误段」再导出(`production-workbench.tsx:882-884`)。如果 SRT 不是对**最终这条剪过的视频**重新识别导出的(例如是剪辑前识别的,或另一版),每个剪点之后的字幕整体前移/错位。
3. **上传校验容差太松,漏过漂移**:`checkSrtDurationMatch()` 只比「SRT 总时长 vs 视频时长」,容差 `max(5s, 视频时长*5%)`(`srt.ts:84`)。6:40(400s)的视频容差达 ±20s —— 恒定偏移/累积漂移在这个范围内全部放行。`checkSrtScriptMatch()` 只比文本相似度(`srt.ts:130-137`),**完全不校验逐行时间对齐**。
4. **时长口径不一致造成尾部丢字幕/滞留**:`DUR` 取自客户端 `<video>` metadata 读到的真实时长(`assemble:134-135` = `talkingHeadDurationSec ?? max(场景末,字幕末)`;`talkingHeadDurationSec` 来自 `readVideoDurationViaElement`,`production-workbench.tsx:86-111`)。字幕末尾被夹到 `Math.min(cap.end, nextStart-0.02, DUR)`(`template.ts:762`),`du<=0.05` 的行直接丢(`template.ts:764`)。SRT 比视频长 → 尾部字幕消失;比视频短 → 最后一条滞留。
5. **连锁**:场景边界、信息卡 `at`、B-roll `at` **全部吸附到 SRT 行 start**(`video-decisions-runner.ts` 的 `nearestSrtStart` 吸附,`srt.ts:143-158`)。SRT 若整体偏离真实音频,则**分场/卡片/字幕一起偏**(整个「脑」建在 SRT 时钟而非音频时钟上)。

### 2.4 小结

字幕校准 = **「无条件信任上传 SRT 作主时钟 + 从不回锚真实音频 + 上传校验只查总时长/文本、不查逐行对齐」**。用户粗剪改了视频时间轴、或 SRT 与最终视频非同一版本时,偏移无人纠、也测不出来。锚点:`video-decisions-runner.ts:391`、`contract/.../video-render.ts:71-81`、`srt.ts:79-93`。

---

## 3. 现有剪辑数据模型(一条片子的「场/卡/字幕」结构 + 用户能改什么)

### 3.1 结构化数据:`VideoDecisions`(`video-decisions-runner.ts:93-101`)

```ts
VideoDecisions = {
  scenes:    VideoScene[]            // {title, startSec, endSec, summary}      —— 无 id,靠数组下标 sceneIdx
  cards:     VideoInfoCard[]         // {sceneIdx, kind, content(单字符串), at, motion?} —— 无 id,无位置字段
  broll:     VideoBrollPick[]        // {sceneIdx, assetId, at, durationSec}    —— 无 id,无位置字段
  subtitles: BilingualSubtitleLine[] // {index, startSec, endSec, zh, en}       —— index=SRT 序号(稳定)
  srtLines:  SrtLine[]               // 时间真值快照
}
```

要点:

- **卡片内容是单字符串 `content`**,kind 特定字段(stat 的 value/label、compare 的左右栏、list 的条目)是**组装器确定性派生**出来的(`assemble-video-render-props.ts:60-107`,如 stat 取 `content` 里第一个数字 token 当 value、整句当 label;compare 按 `vs/↔/对比` 切两半,切不出就降级 quote)。决策层不持有细粒度字段。
- **卡片/B-roll 没有布局位置字段**:画面上的 x/y **完全由 `template.place()` 现算**(§1),数据模型里根本没有「这张卡放哪」的表达。
- **卡片/B-roll 没有稳定 id**:身份 = 数组下标(预览卡就是用 `map` 的 `i` 当 key 和删除依据,`video-decision-preview.tsx:136-160`)。
- **字幕行有稳定 id**(SRT `index`),但**时间不可改**(§2)。

### 3.2 用户现在能改什么(几乎只能删/换,且仅在渲染前)

预览卡 `VideoDecisionPreview`(`video-decision-preview.tsx:70`)明确:「可编辑的两轴:删卡(cards)/ B-roll 换选与移除(broll)。**场景/字幕本期只读展示**」。

| 对象 | 能改吗 | 怎么改 | 代码 |
|---|---|---|---|
| 信息卡 | 只能**删除** | ✕ 按钮从数组剔除 | `video-decision-preview.tsx:151-160` |
| B-roll | **换素材 / 移除** | 下拉换 assetId、✕ 移除 | `video-decision-preview.tsx:178-210` |
| 卡片文案/kind/位置/时间 | **不能** | 无编辑 UI,无数据字段(位置) | —— |
| 场景(分/合/改标题/改边界) | **不能**,只读 | —— | `video-decision-preview.tsx:70` |
| 字幕(文本/时间/位置) | **不能**,只读样例 | 只展示每场前两行 | `video-decision-preview.tsx:216-230` |

而且这些编辑**只在「确认前」有效**:确认即 `assembleVideoRenderProps(edited)` 一次性组装 + 一次性渲染(`production-workbench.tsx:620-699`),渲染是 one-shot。想再动任何东西 = **丢弃决策 → 从头重新跑四决策 AI**(`onDiscardDecisions`,`production-workbench.tsx:701-714`)。没有「持久化的可编辑成片文档 + 增量重渲」。

---

## 4. 对话式 / agentic 剪辑要补的编辑原语 + 切入点

目标交互:用户在聊天框说「把第 3 句字幕往后挪 0.5 秒」「这张卡换个位置别挡脸」「第 2 场太长拆成两场」。

### 4.1 需要的编辑原语(patch DSL,作用于结构化决策文档)

| 原语 | 语义 | 现在离它多远 |
|---|---|---|
| `retimeSubtitle(id, deltaSec)` / `setSubtitleTime(id, start, end)` | 挪某句字幕时间 | **架构性阻塞**:字幕时间被设计成不可改(`video-decisions-runner.ts:391`),连字段落库都锁死回 SRT。需引入「per-line 时间 override」层 |
| `moveCard(id, anchor)` / `setCardPosition(id, x, y)` | 把卡挪到指定位置/避让人脸 | **无法表达**:卡片没有位置字段,x/y 是 `place()` 涌现出来的(§1)。需给 card 加可选 `position/anchor + size override`,`place()` 尊重 override、其余自动流 |
| `editCardText(id, content)` / `setCardKind(id, kind)` / `setCardTone` / `setCardMotion` | 改卡文案/形态/色/动画 | 中等:content 是单字符串,可改;但改 kind 要重走派生。无 UI、无 patch 入口 |
| `retimeCard(id, at)` / `setCardDuration` | 改卡出现时刻/时长 | 近:有 `at` 字段;但 `at` 被吸附到 SRT start,自由挪需放开吸附 |
| `addCard / deleteCard` | 增删卡 | 删已有(仅 UI);增没有 |
| `splitScene / mergeScene / renameScene / setSceneBounds` | 场景增删改 | 远:场景只读,边界由 `decideScenes` 推导(下一场 start / 总时长) |
| `retimeBroll / repositionBroll / swapBroll` | B-roll 改时/位/素材 | swap 有;retime/reposition 没有(同卡片位置问题) |
| `editSubtitleText(id, zh/en)` | 改字幕文本 | 近:有字段,只读展示 |

### 4.2 现有模型离对话式剪辑的差距(4 条硬缺口)

1. **无稳定 id**:身份靠数组下标,patch 语言无法可靠寻址一张卡/一段 broll(删一张后下标全变)。→ 需给 scene/card/broll 补稳定 `id`(字幕已有 `index`)。
2. **卡片/B-roll 无布局位置**:「换个位置别挡脸」在数据层根本无处落笔。→ 需在 card/broll schema 加**可选**位置/区域(如 `anchor: {region, dx, dy}` 或显式 x/y)+ 尺寸 override;`template.place()` 改成「有 override 用 override、无则自动流」。
3. **字幕时间被设计成不可改**:「挪 0.5 秒」当前架构直接禁止。→ 需引入 per-line 时间 override(保留 SRT 为默认,允许 delta),且渲染侧 clamp 逻辑随之调整(`template.ts:762`)。
4. **无持久可编辑文档 + 无增量重渲**:决策是 transient candidate,确认即消费、渲染 one-shot,改动 = 丢弃重跑 AI。→ 需把 `VideoDecisions`(或叠一层 `edits/overrides`)**持久化为项目文档**,chat agent patch 它 → 重组 props → 重渲(理想:只重渲受影响片段)。

### 4.3 切入点(从易到难,复用现有资产)

- **地基已就位**:数据本身是结构化的(scenes/cards/broll/subtitles 都是明确 JSON,`assembleVideoRenderProps` 是纯函数、渲染是纯函数),这是对话式剪辑最值钱的前提 —— 不用从像素级时间轴起步。
- **切入 A(接管确认门,最小闭环)**:把 `VideoDecisions` 落成持久文档 + 补稳定 id;在制作页/复盘页的聊天面挂一组**收窄到当前成片对象**的 patch 工具(参照 `backend/src/modules/ai-runtime/chat-tools.ts` 的工具收窄范式,记忆库「chatbox-scope-tools-to-task」),先支持 `editCardText / deleteCard / addCard / setCardMotion / editSubtitleText / swapBroll` 这些**无新字段**的原语;patch 后走 `assembleVideoRenderProps` 重渲。
- **切入 B(补字段,解锁「挪/移位」)**:给 card/broll 加可选位置 override、给 subtitle 加时间 override;`template.place()` 与字幕 clamp 尊重 override。这一步解锁「挪 0.5 秒」「别挡脸」两个用户原话诉求 —— 但「别挡脸」还需人脸区域信息(现在口播头是 `object-fit:contain` + 固定矩形 PiP 安全区猜测,`template.ts:630-637/120-133`,**无人脸检测**),否则 agent 只能靠用户来回微调。
- **切入 C(治本,顺带修 §1/§2)**:①对文字重合 —— 引入真实测量(渲染 DOM→测高→再定位,或至少 `max-width`+`overflow` 夹断+更保守间距),否则即使允许挪卡,自动流的卡仍会因超估重合。②对字幕校准 —— 加一步「对最终视频做词级强制对齐/重识别」把 SRT 回锚到真实音频,或至少把上传校验从「总时长」升级到「逐行采样对齐」。

---

## 附:关键锚点速查

- 布局贪心流(重合主因):`backend/src/modules/execution/video-render/template.ts:690-709`
- 卡片预估高度(超估源):`template.ts:351-449`(stat:368 / quote:377 / list:395 / compare:419 / code:431 / image:441)
- 字幕渲染 + 夹断:`template.ts:759-777`;字幕带固定 `bottom:56px`:`template.ts:774`
- 口播头 contain / PiP 安全区(无人脸检测):`template.ts:630-637`、`template.ts:120/133`、避让 `template.ts:696-704`
- 字幕时间回填原值(不可改):`video-decisions-runner.ts:373-397`(锁死在 `391`)
- 字幕契约「SRT 主时钟」:`contract/src/resources/video-render.ts:71-81`
- 上传校验容差过松:`srt.ts:79-93`(容差 `max(5, 5%)` 在 `84`)
- 时长口径:`assemble-video-render-props.ts:134-135`、`production-workbench.tsx:86-111`
- 决策数据模型:`video-decisions-runner.ts:93-101`
- 用户可改范围(删卡/换 broll,场景字幕只读):`video-decision-preview.tsx:70`、删卡 `151-160`、换 broll `178-210`
- 确认即 one-shot 渲染 / 改动=丢弃重跑:`production-workbench.tsx:620-714`
