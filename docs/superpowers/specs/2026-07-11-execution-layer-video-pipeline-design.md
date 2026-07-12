# SPEC:垂类智能体执行层(脑手分离)+ 首个 executor:制作视频管线(HyperFrames 模板化)

> 日期 2026-07-11 · 状态:✅ **PASS(MiniMax gate,1 minor 已内联)→ 可开工 T-255a→T-254a/b/c**(见 .review.md) · 对照宪法 [docs/产品定位.md](../../产品定位.md)
> 单一执行总账在 [BACKLOG.md](../../../BACKLOG.md)(T-254/T-255)。来源:用户诉求「制作阶段加制作视频 tab(提词录制→SRT+粗剪上传→B-roll+包装)」+「要垂类智能体,可对开源智能体套壳」;T-254 调研(skill 蒸馏+集成点)+T-255 调研(四+四引擎联网盘点+三案对比)。**用户已双拍板:渲染器=HyperFrames;路线=A→B 演进式。**

## 0. 一句话

给编导装上「手」:**taskType 枚举 + 沙箱 + 执行结果确认卡**的可插拔执行层(A 案确定性 executor 先行,接口按 B 案形状建,将来可零改动注册开源引擎 executor);首个 executor = **video.render**:用户上传粗剪人物视频+SRT → AI 产结构化决策 JSON(分场/卡片/B-roll 插点/双语字幕)→ HyperFrames 模板确定性渲染 → 成片过确认门入库。制作阶段「制作视频」tab 复活沉睡的 production 契约。

## 1. 问题与方向(用户表态+调研实锤)

- 「只做聊天框没用」:编导能想不能干——缺执行力。CodeX 体验=顶级模型×harness 双加成,用户自配 MiniMax 下「嵌引擎自由发挥」上限有限(联网盘点:goose 等明确吃 tool-calling 质量)→ **确定性执行+结构化决策**才是弱模型下的稳定路径(本产品既有纪律)。
- 制作阶段前端为零(T-246 审计:production 6 op 后端全套沉睡,前端 301 壳,T-076 退役注释明写「将来回归时复用」)。
- 「模板+JSON props」形态**已被用户真实项目验证**(e03-opendesign:ProofBoard 模板+data.ts;e03-opendesign-hf:HyperFrames 版 build_hf.py 同数据驱动)。
- **Remotion license 地雷**:source-available 商业协议,分发商业产品大概率触发付费+per-render 条款 → 用户拍板 HyperFrames(HeyGen 开源 Apache 2.0,亲测迁移过,渲染依赖增量几十 MB,复用 sidecar 已打包 Chromium)。

## 2. 设计 A:执行层框架(T-255,脑手分离)

> 复用锚:live dispatch 范式(persistence-client dispatch→void runXxxTask,MEMORY 铁律)/ai_task 六态+AITaskStep 步骤流(无 progress 字段,步骤流当进度)/chat-tool-gate 统一门(T-239a)/abort signal 贯通(T-239c 直接复用到子进程 kill)/local-reveal-security 路径防护+T-253 敏感文件 denylist(共库)/确认门铁律②。

- **任务契约(脑→手)**:`{ taskType(枚举), goal, inputs:[{assetId,mountAs}], params(per-taskType zod), constraints:{timeoutSec,network:deny|allowlist,maxOutputMB} }`。
- **沙箱**:`workspaces/<taskId>/`(input/ 只读物化 + out/ 产物区);**引擎/executor 永不直连 PGlite/资产库**——输入由 sidecar 物化为文件,输出只认 out/。数据壁垒全留脑侧。
- **executor 可插拔**:每 taskType 注册一个 executor(A 型=确定性脚本;B 型=开源引擎子进程)。**B 案启动条件与首选**:某类任务确需 agent 循环时注册,首选 **OpenCode**(MIT/官方 @opencode-ai/sdk 进程内 createOpencodeServer+Client=Node sidecar 原生形态/75+ provider 任意 OpenAI-compatible 直配 MiniMax/per-tool permission),次选 goose(Apache-2.0 Rust 单二进制+stream-json);dispatch/沙箱/确认卡零改动。**C 案(整壳迁移)明确否决**(壁垒流失+工程最大+体验不升)。
- **执行结果确认卡**:产物清单+预览(视频缩略/文本 diff)+ 采纳(拷入项目资产落库)/重试(带修改意见)/丢弃。**产物落 workspaces 不算落库,采纳才入**(铁律②)。与 T-253 同一权限模型两面(读=确认卡/产=确认卡),denylist 共库。
- **安全诚实边界**:无 docker 前提下网络隔离是弱保证(v1 默认 network=deny,渲染类不需要网);超时+maxOutput 硬顶;abort 贯通。
- **进度**:ai_task + AITaskStep(素材预处理/捕帧 N/M/编码/转码 各 step),超时/失败诚实终态绝不卡 running(T-207 sweep 兜底已在)。

## 3. 设计 B:首个 executor —— video.render(T-254,HyperFrames 模板化)

> 复用锚:production 契约 6 op 全套(productionMode/status/recordingConfig/subtitleConfig/segment usageType=broll·caption/exportRecord queued·rendering·ready·failed——完整映射本需求)/assets subtitle+video 类型/两阶段上传链/runStructuredNode+外置模板(registry)/material-links B-roll 来源。skill 蒸馏锚:e03 工程 Scene/Card 六 kind 类型=天然 props schema;SRT 主时钟铁律;spotlight→dock;PiP 规则(≥3 视觉节点→左下圆,hook/CTA→右大卡)。

