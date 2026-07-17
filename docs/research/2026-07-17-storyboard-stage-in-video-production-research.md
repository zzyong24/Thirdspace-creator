# 分镜(storyboard)属于生产流程哪个阶段 — 业界惯例调研

- **日期**:2026-07-17
- **类型**:research-as-asset(调研归档)
- **触发**:CreatorOS 现状——script.draft 一步产口播/画面/字幕三栏,制作阶段四决策又基于实拍 SRT 重新决策分场/信息卡/B-roll,**两次分镜互相冲突**。需裁决「分镜该在哪个阶段生成」:A 写稿时同步产 / B 脚本定稿后独立步 / C 完全交给制作阶段。
- **方法**:WebSearch/WebFetch(传统影视 pre-production 流程、中英文口播创作者教程、工具竞品文档)+ 仓内反证(SPEC `2026-07-17-structure-script-storyboard-consistency-design.md`(T-387)、`backend/src/modules/ai-runtime/video-decisions-runner.ts`)。联网可达来源均标注;个别属常识性行业惯例的以「已知,未单独引证」标注。
- **拍板**:本文给推荐(§5),最终拍板权在用户;与已过审的 T-387 SPEC 方向做了对照。

---

## 0. 一句话结论

**业界三条线(传统影视 / 口播创作者 / 工具竞品)一致指向:分镜=「定稿脚本之上的独立规划步」,在拍摄前完成;拍摄后的工作是「对齐与修正」(基于实拍转写做粗剪、贴计划好的素材),不是二次创作。** 推荐 **B(增强版)**:写稿时的「画面」列保留为**视觉意图草稿**,**采纳/定稿时刻**凝固为结构化分镜真源(配上真实素材点名+缺料清单),制作阶段四决策降级为「对齐到实拍 SRT 的对齐器」——这与已写就的 T-387 SPEC 方向吻合,本调研为其提供业界佐证 + 一处补强建议(定稿时刻的 storyboard 凝固/校验 pass)。

---

## 1. 传统影视/广告工业流程(基线)

### 1.1 标准顺序

Pre-production 的公认顺序(StudioBinder 8 步流程):**锁定拍摄剧本(locked script)→ script breakdown(拆元素:演员/道具/场景)→ 创作规划(storyboard + shot list)→ 细化预算与拍摄计划 → 拍摄 → 剪辑**。分镜明确排在「剧本锁定之后、开拍之前」。

| 环节 | 谁做 | 输入 | 输出给谁 |
|---|---|---|---|
| 剧本锁定(locked script) | 编剧+制片 | 定稿剧本(场次编号从此不变) | 全组的单一真源 |
| Script breakdown | 副导演/line producer | 锁定剧本 | 预算、拍摄计划 |
| **Storyboard** | **导演+摄影指导(DP)+美术,常配分镜师执笔** | **锁定剧本** | 摄影/美术/全组(传达导演视觉意图) |
| Shot list | 导演/摄影指导/副导演 | 剧本+storyboard | 摄制组(逐镜执行清单:景别/机位/运动) |
| 拍摄 | 摄制组 | shot list + storyboard | 素材 → 剪辑 |
| 剪辑 | 剪辑师 | 实拍素材 + storyboard(参考) | 成片 |

