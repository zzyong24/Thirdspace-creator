# SPEC — onboarding 引导流程重构:有序引导(前置模型→起点→导入→初始化→定位→项目)(T-161)

> 状态:待用户过目 · 2026-07-06 · 关联 T-136§D(扫码)/T-151(一键初始化导入)/T-143(开箱UX)/T-159/T-160
> 一句话:新手引导从「扁平清单」改「有序引导流」——按新用户真实旅程一步步带,含前置门 + 从零/有存量分支。

## 1. 问题

现状 `onboarding-steps.ts` `ONBOARDING_STEP_SET` = **扁平清单**(必备:文本模型/首个项目;建议:定位/联网搜索;可选:生图/视频/审核/ASR/存储),`onboarding-card` 渲三档打勾卡。缺陷:
- **无顺序 / 无引导**:并列打勾,不告诉新用户「先干啥再干啥」。
- **无起点分支**:老抖音创作者(有存量作品)和从零新人走同一套,不导入、不预设定位。
- **不串真实旅程**:配模型→扫码导入→后台初始化→定位→项目 这条主线没串起来。
- **两处已失效步(T-159/T-160 联动)**:①「配置联网搜索」步 href 链到 **T-159 已删的卡** → 死链;②「配置 ASR」步随 **T-160 本地 Whisper 回退**变「选配」→ 不该再当独立引导步。

## 2. 目标(用户拍板的流程)

有序引导流,话术优化:
1. **配置文本模型**(前置门 —— 不配则后续全灰/锁,所有 AI 能力地基)。
2. **确认起点**:「你之前在抖音发过作品吗?」→ **从零** / **有存量**。
3. (仅有存量)**导入抖音账户**:扫码绑号(复用 T-136§D)。
4. (仅有存量)**后台数据初始化**:一键跑三个定时任务(导入作品 self.metrics + 逐字稿 + 明细,复用 T-151 一键初始化),后台带进度。
5. **创建定位**:有存量 → **基于导入的创作项目预设定位**(AI 读已导入作品草拟第一版);从零 → 和 AI 聊/手动建。
6. **创建首个项目**:有定位后落地首个项目,进创作飞轮。

## 3. 设计

### 3.1 流程状态机
在现有 `OnboardingState`(configuredCapabilities / hasPositioningProfile / projectCount / douyin.loggedIn)上加:
- `origin: 'fresh' | 'existing' | null`(用户对「起点」的选择;落 user_preferences 或 onboarding 专属存储;null=未选)。
- `importInitialized: boolean`(有存量:三定时任务是否跑过一轮 —— 可由「存在 imported 作品 / job_run 记录」推断)。

**步骤序 + 门控**(取代扁平三档):
| # | 步 | 前置(灰/锁条件) | done 判定 | 分支 |
|---|---|---|---|---|
| 1 | 配置文本模型 | 无(第一步) | `hasCapability('default')` | 全员 |
| 2 | 确认起点 | 步1 未 done | `origin !== null` | 全员 |
| 3 | 导入抖音账户(扫码) | origin≠existing 或 步1 未 done | `douyin.loggedIn` | 仅 existing |
| 4 | 后台数据初始化 | 步3 未 done | `importInitialized` | 仅 existing |
| 5 | 创建定位 | 步1 未 done(existing 还需步4) | `hasPositioningProfile` | 全员(existing 预设/ fresh 手动) |
| 6 | 创建首个项目 | 步5 未 done | `projectCount>=1` | 全员 |

fresh 分支跳过 3/4;existing 走全程。

### 3.2 「定位基于导入项目预设」(步5 existing)
existing 用户步5 不是空手建定位,而是 **AI 读已导入作品 → 草拟第一版定位母版**:
- 复用 `positioning.generate`(定位 AI 生成),**注入已导入作品作为 context**(作品标题/逐字稿/指标 → 反推账号定位)。
- 若现有 positioning.generate 没吃「导入作品」context,加一个 facet 注入(类似 T-146 的 material 注入 research)。**开工前核实 positioning.generate 现状**,能复用就复用。
- 产物是 candidate 定位,用户过目采纳(不 AI 直接写死)。

### 3.3 UI
- 把 `onboarding-card` 的「三档打勾清单」改「**有序引导流**」:竖向编号步、当前步高亮、前置未满足的步置灰+锁提示、existing/fresh 分支按 origin 显隐。
- 步2「确认起点」= 卡内一个二选一(从零/有存量),选完落 origin。
- 每步 CTA 深链到对应页(模型→settings、扫码→账号页/设置、初始化→自动化一键、定位→定位中心、项目→新建项目)。
- 话术按用户意「自己优化」(友好、说清为什么这步)。
- 全步 done → 卡自动隐藏(同现状 isOnboardingComplete)。

### 3.4 清理(T-159/T-160 联动)
- **删「配置联网搜索」引导步**(T-159 已删设置卡,href 死链)。
- **删/降「配置 ASR」引导步**(T-160 本地 Whisper 回退 → ASR 选配,不再当必走引导步;逐字稿在步4初始化里自动用本地 whisper)。
- 生图/视频/审核模型:仍是「可选增益」,可移到引导流之外的「可选增强」小区或折叠(不挤主线)。

### 3.5 改动面
- `onboarding-steps.ts`:step set 从扁平三档 → 有序 + 前置门 + 分支 + origin/importInitialized 判定;删 web-search/asr 步。
- `onboarding-data.ts`:state 装配加 origin(读存储)+ importInitialized(推断)。
- `onboarding-card.tsx`:渲染改有序引导流(编号/高亮/锁/分支)。
- 起点选择落盘:user_preferences 或 onboarding kv。
- positioning.generate:注入导入作品 context(步5 existing 预设定位)——按现状定。
- 后台初始化(步4):接 T-151 一键初始化(self.metrics+逐字稿+明细),带 job 进度。

## 4. 测试(TDD)
- 步序 + 门控:步1 未 done → 步2+ 锁;origin=fresh → 步3/4 隐;origin=existing → 全程。
- done 判定:各步 isDone 按 state。
- 清理:web-search/asr 步不再出现。
- existing 步5:定位预设吃导入作品 context(节点/facet 注入)。
- 全 done → 卡隐藏。

## 5. 不做(YAGNI)
- 强制线性(用户仍可跳步直接去某页;引导只是推荐序 + 门控提示,不硬锁导航)。
- 起点选错的复杂回滚(可重选 origin 即可)。

## 6. 需不需要过 gate?
**实现用户明确给定的引导流程(非新方向),是 UX 流程重构 + 串既有链路(扫码/导入/定位/项目)**——按铁律不改数据归属/产品方向,**不需新 spec-review gate**。拆 1 Task(=本 T-161)。开工前核实 positioning.generate 能否吃导入作品 context(verify-exists 铁律)。
