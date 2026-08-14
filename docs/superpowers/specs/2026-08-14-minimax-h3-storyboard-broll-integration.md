# MiniMax H3 文生视频素材与分镜复用 SPEC

> 任务：T-836  
> 日期：2026-08-14  
> 状态：用户收窄范围后待复审  
> 用户原话口径：像现有文生图生成素材一样，加一个文生视频生成素材；素材采纳后可在分镜中使用。
> 外部仓库只借鉴提示词方法，不搬它的计划、审批和剪辑系统。

## 1. 用户结果

```mermaid
flowchart LR
  A["对话中说要什么视频素材"] --> B["现有 material.generate 创建 video 任务"]
  B --> C["MiniMax H3 v2 生成短视频"]
  C --> D["现有候选卡预览"]
  D -->|"用户采纳"| E["进入当前项目素材库"]
  E --> F["后续 video.decisions / material.match 可选用"]
  F --> G["现有 B-roll 时间线与成片"]
```

不新增制作页、逐镜批量清单或另一套视频生成器。只在截图所示的编导输入框快捷按钮区增加
`生成图片素材` 与 `生成视频素材` 两个同级按钮；底层继续复用现有 `material.generate(kind=image|video)`、
`asset.generate`、候选卡和素材采纳链已经覆盖产品交互；本任务补齐 H3 v2 真协议、视频提示词质量、
生成素材语义描述和后续分镜可见性。

## 2. 范围

### 2.1 做

1. 配置 `video.generate` 为 provider=`minimax`、model=`MiniMax-H3` 时，现有“生成视频素材”走
   官方 H3 v2 create/query/content.url；旧 MiniMax 视频模型继续走 v1。
2. 在现有快捷按钮行增加两个真实预调按钮：`生成图片素材`、`生成视频素材`。点击只预填并聚焦，
   不自动消费；用户发送后，可信 functionKey 强制执行 `context.artifact.text → material.generate`，
   先读取当前确认稿和 sections[].sectionRef，再让编导基于稿件语义选择唯一服务段落、画面职责和
   image/video kind，禁止脱离稿件用万能提示词直接生成。
3. 文生视频使用 4–15 秒整数、768P/2K 和项目画幅；通用入口默认 6 秒、768P。首版只接纯文生
   视频，不新增首尾帧/参考素材 UI 或业务参数。
4. 复用现有 provider checkpoint：拿到 task ID 后持久化；刷新/重试只恢复查询，不重复 POST。
5. 复用现有 pending `generated_asset` 候选卡：用户采纳后才 active 并绑定当前项目。
6. 生成 asset 写入有界语义 description（来自用户/编导确认的 prompt），使后续项目 B-roll inventory
   能把画面含义交给 `material.match / video.decisions`；代码不做关键词匹配。
7. 借鉴外部 MIT 仓库的 H3 cinematic prompt 顺序，更新 CreatorOS 的 `material.generate` 工具提示与
   `video.broll` generationPrompt 规则：单镜单任务、连续镜头、主体→动作→环境→构图/景深→单一路径
   运镜→光色材质→稳定结尾→缺陷/文字限制→无音乐人声；不复制其运行时。
8. 设置页明确给出 `MiniMax-H3` 示例，并用 v2 的无计费错误请求探测鉴权。

### 2.2 不做

- 除现有编导输入框快捷行的两个按钮外，不新增逐镜批量费用清单、制作页专属面板、首尾帧/参考素材选择器。
- 不安装外部 Python Skill，不新增 `broll-plan.json` 或 FFmpeg 成片链。
- 不自托管 H3 权重，不修改数据库表，不新建公开 API。
- 不让 H3 冒充真实截图、新闻证据、产品 UI、Logo、精确中文、数字或图表；这些继续走真实素材或
  HyperFrames。
- 自动化测试不调用付费 API；真 H3 smoke 需要用户另行明确授权预算。

## 3. 协议与恢复

`GenerateVideoOptions` 在现有 prompt/aspectRatio/checkpoint 上增加可选 `durationSec` 与
`resolution`。对 `MiniMax-H3`：

- `POST /v2/video_generation`：`{model, content:[{type:"text",text}], duration, resolution, ratio}`；
- `GET /v2/query/video_generation/{task_id}`；
- `task.status=succeeded` 且 `task.content.url` 为 HTTPS 后下载字节；
- duration 必须是 4–15 整数，resolution 仅 768P/2K，ratio 必须是受支持画幅，prompt 非空且
  不超过 7000 字；校验在 POST 前完成；
- `onJobSubmitted(taskId)` 必须在开始轮询前完成；有 `resumeJobId` 时完全跳过 POST；
- POST 网络断开、5xx 或返回体缺 task ID 时视为“提交结果未知”，旧任务不可自动重提；错误卡明确
  提示去 MiniMax 控制台核对，不出现直接重试旧任务的按钮。若控制台存在已生成成片，用户下载后
  通过当前项目已有“上传 / 管理素材”导入，再在分镜预览中人工指定；该路径不产生第二次 POST，
  导入素材照常进入项目 B-roll inventory。CreatorOS 不把人工导入伪装成原任务自动恢复；
