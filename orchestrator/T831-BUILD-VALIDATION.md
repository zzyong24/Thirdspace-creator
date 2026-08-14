# T-831 官方模型配置与图生图路由验证

## 已确认范围

- 官方文本模型保留 7 个，官方模板以 Claude Haiku 4.5 置顶并默认；
- 新增独立 `image.edit=openai/gpt-image-2-edit`；
- 只修改“内置模型官方版”，不修改智溯、测试或用户自配渠道；
- 新 revision 保存后绑定年度版和内测永久版。

## 本地实现与回归

- `channel-model-config` 把 `image.edit` 识别为图片能力；
- 多模态 resolver 为 `image.edit` 使用独立默认项和环境回退；
- 封面任务只有在实际读取到参考图时走 `image.edit`，无参考图保持 `image.generate`；
- backend 聚焦测试：3 个文件、50 项通过；
- frontend 渠道模型选择：2 项通过；
- backend、frontend、ai-worker 类型检查通过。
- 用户确认兼容边界：官方托管参考图只使用渠道明确声明的 `image.edit`；本地自配未单独配置
  `image.edit` 时，继续复用既有 `image.generate` / `image.default` / `CREATOROS_IMAGE_*`。
- 该判断只看已验签渠道 capability 是否存在，不按 OmniHi、Dudu 或模型名写死分支。官方已托管
  `image.generate` 但缺 `image.edit` 时明确停止，不误拿本地文生图配置替代；本地 Dudu 回归通过。

## Growth 配置端

- CreatorOS 专属 validator 与官方模板已改为 7 个文本模型，并增加独立 image.edit；
- Growth 后端全量：968 passed, 102 skipped；
- Growth 前端全量：260 passed；
- Vite 生产构建：1672 modules transformed，成功；
- 治理对账的代码/边界/孤儿/页面门均通过，但 3 份既有任务的 PRODUCT_SPEC review receipt 已在
  T-155 后过期；本次更新 FR-105 后仍显示同一存量漂移。它不是业务回归失败，但在发布前必须按
  审计流程处理或作为既有治理债明确保留。

## 生产事实

- Growth validator release `92a4f1b` 已上线，备份隔离恢复、API/worker、schema 与公网健康通过；
- 当前模型配置仍是“内置模型官方版” v2；
- 在旧线上 validator 上尝试保存新配置得到规则拒绝，未生成 v3、未改变套餐绑定；
- 新 validator 上线后，官方账号会话在选择 CreatorOS 时过期，页面正确阻止写入；重新登录后再保存并
  权威回读新 revision；
- 上游目录明确提供 `openai/gpt-image-2-edit`，但正确 ID 的真实调用仍返回 502/503，因此本次只证明
  路由与模型 ID 正确，不声称图生图服务当前稳定。
