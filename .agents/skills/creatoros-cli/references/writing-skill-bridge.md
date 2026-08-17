# 与用户写稿 Skill 的组合协议

## 组合原则

同一个 Agent 同时加载本 Skill 和用户选择的写稿 Skill：

- CreatorOS Skill 是编排者，负责读取当前真值、锁定 ID、版本、候选确认、正式保存、异步任务和回读。
- 写稿 Skill 是创作者，负责选题表达、结构、口吻、事实表达和正文候选。
- CLI/backend 是执行边界，负责 schema、权限、账号隔离、幂等、版本和审计。

写稿 Skill 不拿 CLI 凭据，不选账号，不直接调用写 operation，也不把自己的输出称为“已保存”。

## 上下文优先级

交给写稿 Skill 前，按以下顺序冻结上下文；前面的内容覆盖后面冲突的内容：

1. CreatorOS 当前回读到的最新稿正文与 `baseVersionId`；
2. 用户本轮明确要求，包括选中的具体段落和修改目标；
3. 当前项目定位、受众、平台和交付要求；
4. 与本稿相关的来源、素材、调研和事实证据；
5. 旧候选、旧任务结果和历史对话，只能辅助理解，不能冒充最新稿。

因此，调研结果可以支撑事实和视角，但不能覆盖最终文案已经确定的结构、口播或画面。封面、配图、分镜和素材提示词必须首先服务当前最新文案，而不是复述更早的调研摘要。

## 交给写稿 Skill 的输入

```text
run = {
  accountId,
  projectId,
  outputId,
  artifactId,
  baseVersionId,
  positioning,
  currentScript,
  relevantSources,
  currentAssets,
  currentProductionState,
  userRequest,
  mode: full | patch,
  target?: {
    kind: stable_block | exact_text,
    blockId?,
    beforeText
  }
}
```

只传递完成写作所需的业务内容。不要传 Token、连接文件、数据库信息或其他账号的数据。

## 写稿 Skill 的返回

```text
draft = {
  mode: full | patch,
  content,
  target?: {
    kind: stable_block | exact_text,
    blockId?,
    beforeText
  },
  changeSummary,
  factualUncertainties?,
  sourceNeeds?
}
```

这是 Agent 会话内候选，不是 CreatorOS API，也不是写入证明。必须先展示候选、等用户确认，再执行写入；写前重读当前版本，写后回读真实结果。

## 整稿流程

1. CreatorOS Skill 读取当前最新稿和版本。
2. 写稿 Skill 基于冻结上下文返回完整候选。
3. Agent 展示完整候选、变更摘要、不确定事实与绑定的项目/版本。
4. 用户明确确认后，CreatorOS Skill 再读最新版本。
5. 版本未变化才按当前 describe 的正式 write operation 保存；变化则停止并重新生成。
6. 写后回读当前版本、正文、归属和可读取的来源/素材关联。

## 局部改稿流程

1. 优先使用 CreatorOS 读取结果提供的稳定段落或区块 ID，并记录修改前完整原文。
2. 没有稳定 ID 时，只允许以基线稿中唯一出现的完整原文为锚点；重复文本必须让用户进一步选择，不能靠“第几个相似段落”猜。
3. 写稿 Skill 只返回该目标的替换候选，不改其他段落。
4. Agent 展示修改前、修改后和影响范围，等待用户确认。
5. 写前重读：稳定 ID 仍属于同一稿且原文完全未变，或原文在新稿中仍唯一且完全未变，才可重绑。
6. 目标消失、内容变化、重复命中或项目/账号变化时停止，保留候选并报告冲突；禁止模糊匹配或降级成整稿覆盖。
7. 保存后回读该段和当前版本。一个候选被采纳不应让其他独立候选失去自己的目标；每个候选分别以自己的基线和目标重验。

## 素材和制作交接

写稿前后的来源、已绑定素材和已有制作任务应保持同一账号/项目归属。改稿完成后：

- 回读公开 contract 能提供的来源/素材关联和制作状态；
- 无法读取的字段明确显示未知，不编造“已保留”；
- 向用户给出可继续动作，但不自动生成封面、配图、分镜、视频或发布；
- 用户另行确认某个动作后，再动态发现对应 operation，走任务等待、候选确认和写后回读。

## 示例请求

- “读取这个项目的最新稿，用我的品牌口播 Skill 重写整篇，先给我看，不要保存。”
- “只改第 7 段。保持其他段落不动，给两个候选，我确认后分别采纳。”
- “按最新文案生成封面方向。调研只用来核对事实，不要覆盖成稿主题。”
- “继续等待刚才的任务。”——必须继续同一 `taskId`，不能重提。
