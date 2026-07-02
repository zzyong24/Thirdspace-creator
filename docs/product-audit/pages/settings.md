# 产品审计 · /settings 设置页

> 审计日期:2026-07-02 · 分支 refactor/agent-and-structure · dev server :3000 实测
> 方法:宪法对照 + 代码链路(page.tsx → settings-interactive-region → contract op → persistence-client → backend service/表)+ curl 只读验证 + Postgres 直查。写操作一律未触发(审计纪律)。

---

## 1. 功能定位

**页面任务**:管理账号身份(昵称/邮箱)、平台账号绑定(抖音扫码)、创作偏好默认值、外观(主题/密度)、AI 模型配置(文本 default + 文生图/文生视频/逐字稿 ASR 三个多模态 capability)、媒体存储(落盘路径 + 用量)。

**与七步流水线的关系**:设置页不在流水线内,是**支撑面**:
- 「账号绑定」是数据底座(宪法 §7)的采集登录入口——抖音登录态直接决定作品/评论采集能否跑;
- 「模型配置」支撑架构铁律 §9.1(modelFor 按 capability 可切换)与项目规则「多模态模型须用户可配」;
- 「存储」支撑制作阶段的素材落盘。

**宪法符合度**:整体合定位。无视频编辑器、无视频类型区分、无变现中心(§8 三条边界均未触碰)。「计划:个人版」chip 是唯一残留的订阅气味(装饰性,见 §5)。

**形态**:`/settings` 打开即弹居中大 Dialog(h-[85vh],Radix Portal),左竖 5 Tab(账户/偏好/外观/模型配置/存储),右侧框内滚动;关闭 → `router.back()`(无历史则回 `/`)。背景是 (creator) AppShell + 空 main(`settings-page.tsx:313-322`)。

页面可达性:`curl -w "%{http_code}" http://localhost:3000/settings` → **200**;SSR HTML 含真实身份(Zyong Zhu ×4、MiniMax-M3)。

---

## 2. 区块与交互清单

### Tab 1 · 账户

| 元素 | 行为 | 接线 | 状态 |
|---|---|---|---|
| 「已验证」徽标(账户信息卡右上) | 无交互 | 无——硬编码 span(`settings-interactive-region.tsx:385-391`) | **装饰性伪状态**(无验证流程实体) |
| 「计划:个人版」chip | 无交互 | 无——fixture 硬编码(`fixtures/selectors/settings.ts:117`) | 装饰性(无计费实体,代码注释自认 decorative) |
| 时区 / 语言 chip | 只读展示 | settings.get → identity.getCurrentUser → users 表 | works(真数据) |
| 昵称输入 + 「保存」/Enter | 乐观改 → `client.patchProfile` → router.refresh() | op `identity.profile.patch`(settings transport 代理 → identity.updateProfile → users 表;`persistence-client.ts:4209-4215`) | **接线完整**(写未实测,有单测 identity-section.test.tsx) |
| 邮箱输入 | readOnly,help 注明「登录标识暂不支持修改」 | 无写路径 | works(诚实只读) |
| 抖音「连接抖音(扫码)/重新扫码」按钮 | `client.loginDouyin({})` 弹本机 headed Chromium 扫码(≤4min)→ 重拉 status → 徽标翻转 + 内联反馈 | op `ingestion.douyin.login` → `persistence-client.ts:1324` → douyin-cdp loginDouyin(.auth/douyin 持久化) | **接线完整,端到端未触发**(审计不弹采集窗;有单测) |
| 抖音「已连接/未连接」徽标 | SSR 兜底「未连接」→ 挂载后 `client.statusDouyin` 翻真 | op `ingestion.douyin.status` → checkDouyinStatus(headless cookie 探针) | **works**:curl 实测 `{"loggedIn":true}`(0.4s) |

### Tab 2 · 偏好(⚠️ 本页最大问题区)

| 元素 | 行为 | 接线 | 状态 |
|---|---|---|---|
| 默认主页 Select(首页/项目/知识库/发布中心) | 乐观改 + `patchPreferences({defaultHome})` + refresh | op `settings.preferences.patch` → user_preferences 表 | **写真读假**(见 Bug-1)+ **无消费方**(见 Bug-2) |
| 默认创作模式 Select(向导/灵活/自由) | 同上 `{defaultCreationMode}` | 同上 | 同上 |
| 默认可见性 Select(仅自己/不公开列出/公开) | 同上 `{defaultVisibility}` | 同上 | 同上 |
| 自动保存 Switch(help:「每 30 秒保存一次草稿」) | 同上 `{autosaveEnabled}` | 同上 | 同上——**没有任何编辑器读此开关** |
| 使用情况分析 Switch | 同上 `{analyticsEnabled}` | 同上 | 同上——**产品无任何 analytics 系统** |

