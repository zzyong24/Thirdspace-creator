# 抖音采集统一限流/退避子系统 设计(T-038)

> 状态:草稿待过 spec-review gate(改采集架构层,verdict≠FAIL 才准开工)。
> 引用铁律:CLAUDE.md「任务流程铁律」§7/§8;宪法 [docs/产品定位.md](../../产品定位.md)。
> 上游:[real-works-data-pipeline-v2](2026-07-01-real-works-data-pipeline-v2-design.md)(采集/逐字稿/明细/复盘)。

## 1. 背景与问题(真实现状,子代理调研 2026-07-02)

CreatorOS 所有抖音抓取**没有任何系统性限流**。现状(`file:line` 真实):

- **无限流库**:`frontend/package.json` / `ai-worker/package.json` 均未装 `p-limit`/`p-queue`/`bottleneck`;全仓无 backoff/retry 算法。零散 `waitForTimeout` 只为页面稳定,非刻意节流。
- **批量循环无请求间隔**:`fetchDouyinMetrics`(douyin-cdp.ts:644-671,翻页最多 40 页)、`fetchDouyinCommentsForWorks`(douyin-cdp.ts:863-867,72 作品逐个导航)、`scrapeCommentsForWork`(评论翻页 40 页)——循环内只有页面加载等待,无防封间隔。
- **dispatch 是 fire-and-forget 无并发控制**:`dispatchScheduledCollection`(persistence-client.ts:2717-2725)`void runScheduledCollection(...)` 即返;同一分钟多个 job 到点时可并发起多个 Chromium 采集。
- **风控靠临时脚本绕、没沉淀进代码**:T-037 逐字稿撞 iesdouyin 风控(`无法从_ROUTER_DATA解析`,douyin-cdp.ts:247-249),我当时靠**临时 shell `CAP=1 + 8s gaps`** 手动绕过——**代码里一点没留**,下次全量又会撞。

**两条风险面(必须分开处理):**

| 通路 | 身份 | 封什么 | 覆盖的采集 |
|---|---|---|---|
| **创作者中心**(creator-center) | 带 `sessionid` cookie(`.auth/` persistent context) | **账号**(catastrophic,不可逆) | `fetchDouyinMetrics` / `fetchDouyinComments*` / `fetchDouyinWorkListExport` |
| **iesdouyin**(无 cookie 公开分享页) | 手机 UA 无认证头 | **IP**(影响面广) | `fetchDouyinVideoUrl`(逐字稿取视频直链)/ `streamAudioFromVideo` |

**用户硬约束(2026-07-02):** 所有抓取(评论/明细/单视频指标/逐字稿)一定要做好限流 + 风控退避,**可慢慢后台跑,但绝不能把 IP/账号封了**。

## 2. 目标 / 非目标

**目标:**
1. **一个共享采集网关**(`DouyinRequestGateway`):所有对外抖音请求过它,不再各爬虫各写(或不写)间隔。
2. **每通路串行 + 最小间隔 + jitter**:把 T-037 的 `CAP=1 + 8s` 从临时 shell **沉淀进代码**,creator-center 与 iesdouyin 分别限速。
3. **风控信号 → 指数退避 + 持久 cooldown**:命中风控就退避,cooldown 落库(跨 server 重启不丢,防重启后 thundering herd)。
4. **风控错误 vs 内容错误分类**:图集/无视频/已删除**不是风控**(T-037:41 图集失败 0 风控),**不触发退避**;只有真风控信号(429/验证码/`_ROUTER_DATA` 解析失败/导出超时)才退避。
5. **可观测**:采集任务在 cooldown/排队时,任务中心显示「限流中·下次约 N 分钟后」,而非看起来卡死。
6. **后台友好**:慢是可接受的(用户明确);长 cooldown 正常,任务显示 running/queued 而非失败。

**非目标:**
- 不做分布式限流(单 Next server 进程,module 单例 + DB 持久即够;prod 是常驻进程非 serverless)。
- 不做代理池/换 IP(那是对抗升级,超出「别把 IP 封了」的诉求;本期是**降频率避免触发**,非绕过风控)。
- 不改采集的业务逻辑(抓什么、落什么不变),只在请求层加节流。
- **不接 model-config**:这是基础设施不是模型能力,参数走配置默认值 + 可选覆盖,不进 model-config。

## 3. 对照宪法(产品定位)