### 3.1 工作流(tab 内)
1. **备料**:显示口播稿(提词用)+ 录制指引 → 用户录制 → 上传**粗剪人物视频**(video asset)+ **SRT**(subtitle asset,契约现成)。**SRT 匹配校验**(skill 两次实锤踩过传错):时长 vs 视频时长、文本 vs 口播稿相似度,不匹配挡在提交前。
2. **AI 决策(4 个 runStructuredNode,零代码生成)**:①语义分场+场景包装(场景边界必须落 SRT 行边界,zod refine)②信息卡文案与插点(kind∈六枚举,数值文案只从口播原文提取禁编造——T-224 同源)③B-roll 选择与插点(输入=素材清单投影,硬规则:精确匹配被讲对象禁近似替代/label 禁内部词)④双语字幕补全(ASR 错字校正+英文行)。**`at` 插点吸附 SRT 行 start 集合**(zod refine+后处理,跨模型稳定关键)。
3. **决策确认**:props JSON 渲成「分场预览卡」(场景列表+卡片+B-roll 缩略)用户过目可改(至少能改 B-roll 选择/删卡),确认才渲染。
4. **渲染(video.render executor)**:素材预处理(ffprobe 探针+HEVC→H.264 proxy+短 GOP `-g 30`,skill 坑单全防)→ props 组装 → HyperFrames 模板生成 index.html → `hyperframes render`(puppeteer-core executablePath 指向 sidecar 已有 playwright Chromium)→ 交付转码(1920x1080/30fps/H.264/yuv420p/bt709/faststart 固定命令)→ exportRecord+asset 落库(经确认卡采纳)。实测量级:3 分钟成片≈3-10 分钟渲染,ai_task 步骤流报进度。
5. **production 状态机**:tab 操作驱动 productionMode/status(drafting→recording→editing→rendering→ready),复活沉睡契约。

### 3.2 HyperFrames 模板工程
- 仓内新增固定合成模板(以 e03 ProofBoard/CardView/TalkingHead/Captions 打法泛化为 HTML 模板生成器,参照用户 build_hf.py 已验证形态):场景/六 kind 卡片/右大卡↔圆 PiP/spotlight→dock/双语字幕/品牌角标+进度条;special 动画=**预设枚举 3 个**(pipeline/comparison/steps),**AI 不写任何模板代码**。
- props zod schema 即 §T-254 调研草案(meta/talkingHead/captions/scenes[].cards[]/delivery)。
- 依赖:@hyperframes/cli+engine+core + puppeteer-core(几十 MB 增量);**ffmpeg 依赖策略**:v1 检测系统 ffmpeg,缺失诚实引导安装(`brew install ffmpeg`);打包 ffmpeg-static 作后续优化项(避免再+80MB)。

### 3.3 tab UI(改动面=调研已列 6 文件)
- shell-router PROJECT_STAGES 加 `{id:"production",label:"制作视频"}` + LEGACY_STAGE_SEGMENT 调整;production/page.tsx 去 301 改真实页;stage-chat-wrapper 加 production 段(编导对话右栏);persistence-client 接 production ops。

## 4. 边界(防走样)

- **AI 不写代码**(v1 铁律):模板固化+决策 JSON;special=枚举预设。
- **不做**:Open Design/PPT 阶段(模板固化替代)/Whisper(SRT 用户导出)/分布式渲染/AI 视觉 QA(确定性检查+关键帧预览给人)。
- **渲染器不写死**:HyperFrames 为 v1 选型(用户拍板),props schema 渲染器无关(skill 打法已在两个渲染器上验证),将来可换。
- 模型全走 model-config 用户可配(决策 runner 同现有 capability 机制)。
- Remotion 不进依赖(license 风险,已拍板弃)。

## 5. 切片(拆 Task)

- **T-255a** 执行层框架:execution_tasks 契约+沙箱+executor 注册表+执行结果确认卡+abort/超时/步骤流(A 型接口按 B 形状)。
- **T-254a** HyperFrames 模板工程+props zod schema+确定性渲染 executor(video.render,含素材预处理/交付转码/ffmpeg 检测引导)。
- **T-254b** 四决策 runner(分场/卡片/B-roll/双语字幕,runStructuredNode+registry 模板)+决策确认预览卡。
- **T-254c** 制作视频 tab UI(6 文件改动面+上传链+SRT 匹配校验+production 状态机接线)。
- **T-255b**(后置,条件触发)OpenCode executor 集成——某类任务确需 agent 循环时启动,先定点核实 @opencode-ai/sdk 嵌入细节;**[gate-F1 minor 处置] 许可归属义务**:MIT/Apache-2.0 依赖(OpenCode/goose/HyperFrames)集成时在 app「关于/开源许可」页收录 LICENSE+NOTICE 全文(桌面产品惯例),T-255b/T-254a 实施清单各含此项。

## 6. 验收

- tab 内:传粗剪视频+SRT(错 SRT 被校验挡)→ AI 产分场预览卡(插点全在 SRT 行上,卡片文案可溯口播原文)→ 确认 → 渲染任务步骤流走完 → 成片确认卡预览 → 采纳入库(exportRecord=ready);全程 MiniMax 可跑。
- 中断/超时:渲染中点停/杀 app → 任务诚实终态(结合 T-207 sweep),沙箱可清理。
- 安全:executor 读不到沙箱外;敏感文件 denylist 生效;产物未采纳不入库。
- 三端 typecheck+单测绿(决策 schema 吸附 refine/模板生成器快照/渲染 executor 用 fake 引擎);渲染归 sidecar 真机验(真视频端到端一条)。
