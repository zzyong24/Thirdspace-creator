---
name: creatoros
description: 通过已连接的 CreatorOS MCP 读取指定账号的项目、脚本、文章、图文和素材，并按用户要求调用产品真实能力。
---

# 使用 CreatorOS 真实工具

先确认 WorkBuddy 已连接并信任 CreatorOS MCP，CreatorOS 桌面版保持运行且 CLI 访问开启。工具不可用时报告真实连接错误，不读取登录文件，不改 Agent 配置，不另造代理。

## 选择账户和项目

1. 用 `accounts_list` 查询真实账号，按用户明确选择的 ID 操作。多个可能目标时请用户确定，不猜“当前项目”。
2. 以后每次调用显式带 `_creatoros: { accountId: "用户选定的真实账户ID" }`。这是参数说明，占位文本不能直接提交。
3. 用 `projects_list` 查询项目，保留返回的分页元数据，未取完不能说已列出全部。
4. 用 `projects_get`，`params: { projectId }` 读指定项目。用 `projects_outputs_list` 同参数查看其真实作品；`outputs_get` 的参数为 `{ outputId }`。

上面工具由 contract 自动生成。只有工具列表真实出现的名字才可调用；`creatoros_overview` 只是总览，不能证明浏览器当前项目。不要把用户的自然语言目标变成虚构实体 ID。

## 读取已保存内容

- 主稿：`artifacts_list`，`params: { projectId }`，查真实 `master_script` 或 `output_script` 产物。明确选定后用 `artifacts_versions_list`，`params: { artifactId }` 读版本正文。产物元数据不是脚本文本。
- 文章：`articles_get`，`params: { outputId }`。
- 图文：`graphicPosts_get`，`params: { outputId }`。大小写和工具列表一致。
- 当前内容、版本、归属在执行时由 CreatorOS 校验；对话历史不替代服务端真值。没有内容时如实报告为空。

## 生成、采用和写操作

用实际工具 schema 查询相应候选生成入口。AI 输出只形成候选，用户采用后经原后台服务保存；不要未经用户要求采用、发布、删除或覆盖稿件。

非只读调用必须带 `_creatoros.apply: true` 和真实幂等键；高影响调用还要真实 `confirmImpact`。保存带工具要求的版本/CAS。遇到版本冲突先重新读回，不把旧稿直接重放。

长任务使用真实任务 ID 查询状态；超时或断流不能假称失败或成功，也不能盲目重发可能已执行的调用。重新连接只恢复工具入口，不自动取消或重复后台任务。

只通过 CreatorOS 工具服务访问产品数据，不直连数据库、不读取模型密钥或登录 Cookie、不通过 shell/文件路径绕过权限。
