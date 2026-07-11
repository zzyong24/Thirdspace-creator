# SPEC:选题/对标强化 —— 对标雷达 + 选题供给飞轮(借鉴飞书「鱼鱼AI运营」)

> 日期 2026-07-11 · 状态:待过 spec-review gate(改数据归属/新采集)· 对照宪法 [docs/产品定位.md](../../产品定位.md)
> 单一执行总账在 [BACKLOG.md](../../../BACKLOG.md)。来源:用户落地的飞书体系 `/Users/zyongzhu/xianwa-feishu` 蒸馏(T-212 研究报告)。

## 0. 一句话

把 CreatorOS 的对标从"手动导入单账号拆 pattern"升级为**「精选对标源 → 定时批量采集 → 统计学爆款判定 → AI 拆解 → 高适配自动转化进选题池」的持续运转供给管线**,并给选题评分加**防茧房校准**(淘汰信号 + 反过拟合护栏)。让选题池不再靠人工挤,而是被对标数据 + 数据反哺 + AI 持续供弹药。

## 1. 问题(现状不够)

- **对标停在拆 pattern**:CreatorOS 的 learn-from(源自 cheat-on-content)手动导入单账号 script+数据 → 拆 pattern 写 benchmark.md,**不自动进选题池、不定时、不多博主批量、无爆款筛选**。
- **选题池干**:`topic-runner` 的 `TopicBasis=trend`(注释「对标近期爆款」)**数据源是空的**——没有对标数据喂它。用户觉得选题不够。
- **无防茧房**:选题评分没有"用户淘汰信号回流 + 反过拟合护栏",AI 越学越窄的风险无机制拦。

## 2. 设计(4 切片,映射到现有模块,非重造)

> 复用核实(T-212):`candidate`(选题池,含 source/status/promoteCandidate 状态机)、`material-links`(对标素材关联)、`ai-runtime/scheduled-collection-scheduler`(采集调度框架)、`learnings`/`calibration`(飞轮)、现有 douyin 采集底座(iesdouyin `aweme/post` 匿名接口 + creator-center)、`topic-runner.TopicBasis=trend` 已预留。

### 2.1 S1 对标源采集(最高价值)
- **对标源实体**:用户登记对标博主(douyin `sec_uid` + 主页链接 + `enabled` 开关 + 备注)。落 `material-links` 扩展或新表 `benchmark_sources`(user/account-scoped,复用账号锚点 T-201)。
- **采集 job**:`scheduled-collection-scheduler` 加一种 sourceKind「benchmark」;triggerScheduledJob 读启用的对标源 → 逐源采集其作品列表。
- **采集实现**:复用现有 douyin 采集底座——对标是"他号",走 `aweme/v1/web/aweme/post` 匿名接口(页内 fetch,借登录态指纹,同 iesdouyin 那套),翻页游标(默认 ~5 页/100 条)。**归桌面 sidecar**(蹭登录态,后端云端不成立)。抓字段:aweme_id/desc(标题)/statistics.{digg,comment,collect,share}/duration/create_time。
- **容错**:每源 sleep 降频(≥1.5s)、遇验证码跳过该源下次重试、复用 T-202 导航重试 + T-176 限流网关。**只抓公开作品的公开统计,不碰非公开数据**(合规红线)。

### 2.2 S2 爆款判定(统计学纯函数)
- 照搬鱼鱼 `detect_viral`:`绝对爆款 digg≥10000` **或** `相对爆款 digg≥3×该源本次样本中位数 且 ≥1000`(黑马);`爆款倍数=digg/median`;每源每次最多收 10 条(防灌库),按赞降序。
- 落纯函数(可单测),阈值配置化。只有判定为爆款的作品进下游拆解(省 token + 降噪)。

### 2.3 S3 对标 → 选题转化(补闭环)
- 爆款作品 → AI 拆解(钩子/结构/为什么爆/可借鉴点/适配建议)——复用 learn-from 的拆 pattern,用**结构化 runner**(非自由文本)。
- **高适配项自动 `promoteCandidate` 进选题池**:`candidate.source=benchmark`,附参考链接(原视频)、爆款倍数;走现有评分门;单次 ≤3 条(防灌库)。**硬约束**:「不抄袭,同需求换本账号角度」写进拆解 prompt。
- 这补上 learn-from 缺的"自动进池"闭环。

### 2.4 S4 防茧房校准(反过拟合护栏)
- 用户淘汰选题时写一句原因 → AI 蒸馏成"该创作者偏好"信号,喂进选题评分。
- **护栏(照搬鱼鱼 `preferences.md` 精华)**:权重调整封顶 ±10;保留探索位(不让高分选题挤占全部);8 周衰减归档旧偏好;**≥3 例才升级**为硬偏好(单次淘汰不立即改规则)。落 `learnings`/`calibration`(飞轮已有),作新 learning 类型 + 评分前置注入。

## 3. 边界(不照搬飞书 hack)
- **采集归桌面 sidecar**:对标采集蹭登录态指纹,后端/云端/多租户不成立。归 desktop sidecar 采集能力。
- **触发用 CreatorOS 自有 dispatch**:选题状态变更 → 下游生成,直接 service 内同步/dispatch 触发,**不抄飞书 WebSocket**(自有 UI 反而更简单)。
- **输出用结构化 runner**:拆解/转化/评分用 `runStructuredNode`+Zod,**不抄鱼鱼的自由文本提示词 parse**(弱一致)。
- **不做全网爬虫**:定位=精选对标源 + 定时增量累积(合规、可控、防风控)。鱼鱼的"海量"也是这个意思。
- **domain 不硬编码**:鱼鱼 AGENTS.md 的母婴红线/rubric 是内容 domain 样例,CreatorOS 多账号多领域,只当"每账号一份 positioning"的参照,不进系统。

## 4. 切片(拆 Task)
- **T-212a 对标源实体 + 采集 job**:benchmark_sources 表/端口 + scheduler「benchmark」sourceKind + sidecar 对标采集(aweme/post 匿名 + 容错降频)。
- **T-212b 爆款判定纯函数**:detect_viral(中位数×3/绝对阈值,配置化)+ 单测。
- **T-212c 对标→选题转化**:爆款拆解(结构化 runner)→ promoteCandidate(source=benchmark+参考链接,≤3/次)。
- **T-212d 防茧房校准**:淘汰原因蒸馏 + 护栏(±10/探索位/8周衰减/≥3例)→ 选题评分前置。

## 5. 验收
- 登记对标源 → 定时/手动触发 → 落对标作品 → 爆款判定筛出 → 拆解 → 选题池出现 source=benchmark 的候选(附参考链接)。
- 淘汰选题写原因 → 偏好蒸馏 + 护栏生效(权重不越 ±10、探索位保留)。
- 采集容错:遇验证码/限流不崩、降频、只公开数据。三端 typecheck + 单测绿;采集归 sidecar 真机验。
