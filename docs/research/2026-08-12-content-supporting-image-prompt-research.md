# T-792 内容辅助型文生图提示词：公开调研、基线与落地边界

日期：2026-08-12

## 结论

CreatorOS 不该用一份更长的“万能生图咒语”解决配图质量。真正缺的是两层之间的连接：

1. 视觉编导先判断画面为当前口播承担什么认知任务；
2. 再把这个任务翻译成生图模型能执行的具体主体、动作/关系、环境、构图与约束。

文字负责提出判断；图片负责让观众看见证据、机制、关系、反差或后果。图片若只是重复主题、复述口播或营造“科技感”，即使画得漂亮也不算帮助内容。

## 公开资料给出的稳定共识

- OpenAI 的官方生图指南建议明确媒介、材料/质感、构图、视角、人物动作与约束；生产工作流应使用结构清楚的 prompt、显式约束和小步迭代。它还指出，图内文字虽已改善，精确位置和清晰度仍可能出错。因此，正文 B-roll 默认不依赖图内文字，只有封面指定短文案时才逐字限定。[OpenAI GPT Image prompting guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide) · [OpenAI image generation guide](https://developers.openai.com/api/docs/guides/image-generation)
- Google Imagen 的官方指南把主体、背景/上下文、风格作为基础，并进一步用构图、视角、光线、镜头和色彩控制结果；同时强调从清晰主意开始再逐步迭代。[Google Cloud Imagen prompt guide](https://cloud.google.com/vertex-ai/generative-ai/docs/image/img-gen-prompt-guide)
- Midjourney 官方也建议优先描述想看见的内容，明确主体、媒介、环境、光线、色彩、情绪和构图，避免过长的指令清单；使用参考图时，文字 prompt 仍应描述最终画面，而不是写“模仿/修改参考图”的元指令。[Midjourney Prompt Basics](https://docs.midjourney.com/hc/en-us/articles/32023408776205-Prompt-Basics) · [Midjourney Style Reference](https://docs.midjourney.com/hc/en-us/articles/32180011136653-Style-Reference)
- 供应商能力并不一致。Google 文档明确显示负向 prompt 只受部分旧 Imagen 型号支持；CreatorOS 的 `image.generate` 又允许用户配置不同供应商，因此本轮不写 `--no` 等供应商专属语法，而把必要排除项放进普通自然语言约束。[Google Cloud negative prompt compatibility](https://cloud.google.com/vertex-ai/generative-ai/docs/image/omit-content-using-a-negative-prompt)

这些官方指南解决“模型怎样更可控地画出来”；CreatorOS 还必须补上产品自己的上游问题：“为什么此刻值得画这张图”。

## 现版 RED 基线

冻结三个与文案 Skill 相同的主题，只使用 `video.broll v4`，素材库为空：

| 主题 | v4 选择 | 做对的事 | 暴露的问题 |
| --- | --- | --- | --- |
| AI 产出差先拆工作流 | `process`：白板连接输入、处理、输出 | 选对过程职责 | 依赖节点文字与“更换工具”标签；没有可直接送生图的 prompt、无文字约束和认知增量 |
| Markdown / HTML 不是淘汰赛 | `analogy`：档案库与展示橱窗 | 找到层级类比 | 仍依赖 Markdown/HTML 图内标签；没有规定媒介、光线、主体尺度或竖屏安全区 |
| 保存不等于理解 | `contrast`：聊天气泡入档案柜、人与 AI 仍隔开 | 关系清楚，三题中最好 | 仍缺“观众多理解什么”和“为何比真人口播更有效”；也没有禁止通用 AI 头像、文字、水印与额外界面 |

RED 结论：v4 已能做“选什么类型的画面”，但停在策划备注层。`visualBrief` 同时承担搜索、人工备料和文生图三种职责，导致最后一公里没有约束。

## 新提示词的职责链

```text
口播原句
  → visualClaim：观众看完多理解哪一件事
  → purpose：证据 / 过程 / 类比 / 对比 / 情绪 / 信息卡
  → reason：为什么这里需要画面
  → visualBrief：人能读懂、也能搜索的具体画面
  → generationPrompt：仅在允许 AI 生成时，翻译成模型可执行的最终画面
```

### generationPrompt 的跨供应商最小结构

1. 视觉媒介：纪实摄影、纸艺定格、扁平编辑插画等；
2. 主体：谁或什么是唯一主角；
3. 动作或关系：画面真正要证明的可见变化；
4. 环境：必要上下文，不堆背景装饰；
5. 构图：远近、视角、主体位置、留白与画幅安全区；
6. 光线与色彩：只服务当前认知任务；
7. 约束：默认无文字、数字、logo、水印、假界面、假新闻截图和无关物件。

不是每项都要写成长清单，但决定理解的要素不能缺。最终 prompt 只描述“要看见什么”，不把 `purpose/reason/visualClaim` 等内部元话语交给生图模型。

## 事实、定位与风格的边界

- `fact_evidence`：用真实截图、网页或图表，`generationPrompt` 必须为空；AI 图不能冒充证据。
- `info_card`：交给 `video.cards`，不让生图模型画段落和数据卡。
- `analogy/process/contrast/mood`：只有不冒充事实时才允许生成。
- 创作者定位只调视觉语言、目标观众熟悉的场景、信息密度和审美语气；不改变本条主张，也不创造身份、成绩、数据或“专业人设道具”。
- 风格是最后一层，不是第一层。先有视觉关系，再选择最能让目标观众读懂它的媒介与气质。

## 本轮落点

- `video.broll v4 → v5`：补 `visualClaim / reason / generationPrompt`，并写入事实、信息卡、文字和泛化海报边界。
- `material.generate`：保留原工具与任务契约，只强化工具说明和 prompt 字段说明，让对话 Agent 在调用前完成同样的内容辅助判断。
- `cover.brief v1 → v2` 与封面 prompt 组装：封面主视觉必须让人第一眼看懂核心冲突/关系；只允许指定短文案，禁止额外文字、拼贴隐喻和万能 AI 元素。
- 不新增页面、API、数据库、模型参数或第二套生成器；所有图片继续走现有模型配置、生成任务、候选采纳与项目素材链。

## 评估方式

正式评分尺见 [`ai-worker/evals/image-prompt/content-support-rubric.md`](../../ai-worker/evals/image-prompt/content-support-rubric.md)。同一主题冻结口播事实，匿名比较 v4 与 v5；只改变 Skill，不同时改模型、温度或题目。三题平均至少提升 8 分、每题不得下降超过 3 分、零硬失败，才允许保留 v5。
