# 新用户首次引导页设计(弹出式 onboarding checklist)

> 单一真值:BACKLOG T-131。本 SPEC 落设计,执行总账在 BACKLOG。
> 状态:草案(待用户拍板 scope OQ + 过 spec-review gate)。

## 0. 用户诉求(2026-07-05)

用户:「设计一个引导页,弹出引导新用户要做哪些操作、配置什么,每执行标记完成,快速引导使用功能,参考其他项目实现」。

## 1. 背景与目标

新用户进 CreatorOS 面对空状态,不知道「要跑通产品必须先配哪几样」。目标:一次性看清必备配置 + 关键首步,逐项打勾,**完成状态尽量从现网 state 派生**(别新建冗余 progress 表),快速把新用户带到「能用飞轮」。

非目标:不做多步表单向导(不替代设置页真配置);不做交互式高亮 tour(参考项目多用「静态 checklist + 跳转到对应配置页」,更轻更可维护);引导只「指路 + 判完成」,不在引导内内联做每项配置。

## 2. 宪法对照(合定位)

对照 [产品定位](../../产品定位.md):引导服务「让创作者更快跑通选题→脚本→发布→复盘飞轮」,只聚合已存在的配置/首步入口,不引入新数据归属、不造平行 progress 真值(完成态派生自各能力自己的 state = 单一真值)。禁原生弹窗(用 `ui/dialog`)。诚实:每步完成判定基于真实 state,未配就显未配,绝不假打勾。

## 3. 现网事实(已勘查 2026-07-05,read-only 侦察)

- ①**无现成 onboarding/first-run/wizard 原语**(rg 全仓零命中)→ 新建,不撞车。
- ②每步「完成」可从现有契约读 op **直接派生**(零新表):
  - 文本/生图/生视频/审核/ASR 模型 → `settings.models.list`(对应 capability 行是否存在)。
  - 存储根目录 → `settings.storage.get`(rootPath 已设)。
  - 联网搜索 provider → 联网搜索配置(`settings.*` web.search provider,复用 T-126 设置卡真值)。
  - 定位母版 → `positioning.profile.get`(profile 非空)。
  - 首个项目 → `projects.list`(count ≥ 1)。
  - 违禁词表/审核规则、抖音扫码登录态 → 另有读源,切片时逐一接(违禁词=审核规则配置读、抖音=`.auth/` 登录态探测)。
- ③**modal 原语现成** `components/ui/dialog.tsx`(+ `sheet.tsx`/`popover.tsx`),复用 dialog 即合「禁原生弹窗」铁律。

## 4. 设计

### §A 引导 overlay(壳)
- 新组件 `features/onboarding/onboarding-overlay.tsx`(client):挂在 AppShell 层(或 ShellRouter),首次进入(未 dismiss 且有未完成必备项)自动弹 `ui/dialog`;顶部标题「快速上手」+ 进度(已完成 N/总 M)。
- **触发/收起**:localStorage `creatoros:onboarding:dismissed`=1 → 不自动弹;侧栏/首页留一个「上手引导」入口手动重开。全配完自动不再弹(派生:所有必备项 done)。dismissed 与 completed 分离(用户可暂时关掉但没配完,下次仍可手动开)。

### §B checklist(每项一步)
- 每步 = { key, 标题, 一句话为什么, 完成判定(纯函数吃现网 state), 跳转入口(去对应设置/页面) }。
- 完成态派生自 §3② 的读 op(server 端在 overlay 数据装配时并行读,产 `OnboardingVm { steps: [{key,title,why,done,href}], doneCount, total }`)。
- 未完成步:显「去配置 →」跳对应页;完成步:打勾灰显。**不在引导内内联配置**(指路即可,配置在各自页面的真表单)。

### §C 步骤集(**scope = OQ,待用户拍板**,见 §9)
推荐默认必备(MVP):①文本模型(跑通 AI 的地基)②定位母版 ③建首个项目。推荐可选(增益):生图/生视频/审核/ASR 模型、联网搜索、抖音登录、违禁词表。分「必备/可选」两组显示。

## 5. 现成方案 / OSS 调研

参考通行 onboarding checklist 模式(Linear/Vercel/Stripe onboarding):静态清单 + 完成态派生自后端 state + 跳转到真配置页,不做内联向导。本设计采此模式(轻、可维护、诚实)。不引第三方 tour 库(product-tour 类对本需求过重且强耦合 DOM)。

## 6. 数据与契约

**零新表、零新写 op**。overlay 数据装配复用现有读 op(`settings.models.list`/`settings.storage.get`/`positioning.profile.get`/`projects.list`/联网搜索配置/审核规则/抖音登录态)。dismissed 态存 localStorage(纯前端偏好,不落库)。若某步完成态无现成读 op(违禁词/抖音),additive 补只读判定端口,不改归属。

## 7. 切片(过 gate + 用户定 scope 后拆进 BACKLOG)

- **a** OnboardingVm 数据装配(server:并行读各能力 state → steps done 派生,纯函数判定 + 单测)。
- **b** onboarding-overlay 壳(ui/dialog + 进度 + dismissed localStorage + 手动重开入口)。
- **c** checklist 渲染(必备/可选分组 + 每步去配置深链 + 完成打勾)。
- **d** 违禁词/抖音登录态完成判定端口(若无现成读源,additive 只读)。
- **e** 验收:新用户空态弹引导、配一项后该项自动打勾、全配完不再自动弹、dismiss 后手动可重开。

## 8. 验收标准

- 新装/空 state → 首次进入自动弹引导,列必备项皆未完成 + 去配置深链可达。
- 配好某项(如建了首个项目)→ 重进引导该项自动打勾(派生自真 state,非手动标记)。
- 全部必备项完成 → 不再自动弹(可手动开查看)。
- dismiss → 本次会话不再自动弹;手动入口仍可重开。
- 每项完成判定 100% 来自现网 state(单测锁 done 派生);未配显未配,绝不假打勾。

## 9. 风险与开放问题(OQ — 待用户拍板)

- **OQ1(scope,阻塞)**:必备步骤清单取哪几项?推荐 MVP 必备 = 文本模型 + 定位母版 + 建首个项目;其余(生图/生视频/审核/ASR、联网搜索、抖音、违禁词)列「可选增益」。**待用户确认必备/可选划分。**
- **OQ2**:自动弹的触发条件——「有任一必备项未完成」还是「完全空 state(全未配)」?推荐前者(缺哪补哪)。
- **OQ3**:引导入口常驻位置——侧栏底部?首页顶部条?推荐侧栏底部一个低调入口 + 首次自动弹。
- 风险:各能力 state 读 op 并行装配的延迟(overlay 首帧)——用骨架 + 完成态异步落(不阻塞弹出)。