### Tab 3 · 外观

| 元素 | 行为 | 接线 | 状态 |
|---|---|---|---|
| 主题 Select(跟随系统/浅色/深色) | localStorage `creatoros.settings.theme` + 即时切 `<html>.dark` | 纯客户端(契约无 theme 字段,GAP-SET-1 注释 `settings-interactive-region.tsx:113-122`) | works(真持久,描述诚实注明「本地持久」) |
| 密度 Select(舒适/紧凑) | localStorage + `<html data-density>` | 纯客户端 | works(同上;data-density 有无布局消费未逐一验证) |
| ~~语言下拉~~ | 已删除 | — | 曾是假控件,按「真实有效或删除」铁律移除(注释 `:950-952`),locale 只读 chip 保留——诚实处理的正面样例 |

### Tab 4 · 模型配置(4 张卡)

| 元素 | 行为 | 接线 | 状态 |
|---|---|---|---|
| 文本模型卡:提供商/模型/接口地址/接口格式/密钥/温度 + 「保存模型配置」 | 一次 PUT upsert capability="default";空密钥=保留旧值 | op `settings.models.put` → model_configurations 表(secret_value 本地存,读侧掩码 hasSecret) | **works(读侧实证)**:curl `settings.models.list` 返回 default 行 = minimax/MiniMax-M3/baseUrl api.minimaxi.com/anthropic/hasSecret:true(用户真配),SSR HTML 含 MiniMax-M3 |
| 「已配置」密钥徽标 | 只读 | hasSecret 掩码(`settings.service.ts:217-219`) | works(default 行真存 secretValue) |
| 温度 number input(min0/max1/step0.1) | 本地态,随保存写入 settings.temperature | putModel body `settings: z.record(...)` 无范围校验 | **可存非法值**(见 Bug-4) |
| 文生图卡(image.generate) | 同款表单,无 apiFormat/温度 | 同 op,capability 自由字符串 | works——当前 DB 无此行 → 「未配置」徽标 + 「不配则录制页 AI 生成禁用」(诚实空态) |
| 文生视频卡(video.generate) | 同上 | 同上 | works(未配置,诚实空态) |
| 逐字稿模型卡(transcribe.audio) | 同上 | 同上 | **works**:curl 实测 DB 行 siliconflow/FunAudioLLM/SenseVoiceSmall/hasSecret:true → 「已配置」 |

### Tab 5 · 存储

| 元素 | 行为 | 接线 | 状态 |
|---|---|---|---|
| 存储后端徽标(本地磁盘/云存储 S3) | 只读 | settings.storage.get | works(真:backend=local)——**契约 putStorage 支持改 backend 但 UI 无切换控件**(半截面) |
| 媒体路径输入 + 「保存」 | `putStorage({rootPath})`;服务端验证合法性 + mkdir 写探针 | op `settings.storage.put`(`settings.service.ts:389-414`) | 接线完整(写未实测;非法路径→400 有实现) |
| 用量进度条 + 分类型明细 | 只读 | storage.get:usedBytes=assets 表按类型字节汇总,totalBytes=磁盘容量 statvfs | **works**:curl 实测 rootPath=/Users/zyongzhu/CreatorOS/media,78.5MB/494.4GB,video 44MB/audio 34MB/image 0.3MB/document 0.08MB/subtitle 0 |

### 全局

| 元素 | 行为 | 状态 |
|---|---|---|
| 5 个 Tab 按钮 | 本地 state 切换,panel 全挂载(forceMount)草稿不丢 | works(纯客户端) |
| 关闭(X/Esc/遮罩) | `router.back()`,无历史 push "/" | works(代码路径清晰) |

---

## 3. 数据来源(四桶)