- 采集是「真实作品数据管线」(T-030)的底座,服务于**用真实数据驱动创作飞轮**。限流保护用户的真实抖音账号/IP = 保护用户核心资产,合定位。
- 不摆假(§8):限流中/退避中要**诚实显示状态**(「限流中,下次约 N 分钟」),不假装采集成功、不静默。
- 不新增产品方向、不改数据归属——纯基础设施加固,**不触发方向/数据归属变更**(但仍属采集架构层,按铁律过 gate)。

## 4. 设计

### 4.1 核心:`DouyinRequestGateway`(单例,frontend 进程内)

一个 module 级单例,按 **channel** 管理串行队列 + 节奏 + 退避。所有对外抖音请求**先 `acquire(channel)` 拿令牌,完成后 `report(channel, outcome)`**。

```ts
type DouyinChannel = "creator-center" | "iesdouyin";

interface GatewayPacing {
  minIntervalMs: number;   // 同 channel 两次请求最小间隔
  jitterRatio: number;     // ±比例随机抖动(如 0.3 → ±30%),打散规律性
  // 并发恒为 1(每 channel 串行);不暴露并发参数,防误配
}

interface GatewayBackoff {
  baseCooldownMs: number;  // 首次风控 cooldown(如 2min)
  factor: number;          // 指数因子(如 2)
  maxCooldownMs: number;   // 上限(如 60min)
  // consecutive 风控次数 n → cooldown = min(base * factor^(n-1), max)
}

class DouyinRequestGateway {
  // 每 channel:一条串行 promise 链 + lastRequestAt + cooldownUntil + consecutiveThrottles
  async acquire(channel: DouyinChannel): Promise<void>;
  //   ① 若 channel 在 cooldown → 等到 cooldownUntil(+jitter)
  //   ② 串行:等上一个 acquire 释放
  //   ③ 距 lastRequestAt 不足 minInterval → 等差额(+jitter)
  //   ④ 记 lastRequestAt = now,放行
  report(channel: DouyinChannel, outcome: "ok" | "throttled" | "content-error"): void;
  //   ok:consecutiveThrottles=0,清 cooldown
  //   throttled:consecutiveThrottles++,设 cooldownUntil = now + backoff(n),持久化
  //   content-error:不动退避状态(图集/无视频等,非风控)
}
```

**时钟注入**:构造接受 `now: () => number` + `sleep: (ms) => Promise<void>`,测试注入假时钟 → 确定性单测(不真等)。

### 4.2 风控 vs 内容错误分类(关键,防错误退避)

新增纯函数 `classifyDouyinOutcome(error): "throttled" | "content-error" | "ok-ish"`:

| 信号 | 分类 | 依据 |
|---|---|---|
| HTTP 429 / 页面含验证码/滑块 | `throttled` | 明确速率限制 |
| iesdouyin 无 `_ROUTER_DATA` / JSON 解析失败(douyin-cdp.ts:247-257) | `throttled` | 风控返回残页(T-037 撞的点) |
| 导出 `waitForEvent download` 超时(非「无数据」文案) | `throttled` | 疑似频控 |
| `item_list` 空但页面正常 / desc 标注图集 / ffmpeg code=183 | `content-error` | 图集/无视频=内容性质,非风控(T-037:41 图集 0 风控) |
| 导出 toast「当前暂无数据可导出」 | `content-error` | 内容空,非频控 |
| 网络 ERR_TIMED_OUT(偶发) | `throttled`(保守) | 宁可退避 |

> 分类保守偏「throttled」——**宁可慢,不可封**。唯有能确诊为内容性质的才判 `content-error`。

### 4.3 持久化(跨重启不丢 cooldown)

新增轻表 `douyin_throttle_state`(迁移 0010),每 channel 一行:

```
channel TEXT PK | cooldown_until TIMESTAMPTZ | consecutive_throttles INT | last_request_at TIMESTAMPTZ | updated_at
```

- Gateway 启动时**从表恢复** cooldown/consecutive(防重启后立刻一拥而上撞风控)。
- `report(throttled)` 写表;`report(ok)` 清零写表。
- 用现成 db pool(persistence-client 的 Pool),user 无关(采集是账号级全局,不 user-scoped——单用户本地部署)。

### 4.4 集成点