- 查询/下载可对明确幂等 GET 做有界短重试，整体轮询上限 20 分钟；401/402/422/429/5xx、失败、
  取消、超时、成功无 URL、下载失败保持不同错误分类；用户界面不暴露 token 或原始 task ID。

非 H3 模型的 v1 请求体、轮询和 file retrieve 行为保持现状并跑回归。

## 4. 提示词契约

生成视频时，编导输出一个紧凑自然语言段落，顺序固定为：

1. 一个连续镜头、目标时长与画幅；
2. 主体的身份/材质/形状；
3. 一个主要动作，最多一个次要变化；
4. 环境与空间组织；
5. 景别、主体位置、留白和前中后景；
6. 一条带缓入缓出的连续运镜，禁止互相打架的平移/旋转/变焦堆叠；
7. 光线、颜色和材质；
8. 平静开场、可读停留、稳定结束；
9. 默认禁止可读文字、数字、Logo、水印、假 UI、畸形肢体、重复主体、突变、闪烁和跳帧；
10. 只允许动作同步拟音和克制环境声，禁止背景音乐、旋律、节拍、歌曲、对白、旁白和其他人声。

若用户明确要求精确文字、数据、真实人物事件或产品界面，`material.generate` 必须沿用现有真实性门
拒绝自由生成，不能为了使用 H3 而降级。上述创作取舍由可配置模型/Skill 完成；代码只传递 prompt、
验证协议并守住素材和任务边界。

按钮的预填话术必须明确“先读取当前确认稿，再基于稿件语义生成”。`生成图片素材` 固定要求
`kind=image`，`生成视频素材` 固定要求 `kind=video`；服务端用可信 UI functionKey
`material.generate.image / material.generate.video` 选择两步工具序列，不通过字符串猜用户意图。
如果当前项目没有确认稿、读不到唯一 sectionRef 或没有配置对应生成模型，显示真实错误，不降级成
脱稿生成或另一种素材。

## 5. 素材语义与分镜复用

`AssetsService.createGeneratedAsset` 增加可选有界 `description`，由 asset runner 对已冻结 prompt
去掉内部版本/正文块后保留视觉方案摘要，最长 1000 字。repository 原样落现有 `assets.description`
列，不新增 schema。

采纳后现有 material link 把 video asset 绑定当前项目；`collectProjectBrollInventory` 已读取
asset `name + description + kind + duration`。下一次分镜时语义模型能看到描述并决定是否使用；本轮
不增加文件名词表、字符串相似度或业务分支。用户在分镜预览里明确选中该素材时，继续沿用现有
人工素材调整硬约束。

## 6. 验收标准

- **AC-01**：`MiniMax-H3` 走 v2 create/query/content.url，默认 6 秒/768P/当前画幅；旧 v1 测试全绿。
- **AC-00**：截图位置的快捷行真显示 `生成图片素材` 与 `生成视频素材`；点击分别预填稿件语义驱动的
  image/video 请求且不自动发送；发送后工具顺序严格为 `context.artifact.text → material.generate`。
- **AC-02**：duration/resolution/ratio/prompt 非法在 POST 前失败；v2 401/402/422/429/5xx 与查询、
  下载、无 URL、超时有可诊断错误。
- **AC-03**：task ID 在轮询前写 checkpoint；`resumeJobId` 路径零 POST；提交未知不自动重发；若从
  MiniMax 控制台找回成片，可经现有项目上传→分镜人工指定恢复，且 inventory 可读回、零第二次 POST。
- **AC-04**：`material.generate(kind=video)` 的提示要求覆盖单镜、主体/动作/环境/构图/景深、连续运镜、
  稳定结束、缺陷限制和无音乐人声；事实/精确文字门保持。
- **AC-05**：视频生成仍产 pending candidate；未采纳不进素材库，采纳后绑定当前项目。
- **AC-06**：生成 asset description 保存有界视觉语义；后续 B-roll inventory 真读到它，并可由
  `material.match / video.decisions` 选择或由用户人工指定。
- **AC-07**：设置页示例为 `MiniMax-H3`，鉴权探测不创建计费视频任务。
- **AC-08**：除现有快捷行两个按钮外，没有新增页面、公开 API、数据库迁移、平行计划或平行渲染链。
- **AC-09**：没有明确付费授权时，live H3 E2E 明示为未执行，mock/contract 测试不得冒充真调。

## 7. 验证

- ai-worker MiniMax v2 + v1 回归、checkpoint、错误分类；
- backend asset runner 和 Assets service description 红绿测；
- chat-tools/video.broll 提示词契约与真实性门回归；
- settings v2 鉴权探测；
- pending→confirm→material link 与 B-roll inventory 读回；
- typecheck、contract、boundary、semantic-boundary、orphan、reconcile。

实现来源注明 `minimax-h3-broll-generator` MIT 提示词方法；若复制实质文本，保留其 LICENSE 归属。