| 数据 | 来源链 | 桶 |
|---|---|---|
| 账户 displayName/email/timezone/locale | settings.get → identity.getCurrentUser → users 表(curl 实证 user-zyongzhu) | **real**(注:email `zyongzhu@creatoros.local` 是种子造的本地身份,真库行但非真实邮箱) |
| 「计划:个人版」 | `fixtures/selectors/settings.ts:117` 写死 | **hardcoded** |
| 「已验证」徽标 | `settings-interactive-region.tsx:385` 写死 | **hardcoded** |
| 抖音登录徽标 | ingestion.douyin.status → .auth/douyin cookie 探针(curl 实证 loggedIn:true) | **real** |
| 偏好 5 项初始值 | `buildSettingsViewModel()` → canonical.ts:123 userPreferences fixture——**page.tsx 从不读 DB 偏好** | **fixture**(写入却是真库,见 Bug-1) |
| 主题/密度 | localStorage(初值 fixture) | real(设备级) |
| 文本模型卡 | settings.models.list → model_configurations 表 capability="default"(minimax 行,用户真配) | **real** |
| 文生图/文生视频卡 | 同 op,DB 无行 → 空 provider/「未配置」 | **planned**(诚实占位) |
| 逐字稿卡 | 同 op,siliconflow 行 | **real** |
| 存储路径/用量/容量/明细 | settings.storage.get → storage config 行 + assets 字节汇总 + 磁盘 statvfs | **real** |
| SSR 兜底(读失败时) | fixture:模型=anthropic/claude-opus-4-8、存储=18GB/64GB(编造数)、身份=canonical user | **fixture**(正常路径不出现;故障时静默显假且无降级标识) |
| SystemState.notifications | fixture 有、RSC payload 传输、无控件渲染 | fixture 死字段 |

## 4. 数据流向(写路径)

| 交互 | 写到哪 | 回读闭环 |
|---|---|---|
| 保存昵称 | identity.profile.patch → users.display_name | ✅ refresh 后 settings.get 重读 |
| 偏好 5 控件 | settings.preferences.patch → user_preferences 表 | ❌ **断**:契约无 preferences.get,page.tsx 不读,刷新回 fixture |
| 主题/密度 | localStorage + `<html>` class/attr | ✅(设备级) |
| 保存模型配置(4 卡) | settings.models.put → model_configurations(secret_value 本地库) | ✅ refresh 后 listModels 重读 |
| 保存媒体路径 | settings.storage.put → storage config(先验证可写) | ✅ refresh 后 storage.get 重读 |
| 扫码登录 | douyin-cdp → .auth/douyin cookie 落盘 | ✅ status 探针重拉 |

---

## 5. 疑似 Bug(带证据)

### Bug-1【high】偏好设置「写真读假」:改完刷新即回跳
- **证据链**:
  - Postgres 直查:`user_preferences.default_home = 'projects'`(用户曾改过并真持久化);
  - fixture:`canonical.ts:127 defaultHome: "dashboard"`;
  - RSC payload 实测(curl /settings):`"defaultHome":"dashboard"` ——发给客户端的是 fixture 值,DB 真值被无视;
  - 根因:契约无 `settings.preferences.get`(`contract/src/operations/settings.ts` 全文无此 op),`page.tsx:43-188` 只读 settings.get/models.list/storage.get,`settings-page.tsx:299` preferences 恒取 `buildSettingsViewModel()`。
- **用户体感**:改「默认主页」为项目 → 界面立即变(乐观更新)→ 刷新/下次进来又显示「首页」。这正是「产品怪怪的」的典型来源。
- **修法**:加 preferences 读 op(或让 settings.get 带 preferences),page.tsx 读真值 overlay。

### Bug-2【high】偏好 5 项全部无消费方——承诺性文案落空
- **证据**:全仓 grep `defaultHome`,app/lib/components 零命中(唯一消费是 seed mapper `persistence-client.ts:798`);`autosaveEnabled`/`analyticsEnabled`/`defaultCreationMode`/`defaultVisibility` 同样无读者。
- help 文案却承诺行为:「登录后跳转的第一个页面」「每 30 秒保存一次草稿」「帮助我们改进产品」——没有 redirect 逻辑、没有自动保存定时器、没有 analytics 系统。
- 违反项目自己的铁律(SystemSettingsCard 注释 `:950-952`:「切了没反应的下拉 = 假控件……真实有效或删除」)——同文件里语言下拉因此被删,偏好卡却整卡保留。

