# T-1420 本机账号 1 重新验收 · 2026-10-28

本机账号组「1」正确，用户已明确「月明水清深」属于朱志勇的电脑。本次已真实调用现有官方 AI 路由，完成两页内容规划及两张图片的生成、预览、采纳、精确文件回读。正文、安装版界面及导出仍存在实际失败，T-1420 不能关闭。

## 范围和授权

- 用户授权原文：「允许本次最小验收，使用现有额度」。范围为独立配文、分页规划、两张图及必要画面提示；不充值，不自动重试，不发布。
- 账号组：`grp-8fdb2e06-22`，名称「1」。现有抖音账号「我是谁」不是此次小红书图文的发布目标；所有调用使用组级范围，`accountId: null`。
- 独立测试项目：`project-intake-2c85a17456fc3c78d1ddb370f32e8a51`，名称「T-1420 本机账号1图文验收 20261028」。
- 图文输出：`output-2ddab0cc-3252`；artifact：`artifact-2ddab0cc-3258`。
- 仅创建和修改此独立验收作品，没有覆盖原有业务作品。保存的正文明确标注为测试输入；未把它冒充 AI 配文。原项目脚本为空，用于覆盖“已有图文正文、无主脚本”的场景。
- 使用已安装 CreatorOS 1.2.0 / CLI 0.1.0 / contract 0.4.0。所有业务访问经已安装公开 CLI；界面和导出经原生应用操作，未读取数据库、连接凭证或私有接口。

## 实际结果

| 项目 | 结果 | 证据 |
|---|---|---|
| 本机账号与目标归属 | 通过，账号组「1」是正确目标 | 用户确认、CLI groupId、原生界面 |
| 独立测试稿保存及精确回读 | 通过 | reverify-source-saved / exact / latest.json |
| AI 独立配文 | 不通过：真实候选是字面值 `...`，未采纳 | reverify-body-candidate-exact.json |
| AI 内容拆页 | 通过：清空桌面、固定归位两页，含各页画面描述 | reverify-cards-candidate-exact / adopted / readback.json |
| 两张真实图片 | 通过生成、预览及采纳；不是文字排版图 | reverify-image-01/02-candidate.json、原始 PNG |
| 图像文件与分页关系 | 通过，最新稿与精确版本一致，两个 assetFileId/cardId 保持正确顺序 | reverify-final-latest / exact.json、reverify-exact-file-check.json |
| 竖版与同场景连续性 | 未完全达到：两图均 1024×1024，桌椅、杯子和笔记本细节不同 | 两张原始 PNG 的目视检查及尺寸 |
| 组批生成响应 | 不通过：内部 `requestId` 泄漏使响应校验报 400，但两个文字任务已实际创建并完成 | reverify-text-bundle-submitted.json、任务回读 |
| 原生图文界面 | 不通过：仍以 NoteRelay 排版为主，重新组织内容按钮禁用；开源来源与许可、发布与交付入口仍在 | reverify-installed-final.png / ax.txt |
| 原生 ZIP 导出 | 不通过：3 张 1242×1658 排版图，无原图、无独立配文；第 2/3 页缺失预览中图片 | reverify-installed-export.zip、reverify-export-check.json、导出页 PNG |
| 本分支新代码的 Mac 运行验收 | 未进行，安装版不会自动加载本分支代码 | Git 工作区与安装版身份边界 |
| 实际扣费 | 未核实；已使用获准的现有额度，未充值、未重试生成 | 用户授权、原始任务 ID |

## 真实调用和恢复过程

文字批次先因 confirm-impact 未绑定具体输出而被拒绝，未创建任务。改为绑定真实 outputId 后，提交响应报 `unrecognized_keys: requestId`；公开列表已可读到两个原始任务，因此没有重新提交文字生成。通过原任务查询恢复结果，发现正文为 `...`，保留原测试正文，仅采纳有效的两页规划。

已安装版组批响应存在缺陷，因此两张新图片使用现有公开 `creativeResults.generate`，每页仅提交一次，不是重试文字任务，也不证明新分支的组批前端链路通过。图片均在预览后通过 `creativeResults.adopt` 采纳；第二张沿最新版本保存，未覆盖第一张。

| 类型 | taskId | resultId | 结果 |
|---|---|---|---|
| 正文 | ai-task-2ddab0cc-3561 | 7fdee620-7cdc-41c3-8076-9680bbc4036a | runtime succeeded，但候选 `...`，未采用 |
| 分页 | ai-task-2ddab0cc-3563 | 36ac8ea9-a43b-4cde-b28c-240105ec8a10 | 两页已采用 |
| 图片 1 | ai-task-2ddab0cc-3807 | fa129225-9baa-478c-8a3f-58f1b5002033 | 已采用，card-desk-clear-01 |
| 图片 2 | ai-task-2ddab0cc-3817 | d4cc2053-7e85-44e1-97b3-c69c0921bb8b | 已采用，card-desk-organize-02 |

四个顶层任务之外，内部画面提示的具体调用次数与计费明细未核算，不能把顶层任务数等同于收费次数。没有发起充值或额外修正生成。

## 版本和文件证据

- v2 测试输入：`artifactversion-2ddab0cc-3428`。
- v3 采用两页规划：`artifactversion-2ddab0cc-3688`。
- v4 采用第一张图：`artifactversion-2ddab0cc-4049`。
- v5 采用第二张图：`artifactversion-2ddab0cc-4065`。最终 latest 与 exact document 完全相等；原测试正文和 cardBriefs 均保持不变。
- 图 1 SHA-256：`10bbb5c54724bdbe9235acff9dbe1bbdc9bdcb03f8be6a5ed128d28264d9215e`，1,611,954 字节。
- 图 2 SHA-256：`71e4dc404c58f8c8c4e61cc8a0e5871bbb356e1c896f216312384a36021de61c`，1,504,443 字节。
- 原生 ZIP SHA-256：`32d565abc741caf0ff034584572f0ea6baf0547bc4826cd451a7e652a0cba9f7`，415,525 字节。内部三张图均不匹配采用原图，且没有配文文件。
- 原图经公开 `assets.fileDownloadUrl` 按精确 assetId + assetFileId 获取。接口返回的相对路径按原生界面观察到的当前本机源地址解析；文件请求不依赖私有连接凭证，签名链接没有写入日志或报告。

## 后续仍需处理

账号差异不再是阻塞。两个缺失兼容样本已于 2026-10-28 18:06 补齐，原兼容测试组 52/52 通过（见 fixture-restoration.json 与 frontend-compatibility-restored.json）。阶段 1 仍需解决此前记录的 main 审核链损坏，完成 cherry-pick 后运行含本分支代码的 Mac 版本，复核正文质量、竖版/连续性、原图加独立配文导出及界面入口。审核链未经改写，未推送、开 PR、合并、发布或更新安装包。本次只补实际验收证据，没有新增产品代码修补，也没有为测试改断言。