1. **douyin-cdp 请求网关**(主):在每个对外请求前后包一层。
   - `fetchDouyinVideoUrl`(:320)前 `acquire("iesdouyin")`,后按结果 `report`。
   - `fetchDouyinMetrics` 翻页循环(:644)、`scrapeCommentsForWork` 翻页、`fetchDouyinWorkListExport`(:1154)前 `acquire("creator-center")`——**每次翻页/每个作品都过一次 acquire**(把 72 作品循环、40 页翻页真正限速)。
   - 统一 helper `withDouyinChannel(channel, fn)`:acquire→try fn→report(classify)→return/throw,减少插装重复。
2. **dispatch 任务串行**:`dispatchScheduledCollection`(persistence-client.ts:2717)——采集类任务过一个**全局串行闸**(同时只跑一个采集 job,防两个 Chromium 并发绕过 channel 限速)。轻量:一个 module 级 `collectionRunQueue`(concurrency 1)包住 `runScheduledCollection`。
3. **scheduler 不变**:`scheduled-collection-scheduler.ts` 逐 job await 触发不改;真正的节奏由 gateway + dispatch 串行闸控。

### 4.5 可观测性(诚实,不装死)

- Gateway 暴露 `getChannelStatus(channel) → { cooldownActive, cooldownEtaMs, consecutiveThrottles, lastRequestAt }`。
- 采集 job_run/任务反馈(复用 T-032 的 `runResultText`)在 cooldown 时显示「⏳ 限流保护中,下次约 N 分钟后重试(已连续退避 K 次)」——用户明确知道在慢速跑、没卡死、没封号。
- 逐字稿/明细全量这种长任务:分批入队,任务详情显示「已完成 x/N,限流节奏中」。

### 4.6 配置(默认值 + 可选覆盖,不进 model-config)

集中在 `douyin-throttle-config.ts` 常量(可被 env 覆盖):

| 参数 | creator-center 默认 | iesdouyin 默认 | 说明 |
|---|---|---|---|
| minIntervalMs | 4000 | 9000 | iesdouyin 更保守(IP 封面广 + T-037 实测 8s 可绕) |
| jitterRatio | 0.3 | 0.3 | ±30% 打散规律 |
| baseCooldownMs | 120000(2min) | 120000 | 首次风控 cooldown |
| factor / maxCooldownMs | 2 / 3600000(60min) | 2 / 3600000 | 指数退避上限 |

> 默认值偏保守;用户觉得太慢可调 env 加速,觉得还想更稳可调大。**先以「不封」为最高优先**。

## 5. 测试策略

- **Gateway 单测(注入假时钟,确定性、不真等)**:①串行——并发 acquire 按序放行;②min-interval——两次 acquire 间隔≥minInterval;③jitter 在 ±ratio 内;④backoff——连续 throttled 的 cooldown 指数增长且封顶;⑤ok 清零;⑥content-error 不动退避;⑦cooldown 期间 acquire 阻塞到期。
- **classify 纯函数单测**:每类信号 → 正确分类(尤其图集=content-error 不退避)。
- **持久化集成测**(pglite/PG):report(throttled) 落表 → 新建 gateway 从表恢复 cooldown。
- **集成冒烟**:注入 fake 采集(部分返 throttled),断言 dispatch 串行闸 + gateway 退避真生效、任务反馈显限流文案。
- 真机 e2e(真跑 T-036 翻页 / D8b 逐作品)在网关就位后**慢速验证不撞风控**——genuinely 需真登录态,标注。

## 6. 切片(过 gate 后拆进 BACKLOG 开工,垂直真做)

- **T-038a** Gateway 核心 + classify + 持久化(迁移 0010 + 恢复)+ 确定性单测。**无集成**,纯可测单元。
- **T-038b** 集成:`withDouyinChannel` 包 douyin-cdp 所有对外请求(iesdouyin + creator-center 翻页/多作品)+ dispatch 采集串行闸 + 冒烟。
- **T-038c** 可观测:cooldown/eta 透传任务中心 + 采集反馈文案 + 长任务批次进度。
- 三片同一 SPEC,一次做完(subagent/workflow);不 P0/P1、不减法分期。

## 7. Open Questions(非阻塞,默认已决)

1. **串行闸粒度**:全局单闸(任何时刻只 1 个采集 job)vs 每 channel 闸?→ **默认全局单闸**(最稳;采集非高频,串行可接受)。gate 若认为过严可放到每 channel。
2. **iesdouyin 9s 是否够**:T-037 实测 8s + CAP=1 已绕过(慢速批 0 风控)→ 9s + jitter 更稳;真机再调。
3. **cooldown 上限 60min 是否够长**:严重风控可能需更久;60min 封顶 + 连续退避计数可观测,用户可干预(暂停任务)。