### Bug-3【medium】「全局默认模型」心智模型与真实解析不符——9 条隐形 per-capability 种子行
- **证据**:curl listModels 返回 **12 行**;设置 UI 只暴露 4 个 capability(default + 3 多模态)。其余 8+ 行(copilot.assist、script.rewrite→claude-fable-5、planning.*、research 等,`persistence-client.ts:4291-4305` 种子,secretReference `env:ANTHROPIC_API_KEY`)UI 无处可见/可改。
- `resolve.ts:70-80`:per-capability 行**优先于** default 行。即:一旦运行环境有 ANTHROPIC_API_KEY,9 个 AI 节点会静默用 claude 而非用户配的 MiniMax,设置页毫无提示。
- 当前 `.env.local` 只有 DATABASE_URL(无 ANTHROPic_API_KEY)→ 种子行 token 解析为空 → 回退 default(MiniMax)——**行为碰巧正确**,靠的是 env 恰好没设(dev server 进程继承的 shell env 未验证,标不确定)。
- 附带:`hasSecret` 对这些行返回 true(`settings.service.ts:217`:secretReference 非空即 true),即使 env 未设、运行时根本无凭据——「已配置」语义虚报。

### Bug-4【low】温度可存非法值
- HTML min=0/max=1 不拦手输;onChange 仅查 NaN(`settings-interactive-region.tsx:1397-1400`);契约 `settings: z.record(z.string(), z.unknown())` 无范围校验(`contract/src/operations/settings.ts:51`)。温度 7 可入库,真调用时才炸。

### Bug-5【low】改媒体路径不迁移旧文件
- `updateStorage`(`settings.service.ts:389-414`)只验证新路径可写 + 落配置行;旧 root 下已有素材字节留在原地,UI 无任何「不会搬迁已有文件」提示。

---

## 6. 设计不合理

1. 【medium】偏好 tab 整卡与产品现实脱节(Bug-1+2 的产品面)。建议:接真(读回 + 消费方)或整卡删除/标「规划中」。
2. 【low】「已验证」徽标 + 「计划:个人版」chip:无验证流程、无计费实体的装饰性伪状态;「计划」是宪法 §8 已移除的变现方向的气味残留。建议删除或换成有真值的东西(如「本地单机版」)。
3. 【low】模型配置只见「default+3 多模态」,per-capability 覆盖(后端已支持且有 9 条种子行)完全不可见;`settings.prompts.*` 3 op(T-040c 提示词可配)与 `settings.agents.create` 后端齐备但设置 UI 零入口——宪法铁律 §9.3「提示词/工具/schema 可配置」目前只有 API 无 UI。建议模型 tab 加「高级:按能力覆盖」折叠区或诚实标注解析优先级。
4. 【low】存储 backend 徽标只读:契约 putStorage 支持 backend 切换(local/s3),UI 不暴露——半截配置面,S3(MinIO)已接却没入口。
5. 【low】/settings 弹窗无 tab 深链(?tab=…),从别处引导用户「去设置配模型」只能落在账户 tab;弹窗标题与背景 header 文案完全重复。
6. 【low】注释腐化:`settings-page.tsx:24` 说 5 tab 含 integrations(实际是 models);`:38-39`「Controls have fixture-only local state. No server persistence.」已过时(多数控件真持久)——误导后续开发。
7. 【琐】逐字稿卡与文生视频卡共用 Cpu 图标;SystemState.notifications 死字段该删。

## 7. 待对齐点(跨页)

1. 抖音登录态双入口:设置页「账号绑定」vs automations 页 needs_reconnect 重连——同一 .auth 链(一致),但术语「未连接/已连接」vs「needs_reconnect」两套叫法。
2. 「默认可见性 private/unlisted/public」是多租户/平台语义,单人本地产品无定义——与发布层(平台在发布层选)的口径需对齐。
3. 模型配置的「用户可配」叙事 vs resolve 的 per-capability 优先级——凡讲「模型可切换」的页面(如 AI 任务、录制页)都应与设置页共享同一份解析事实。
4. 外观设置持久层(localStorage 本机)与其余(DB 跨端)不同层——描述已诚实注明,全局如有多端预期需统一。
5. email 显示 `zyongzhu@creatoros.local`(种子身份):真库行但看起来像假邮箱,首页/侧栏等处同源展示,统一说明本地身份策略即可。