要点:**storyboard 视觉化每个镜头,shot list 把它组织成可执行指令**;两者的首要功能是「沟通」——让全组理解导演意图([StudioBinder: Shot List vs Storyboard](https://www.studiobinder.com/blog/shot-list-vs-storyboard/))。

### 1.2 为什么必须在「锁定剧本」之后

- **最常见的失败模式就是 storyboard 画得太早**(故事未稳):剧本一改,视觉全返工,「churn 让成本在开拍前就膨胀」([Storyflow: Pre-Production Checklist](https://storyflow.so/blog/pre-production-checklist-template-2026))。
- **决策在 pre-production 便宜、在 production 昂贵**——流程设计就是把所有决策压进便宜阶段,让昂贵阶段只做执行(同上)。
- Toon Boom Storyboard Pro 等专业工具的工作流直接「从 Final Draft 定稿剧本创建分镜项目」——工具形态本身就编码了「先定稿、后分镜」([Toon Boom docs](https://docs.toonboom.com/help/storyboard-pro-24/storyboard/project/create-project-final-draft.html))。

**基线结论:传统工业里分镜=pre-production 尾声、基于定稿剧本的独立步;剪辑阶段不重新发明分镜,只按实拍素材落地它。**

---

## 2. 口播/观点类短视频创作者的实际做法(与 CreatorOS 用户同型,重点)

### 2.1 英文圈 talking-head + B-roll 惯例

- **「专业创作者在拍之前就规划 B-roll;业余创作者拍完才想起来」**——逐行过定稿口播稿,对每个论断问「说这句时屏幕上该出现什么」,写下来;标注 B-roll/文字浮层/动效出现的位置。「这种预规划在剪辑时省大量时间」([Tinyfool's YouTube Lab](https://tinymedialab.com/2025/10/578/)、[Pixflow: Video Scripting Guide](https://pixflow.net/blog/plan-video-scripts-before-editing/))。
- 不是每句都要配画面——**有些留在 talking head 上,但必须是「有意识的决定」,不是剪辑时才发现缺口**(同上)。
- 备料量目标:B-roll 时长 ≈ talking-head 的 3-5 倍,拍摄/收集在剪辑开始前批量完成([Vugola: B-Roll Footage](https://www.vugolaai.com/blog/b-roll-footage-tips))。
- 标注格式即「口播句 → 切到:画面描述」的两栏映射(如 `[谈创造力] → 切到:速写本/日出/打字`)。

### 2.2 中文圈口播分镜表惯例

- 表格式分镜脚本通行字段:**镜号/景别/运镜/画面内容/台词(口播)/字幕/时长/BGM/备注**([知乎:表格式分镜脚本该怎么写](https://zhuanlan.zhihu.com/p/148789620)、[知乎:短视频分镜头脚本撰写](https://zhuanlan.zhihu.com/p/127208419))。CreatorOS 的「口播/画面/字幕」三栏正是它的精简形。
- 完整交付物「五模块:标题、口播台词、**分镜镜头建议**、字幕拆分、BGM 推荐,可直接复制给剪辑师」——即**稿定之后、拍摄之前**产出、同时喂给拍摄和剪辑两端([迅课:口播脚本攻略](https://www.ixunke.com/article/356))。
- 「分镜头脚本写完要打印出来,演员、拍摄提前熟悉;按实际场景顺拍省时间」——分镜是**拍摄的输入**,不是剪辑时的产物([知乎:分镜头脚本绘制方法](https://zhuanlan.zhihu.com/p/141998659))。

### 2.3 实拍之后,计划怎么被修正(关键环节)

- 口播实拍必然偏离稿子:口误、临场改词、时长变化。业界解法是 **transcript-based rough cut**:先转写实拍→在逐字稿里删口误/废句拉出粗剪→**再把预先计划的 B-roll/浮层贴到粗剪上**(Descript、Premiere text-based editing 的标准工作流,见 §3)。
- 即:**修正的对象是「时间轴对齐」,不是「画面配什么」**。配什么在稿定时已决定;录完只是把这些决定吸附到真实时间码上,口误剪掉的句子其对应画面计划一并作废。
- (已知,未单独引证的行业常识:成熟口播创作者不会在剪辑台上重新想「这句配什么」——那是备料没做完的补救,不是流程。)

**结论:口播创作者的分镜表=稿定后、录制前的独立产物;三栏/多栏映射表同时指导「录什么、备什么料」和「剪辑贴哪」;录完只做对齐修正。与传统工业同构,只是分镜从画幅草图退化为文字表格。**

---

## 3. 工具竞品的阶段设计

| 工具 | 分镜/画面规划放在哪个环节 | 机制 | 对应选项 |
|---|---|---|---|
| **剪映/CapCut 图文成片** | **稿后自动**(独立步,一键) | 输入定稿文案 → 按句切场景 → 关键词智能匹配素材/字幕/配音 → 生成后可精修([CSDN 教程](https://blog.csdn.net/m0_53619432/article/details/135879279)) | B(自动化的) |
| **Pictory** | **稿后自动**(scene per sentence) | 粘贴定稿脚本 → 逐句成 scene → 关键词查 Storyblocks 配画面;支持稿内嵌 `[insert product demo]` 类**画面提示语**引导匹配([Pictory: Script to Video](https://pictory.ai/academy/how-to-turn-script-into-video-pictory-ai)) | B,且提供「写稿时留视觉钩子」的 A 味补充 |
| **HeyGen** | 稿后自动 | 脚本 → 切分为 video storyboard + 配 stock footage/字幕,avatar 念稿([HeyGen: Script to Video](https://www.heygen.com/tool/script-to-video-ai)) | B |
| **Descript** | **录后对齐**(创作性规划仍在稿) | 录制→自动转写→**改文字=改视频**拉粗剪→逐句「哪句需要画面」就地生成/放置 B-roll([Descript](https://www.descript.com/video-editing)、[Greg Preece workflow](https://gregpreece.com/articles/ai-video-editor-descript-workflow)) | 录后环节做的是**对齐+落位**,非从零分镜 |
| **Premiere text-based editing** | **录后对齐** | 实拍转写→在 transcript 里删词删句=timeline ripple 剪辑→拉出 rough cut 后再精修/贴素材([Adobe helpx](https://helpx.adobe.com/premiere/desktop/edit-projects/edit-video-using-text-based-editing/edit-sequences-using-text-based-editing.html));「为访谈/口播这种 45 分钟素材剪出 8 分钟可用内容的场景而生」([Frame.io blog](https://blog.frame.io/2023/10/16/premiere-pro-text-based-editing/)) | 录后=修正,非创作 |

**竞品共识:没有一家把「画面配什么」的创作决策放在剪辑/制作阶段从零做。** 要么稿定后一键自动配(剪映/Pictory/HeyGen),要么录后只做 transcript 对齐 + 把既定画面落位(Descript/Premiere)。Pictory 的 `[画面提示语]` 机制还证明:**写稿时留下视觉意图、稿定后由独立步兑现**是被产品化验证过的分工。

---

## 4. 选项对比(全量保留)

| 选项 | 描述 | 业界对应 | 优点 | 致命缺陷 | 判定 |
|---|---|---|---|---|---|
| **A. 写稿时同步产**(现状 script.draft 三栏) | 口播/画面/字幕一步生成 | Pictory 的稿内画面提示语(仅作提示,非真源) | 写稿即有画面感;一步到位省交互 | ①稿未定,画面跟着废稿返工(=Storyflow 说的「storyboard 太早的 churn」);②画面列纯文本无人消费(仓内 AS-IS 实证:video-decisions 只吃 SRT+纯文本);③写稿时不知道素材库有什么,画面列易虚构 | **否决为「真源」,保留为「意图草稿」**:业界证明写稿时留视觉钩子有价值,但它不是分镜本体 |
| **B. 脚本定稿后独立步**(pre-production 尾声) | 定稿口播稿+已有素材 → 分镜表 → 指导录制与备料 → 制作只对齐 SRT | 传统工业(locked script→storyboard)、口播创作者分镜表、剪映/Pictory 稿后成片 | ①决策压进便宜阶段;②分镜同时喂拍摄(读什么/备什么)和剪辑(贴哪);③素材库此时已知,可点名真实素材、缺料显式化;④制作阶段职责变纯:对齐器 | 多一步交互(可用「采纳定稿时自动触发」抹平);定稿后再大改稿需重跑分镜(业界答案:就该重跑,这正是锁稿的意义) | **✅ 推荐** |
| **C. 完全交给制作阶段**(现状四决策独走) | 写稿不管画面,制作基于实拍 SRT 从零决策分场/信息卡/B-roll | 无——业界无此流程;最接近的 Descript/Premiere 录后环节也只是对齐既定计划 | 决策基于真实时间轴,无对齐误差 | ①「业余创作者拍完才想 B-roll」= 被教程点名的反模式;②录制时无分镜指导→念稿无画面意识、备料无清单;③素材缺口在最贵阶段才暴露;④推翻 authored 意图(仓内实证:与三栏必然漂移) | **否决** |

### 被否决项与理由(明细)

- **A(作为分镜真源)否决理由**:传统工业「storyboard 必须基于 locked script」的第一性原因(避免 churn、决策进便宜阶段)在写稿阶段全部不成立——稿在迭代、素材库未对照、无人消费。但 Pictory 提示语机制证明其「意图草稿」价值,故不是删除三栏,而是降级其地位。
- **C 否决理由**:三条线零支持。英文教程明示这是业余反模式;竞品录后环节全部是「对齐」而非「创作」;仓内 AS-IS 已实证它导致两套分镜互相冲突。SRT 作为时间真值应保留(这是 C 唯一站得住的部分,已被 B 吸收:对齐到 SRT)。

---

## 5. 对 CreatorOS 的裁决建议

### 5.1 推荐:B(增强版)——「写稿留意图,定稿凝分镜,制作只对齐」

三阶段分工(每层的业界佐证见 §1–§3):

1. **写稿时(script.draft)**:三栏保留,「画面」列定位为**视觉意图草稿**(= Pictory 提示语);T-387b 的结构化 `visual` 字段(描述+assetRefs+missing)方向正确。
2. **定稿/采纳时刻 = 分镜生成的正式阶段**(本调研对 T-387 的**补强建议**):采纳整稿的动作应触发一个**storyboard 凝固 pass**——对照最终采纳文本(用户可能手改过)+ 当时的项目素材库,校验/刷新每 section 的 visual(意图还成立吗、点名素材还在吗、missing 清单更新),产出**分镜真源快照**。这对应传统工业的「locked script → storyboard」时序:分镜必须基于「最终文本」,而 script.draft 产出的 visual 基于的是「草稿文本」——用户采纳前的手改会让两者漂移,凝固 pass 补上这个缺口。
3. **录制前**:分镜真源驱动备料(B-roll 自动聚合 = T-387c)与录制指导(创作者知道哪句要留 talking head、哪句会切画面——影响念稿节奏,见 §2.2「打印出来提前熟悉」)。
4. **制作阶段(四决策)= 对齐器**:实拍 SRT 仍为时间真值;四决策把 authored 分镜吸附到 SRT 时间轴、口误剪掉的句子对应画面作废、仅 authored 空白段自主补——精确对应 Descript/Premiere 的「transcript rough cut 后贴既定素材」惯例。字幕决策(文本校正)不变。

### 5.2 对三个断层的衔接建议

| 断层 | 衔接(业界对应) |
|---|---|
| **论点素材断层**(thesis 不挂素材) | planning 阶段 AI 预挂(= script breakdown 拆元素的前移),流入脚本 visual.assetRefs;T-387a 即此 |
| **脚本画面列断层**(无人消费) | 结构化 + 定稿时凝固为分镜真源,双向喂拍摄与剪辑(= 口播创作者「五模块直接给剪辑师」);T-387b + §5.1(2) 补强 |
| **B-roll 备料断层**(手动孤岛) | 分镜点名素材 + 论点素材 + 弹药自动聚合进备料,录制前完成(= 英文圈「剪辑开始前批量备齐 3-5x B-roll」);T-387c 即此 |

### 5.3 与 T-387 SPEC 的关系

T-387(已写就)选择的「三栏 visual 结构化 + 四决策降为对齐器」与本调研推荐的 B 增强版**方向一致**,业界证据全面支持其核心裁决(authored 视觉意图为真源、四决策不推翻只对齐、SRT 恒为时钟)。唯一增量建议:在 T-387b 落地时把「采纳整稿」时刻升格为 storyboard 凝固/校验 pass(§5.1(2)),而非仅在 draft 生成时产 visual——成本极小(一次校验调用或纯规则核对 assetRefs 存活+missing 刷新),换来「分镜基于最终文本」的工业时序保证。

**拍板依据**:传统影视工业流程(§1,StudioBinder/Storyflow)、中英文口播创作者惯例(§2,Tinyfool/Pixflow/知乎/迅课)、五家工具竞品的阶段设计(§3)三线交叉验证,零来源支持 C,A 仅以「意图草稿」形态存活;仓内 AS-IS(video-decisions 不读画面列、两套分镜冲突)为反模式提供了本地实证。最终拍板:待用户。

---

## 来源清单

**传统工业流程**
- [StudioBinder: Pre-Production Process Explained in 8 Steps](https://www.studiobinder.com/blog/the-complete-pre-production-process/)
- [StudioBinder: Shot List vs Storyboard](https://www.studiobinder.com/blog/shot-list-vs-storyboard/)
- [No Film School: Pre-Production Basics — Storyboard to Shot List to Script Lining](https://nofilmschool.com/pre-production-basics-storyboard-shot-list-script-lining)
- [Storyflow: Pre-Production Checklist](https://storyflow.so/blog/pre-production-checklist-template-2026)
- [Toon Boom: Creating a Project from a Final Draft Script](https://docs.toonboom.com/help/storyboard-pro-24/storyboard/project/create-project-final-draft.html)
- [StudioBinder Support: Locked vs Unlocked Scripts](http://support.studiobinder.com/en/articles/2935089-the-difference-between-locked-and-unlocked-scripts)

**口播/短视频创作者惯例**
- [Tinyfool's YouTube Lab: Why YouTube Video Needs B-Roll](https://tinymedialab.com/2025/10/578/)
- [Pixflow: Video Scripting Guide — Plan Content & Cut Editing Time](https://pixflow.net/blog/plan-video-scripts-before-editing/)
- [Vugola: B-Roll Footage Tips](https://www.vugolaai.com/blog/b-roll-footage-tips)
- [Riverside: Talking Head Videos](https://riverside.com/blog/talking-head-videos)
- [知乎:表格式分镜脚本该怎么写](https://zhuanlan.zhihu.com/p/148789620)
- [知乎:4000字干货—短视频分镜头脚本撰写](https://zhuanlan.zhihu.com/p/127208419)
- [知乎:分镜头脚本的绘制方法](https://zhuanlan.zhihu.com/p/141998659)
- [迅课:短视频口播脚本实用攻略](https://www.ixunke.com/article/356)

**工具竞品**
- [CSDN:剪映如何使用图文成片](https://blog.csdn.net/m0_53619432/article/details/135879279)
- [Pictory: How to Turn a Script into a Video](https://pictory.ai/academy/how-to-turn-script-into-video-pictory-ai)
- [HeyGen: Script to Video AI](https://www.heygen.com/tool/script-to-video-ai)
- [Descript: AI Video Editing](https://www.descript.com/video-editing)
- [Greg Preece: My Descript Workflow](https://gregpreece.com/articles/ai-video-editor-descript-workflow)
- [Adobe helpx: Text-Based Editing in Premiere](https://helpx.adobe.com/premiere/desktop/edit-projects/edit-video-using-text-based-editing/edit-sequences-using-text-based-editing.html)
- [Frame.io: How Premiere Pro's Text-Based Editing Transforms Filmmaking](https://blog.frame.io/2023/10/16/premiere-pro-text-based-editing/)

**仓内反证**
- `docs/superpowers/specs/2026-07-17-structure-script-storyboard-consistency-design.md`(T-387,AS-IS 三断裂 + 一致性契约)
- `backend/src/modules/ai-runtime/video-decisions-runner.ts`(四决策只吃 SRT+纯文本的实证)
