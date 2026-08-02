# CreatorOS 模型配置收敛审计

> 日期：2026-08-01  
> 任务：T-645  
> 状态：用户已确认，按“仅隐藏入口、保留底层能力”实施

> 2026-08-02 补充：渠道模型 authority 改为按 capability 独立裁决。渠道仅完整配置文本时，
> ASR、生图、生视频仍显示并使用本地配置；任何一项缺失、残缺或当前客户端不支持都只影响该项。
> 详见 [逐能力管控 SPEC](../superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md)。

## 结论

设置页只应暴露用户确实需要购买、选择并理解的四类能力：

1. 文本模型（核心）；
2. ASR 语音转文字（建议配置，本地 Whisper 兜底）；
3. 文生图（使用该功能时配置）；
4. 文生视频（使用该功能时配置）。

`web.search`、`knowledge.search.embed`、`asset.classify`、`script.review`、
`chat.fallback` 都属于系统内部能力路由，不应继续要求普通用户逐项理解和配置。
收敛只移除普通设置入口，不删除 capability、数据库行或既有消费者；已有配置与渠道托管配置继续兼容。

```text
用户配置：文本 / ASR / 生图 / 生视频
                    │
                    ▼
系统内部自动路由：搜索 / 素材归类 / 文案审核 / 故障恢复
```

## 真实影响

| 当前配置项 | 真实消费者 | 不再让用户配置后的行为 | 影响 |
| --- | --- | --- | --- |
| 联网搜索 `web.search` | Copilot 找素材、热点依据、每日选题 | 默认使用免 Key 的浏览器搜索；失败时诚实降级为模型记忆或已登记信源 | 低。失去手工切博查/Tavily/SerpApi 的普通入口，主要影响稳定性和速度，不阻断功能 |
| 语义搜索 `knowledge.search.embed` | 知识库混合检索 | 保留关键词检索；无 embedding 时不做语义召回 | 中。近义表达、同义改写的召回率下降，精确关键词不受影响 |
| 素材归类 `asset.classify` | 图片上传后的视觉标签与一句话描述 | 上传、存储、文件名/类型归类继续；AI 视觉标签与描述在无托管模型时跳过 | 中低。素材量大时自动匹配质量会下降，但不影响素材入库和手工使用 |
| 文案审核 `script.review` | 发布前 L1 规则 lint + L2 语义审核 | L1 确定性审核不变；L2 直接复用主文本模型 | 很低。只损失专用审核模型的细微准确率/成本优势 |
| 备用模型 `chat.fallback` | 主对话模型在流开始前重试耗尽后的单次接管 | 主模型仍按现有策略重试；无系统托管备用时，耗尽后直接给可重试错误 | 低频但故障时明显。正常质量与速度不受影响，只降低供应商故障时的可用性 |

## 推荐交互

### 普通设置页

- “重点配置”：文本模型、ASR。
- “创作媒体（按需）”：文生图、文生视频。
- 不再显示“更多能力（7 项）”以及上述五张内部能力卡。
- 生图/生视频未配置时，在用户真正点击对应功能时就地提示配置，不要求提前理解全部能力。

### 系统内部

- 搜索：`web.search` 无专配时继续默认 `browser`，不要显示“未配置搜索模型”。
- 文案审核：固定走 `script.review → default` 回退链；UI 只展示实际模型名，不再强调“非专用”。
- 素材归类：保留 best-effort 任务和确定性第一层；有渠道托管视觉模型或历史专配行时继续增强。
- 备用模型：保留恢复层与既有专配行兼容；普通用户不配置，渠道托管版本可在后台统一提供异厂商备用。
- 语义搜索：短期关键词降级；后续若要恢复语义能力，优先内置本地 embedding 或由渠道托管，避免重新把技术项抛给用户。

## 不建议的做法

- 不删除 capability 或历史配置行，否则升级会让已有用户能力突然失效。
- 不把主文本模型假装成 embedding 或视觉模型；协议/输入类型不兼容。
- 不把备用模型自动设置成主模型自身；同一故障域内重复调用没有备用价值。
- 不因移除配置入口而把搜索、审核包装成“全部正常”；降级结果仍需如实展示。

## Growth 渠道默认模板同步结论

Growth 的“加载产品示例”也应收敛为普通用户当前真正需要配置的四类能力；这是默认模板精简，
不是删除协议能力。既有渠道历史 revision 与 CreatorOS 底层 capability 继续兼容。

### 默认模板删除

- 删除 `models.chat.fallback`；普通用户不再准备第二家供应商，渠道若确有跨故障域托管需求可在高级套餐显式增加。
- 删除 `models.script.review`；审核直接复用 `models.default`。
- 删除 `models.asset.classify`；无专用视觉模型时只做确定性归类。
- 删除 `models.knowledge.search.embed`；无向量模型时诚实降级关键词检索。
- 删除 `models.web.search`；复用 CreatorOS 零配置 `browser` 搜索，失败时按既有语义诚实降级。
- 删除随之失去引用的 `connections[id=relay-search]`；Growth validator 要求每个 connection 至少被一个 model 引用，孤立连接会使整个套餐校验失败。
- `models.default` 从两个示例收敛为一个默认文本模型。当前 CreatorOS 对渠道数组只采用 `isDefault=true`（否则第一项），尚没有面向用户的渠道模型选项切换；继续放第二个 `text-quality` 会形成不可选择的假选项。

### 默认模板保留

- `models.default`：核心文本、对话、选题与写稿。
- `models.transcribe.audio`：建议配置，未配置仍可走本地 Whisper。
- `models.image.generate`：按需生图。
- `models.video.generate`：按需生视频。
- `relay-text`、`relay-media`、`relay-video`：仅在仍被上述模型引用时保留；连接按真实服务端点划分，不为每个 capability 机械建一个。

### 发现的发布阻断

当前 Growth `creatoros-model-config-v1` 模板采用 `connections[] + model.connectionId`，且明确不保存
用户 Key；CreatorOS 当前 `channel-model-config.ts` 却仍从选中的 model item 直接读取
`provider/baseURL/apiKey`，没有解析 `connectionId`，也没有把连接与本机用户 Key 合并。因而当前
模板即使通过 Growth validator，直接成为 `channel` authority 后也无法形成可调用配置。

同时，CreatorOS 当前 `modelOption()` 对所有 capability 都执行“精确项不存在就回退
`models.default`”。模板删除五个内部能力后，这会错误地产生：`chat.fallback` 重新调用主模型、
`web.search` 把文本模型当搜索服务、embedding/视觉能力把普通文本模型当专用模型。渠道解析必须
改成按能力族裁决：只有普通文本生成与 `script.review` 可以回退主文本模型；搜索回退零配置
browser；备用、embedding、视觉等缺专配时返回未配置/诚实降级，绝不能通用回退 `default`。

在改 Growth 默认模板并实际绑定渠道前，必须一次性补齐：

1. CreatorOS 按 `connectionId` 解析公开连接；
2. 从本机安全存储选择该连接对应的用户 Key；
3. 投影成文本/ASR/图片/视频 adapter 的真实调用配置；
4. 用能力族回退矩阵取代通用 `models.default` 回退；
5. 缺 Key、未知连接或协议不兼容时就地提示，不能回退到另一能力或把 `default` 文本模型冒充多模态模型。

否则只能把精简模板作为未来示例保存，不能宣称渠道模型已可用。
