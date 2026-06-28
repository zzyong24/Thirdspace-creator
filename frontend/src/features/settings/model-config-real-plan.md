# 模型配置做真(cc-switch 式可配置 provider)实现计划

> item A of「设置化」批次。让用户在设置页自定义绑定厂商/模型/URL/格式/密钥(参照 cc-switch),
> 替换当前 `ModelConfigurationCard` 的 3 选项硬编码桩。item B(存储路径/本地磁盘)另起。

## 决策(已与用户确认 2026-06-28)

- **密钥存储 = 本地 DB 直存**。系统最终形态是用户电脑上的本地客户端(轻依赖),密钥存在用户本地库
  无泄露风险 → 新增 `secret_value` 列直存真密钥。读侧**掩码**(返回 `hasSecret`,绝不回吐明文给浏览器)。
  保留 `secret_reference`(env 引用)作为备选解析路径,二者择一。
- **粒度 = 全局默认 + 可选按能力覆盖**。主卡配 `capability="default"`(全局默认);resolve 解析链:
  per-capability 行 → `default` 行 → env 默认 → 内置 Anthropic。per-capability 覆盖 UI 留高级区(本切片先做全局默认 + 列表读)。

## 现状(已勘查)

- 契约 `settings.models.put`(PUT /settings/models/:capability)已支持 provider/modelName/secretReference/baseUrl/apiFormat/settings/isDefault。
- `resolve.ts` 已是 cc-switch 式 3 层(Tier1 DB 行 → Tier2 env → Tier3 内置),注入点 `persistence-client.ts:2206`。
- backend 表 `model_configurations`:id/user_id/capability/provider/model_name/secret_reference/settings/base_url/api_format/is_default,unique(user_id,capability)。
- **缺口**:① UI `ModelConfigurationCard` 写死 3 厂商×1 假模型,无 URL/密钥/格式输入,capability 钉死 "script",读 fixture;② 无密钥直存列;③ resolve 无 default 回退;④ 无 model 配置读 op(UI 显示真值)。

## 分层任务(TDD,逐层 red→green→commit)

### T1 契约:put body 加 `secret` + resource 加 `hasSecret` + 新增 list 读 op
- Files: `contract/src/operations/settings.ts`, `contract/src/resources/settings.ts`, `contract/src/**/*.test.ts`
- `putModel.body` 加 `secret: z.string().optional()`(真密钥,空/缺=不改)。
- `modelConfigurationResource` 加 `hasSecret: z.boolean()`(掩码指示);**不**加明文 secret。
- 新增 `listModels`:`{ id:"settings.models.list", method:"GET", path:"/settings/models", response: z.array(modelConfigurationResource), fr:["FR-SETTINGS-MODEL-LIST"] }`。
- Red: 契约测试断言 putModel 接受 secret、resource 含 hasSecret、listModels 存在。

### T2 backend schema:`secret_value` 列 + DDL + 迁移
- Files: `backend/src/schema/settings.ts`, `backend/drizzle/<next>_model_secret_value.sql` + journal
- Drizzle 表加 `secretValue: text("secret_value")`(nullable);DDL `CREATE TABLE` 加 `secret_value TEXT`;
  迁移 `ALTER TABLE model_configurations ADD COLUMN IF NOT EXISTS secret_value TEXT;`。
- Red: repository 集成测试 set 带 secret → 读回 row.secretValue。

### T3 service + repo:存/读 secret(内部带明文,公有掩码)+ default 回退辅助
- Files: `settings.repository.ts`, `settings.service.ts`, `settings.schema.ts`, `*.service.test.ts`
- `ModelConfigInternal` 内部类型(含 secretValue + secretReference),`getModelConfig` 返回它(仅 server 端给 resolve,不序列化)。
- `setModelConfiguration`:body.secret 非空 → 写 secretValue;缺省 → 保留旧值(不抹)。
- 公有投影 `toResource`:`hasSecret = Boolean(secretValue) || Boolean(secretReference)`,删 secretValue,不含明文。
- `listModelConfigs(ctx)`:返回该用户全部 masked resource。
- Red: service 测试 — set secret→getModelConfig 内部见 secretValue;toResource 不含明文且 hasSecret=true;list 返回数组。

### T4 resolve.ts:优先库存密钥 + default 回退
- Files: `frontend/src/server/ai/llm/resolve.ts`, `resolve.test.ts`
- `ResolveDeps.getModelConfig` 返回 `ModelConfigInternal`。Tier1:`row.secretValue?.trim() || resolveSecret(row.secretReference, env)`。
- 加 Tier1b:per-capability 无命中 → `getModelConfig(ctx, "default")` 同逻辑。
- Red: resolve 测试 — 库存 secret 直接用(无需 env);per-capability 缺 → default 命中;default 缺 → env。

### T5 读 op 接线 + 装配
- Files: `settings.transport.ts`, `persistence-client.ts`(register listModels case)
- transport 处理 `settings.models.list` → `service.listModelConfigs(ctx)`。
- Red: 契约 transport 测试 listModels 返回 masked 数组。

### T6 UI:ModelConfigurationCard 改真 cc-switch 表单 + 读真值
- Files: `settings-interactive-region.tsx`, `settings-page.tsx`(viewModel.model 接真读), `page.tsx`(server 读 listModels 取 default 行), `*.test.tsx`
- 表单字段:provider(input 自由填 + datalist 常用项)/ modelName(input)/ baseUrl(input)/ apiFormat(select anthropic|openai_chat)/ 密钥(password,占位显「已配置」当 hasSecret,留空=不改)/ temperature(留)。
- 提交 `client.putModel({ params:{capability:"default"}, body:{ provider, modelName, baseUrl, apiFormat, secret?, settings:{temperature} } })`。
- `MODEL_CAPABILITY` "script"→"default";读真值来自 page.tsx 的 listModels(找 capability="default" 行),无则空表单。
- Red: 组件测试 — 有 URL/密钥/格式控件;hasSecret 时密钥占位「已配置」;改厂商提交带新值。

### T7 验证(eval 门)
- `pnpm --filter creatoros-frontend test`(单测)+ `pnpm --filter @creatoros/backend test`(repo 集成)全绿。
- 真链路:登录 → 设置 → 填 MiniMax(baseUrl=https://api.minimaxi.com/anthropic, model=MiniMax-M3, 密钥)→ 保存 → DB 有行 → 触发一个 AI 节点走真 LLM(从 distilled-verified 的角度也验证了一条真链)。
- `pnpm --filter creatoros-frontend typecheck` 绿。

## 不在本切片(item A 边界)
- per-capability 覆盖的完整高级 UI(契约/resolve 已支持,UI 留全局默认 + 列表;高级区下一波)。
- 密钥加密列(用户判定本地库直存可接受;若日后改云端多租户再加 AES + master key)。
- item B 存储路径/本地磁盘绑定(另起切片)。
