# T-482 内容雷达产品规格独立评审

> Artifact: `2026-07-23-content-radar-restructure-design.md`
> Review mode: `cross-family`
> Reviewer: `gpt-5.6-sol`（独立只读 `codex exec`）
> 日期：2026-07-23

## Round 1

- Verdict: **FAIL**
- 汇总：3 blockers、6 majors、1 minor。
- 总评：产品方向与“定位→情报→选题”的目标一致，但首稿尚不能安全进入 Contract；主要问题是未执行 RAT、多来源归因会丢失、迁移没有切断旧写者和保护切换后的新数据。

| # | 级别 | 评审发现 | 处理结论 |
| --- | --- | --- | --- |
| B1 | blocker | 抖音主页、黑马搜索、网页/RSS 只写了“待做 canary”，没有真实证据 | 接受。已补 `RAT-CR-001..007`；6 条 PASS，黑马搜索 `RAT-CR-003` FAIL，因此规格状态改为 blocked |
| B2 | blocker | `IntelligenceItem.sourceId` 只能表达一个来源；同作品来自对标、收藏、多个关键词时会丢归因，AI 也未绑定不可变证据 | 接受。新增 `ItemSourceObservation`、`SourceSnapshot`，item 只合并内容本体，transform 固定绑定 snapshot |
| B3 | blocker | 迁移缺新数据保护、旧 writers 清单、反向恢复；benchmark teardown 与 favorites promotion 仍会自动写候选 | 接受。新增 `FLOW-CR-008`、迁移状态机、write fence、观察窗、旧 writers 清单和保全/orphan 回滚 |
| M1 | major | “错误不得伪装 0 条”没有覆盖全部五类 adapter，也没定义 `succeeded_no_change` 的最小证据与聚合优先级 | 接受。新增统一 adapter 信封、五类最小成功证据及 partial/failed/blocked 聚合规则 |
| M2 | major | 所有 >2 秒任务的可恢复性没有具体持久 primitive；引用了不存在的 `MOD-006/PATTERN_INDEX.md`，HARD stage 写了不存在的 Research | 接受。删除错误引用；明确 DB-backed claim/lease/heartbeat/checkpoint/startup recovery，覆盖同步、转写、AI，stage 改为现有 Contract/Build/Prelaunch |
| M3 | major | 发布 canary 太少，未覆盖五个 adapter、计划触发、二次增量、重启恢复、逐字稿、AI 确认/取消和双账号 | 接受。新增逐格发布 canary 矩阵 |
| M4 | major | 分类 CRUD、批量转写、监控开关、删除语义、性能、限流和成功指标定义没有完整 AC；CR IDs 未登记 | 接受。补 AC、统计口径，并登记 ID Registry/Traceability 为 PLANNED |
| M5 | major | 任意网页/RSS URL 缺 SSRF、DNS rebinding、重定向、响应体与超时安全约束 | 接受。新增 `NFR-CR-011`、`HARD-CR-005` 和 `AC-CR-019` |
| M6 | major | 相似性风险是模糊提醒，比较范围、级别、长段规则和高风险 UI 行为未定义 | 接受。首轮曾写为“高风险阻止创建 Project”；该表述已被后续用户裁决取代。当前规则是 Project 可先创建，高风险只阻止采纳正式稿件版本 |
| m1 | minor | 本机历史日志不可复核，且引用了不存在的 pattern 文档 | 接受。真实结论转写入独立 RAT 证据文档；历史日志只作现场线索，不作放行证据；删除错误引用 |

## Round 1 后状态

修订已关闭模型、迁移、任务、错误契约、安全、AC 和追溯性设计缺口，但 `RAT-CR-003` 仍是实际失败。该失败不能靠改文档关闭：当前黑马搜索 adapter 没有收到可验证搜索响应，函数仍返回空数组。按产品 gate，T-482 保持 **FAIL / blocked**，不能进入业务实现。

## 用户裁决

用户于 2026-07-23 完成裁决并纠正阶段边界：

1. 评论只保存公开计数，不抓评论正文；取不到允许诚实降级为“未知”。
2. 逐字稿只能手动发起，单条/批量都进入异步持久队列，不提供自动转写。
3. 首批平台为抖音、通用网页和 RSS；登录墙提供打开登录会话的引导。
4. 内容雷达只产选题，不生成稿件。用户从选题创建 Project 后，才在 Project 脚本工作区生成/改写；高相似候选不能采纳为正式稿件版本。

上述裁决已写入 `DEC-CR-002/006/007/008/009`。用户确认产品口径不等于豁免 `RAT-CR-003`；黑马读取的只读可行性证据仍必须单独通过。

## Round 2

- Review mode: `cross-family`
- Reviewer: `gpt-5.6-sol`
- Verdict: **FAIL**
- Remaining blockers: 1
- Remaining majors: 0
- New findings: 0

评审确认 Round 1 的 B2、B3、M1~M6 和 m1 共 9 项均已关闭。唯一剩余项：

- `B1 / RAT-CR-003`：黑马搜索仍未取得可验证的有效上游响应，现有函数把该状态返回为空数组，无法区分真实零结果与读取失败；不得以文档、错误契约设计或用户确认豁免。

结论：规格保持 `blocked`；不得进入 Contract、Design 或 Build。下一步只能继续黑马搜索的只读可行性验证，直到至少保存一次有效搜索响应，并证明验证码、风控、结构变化和合法空结果能够被明确区分。

## Round 3（用户裁决后复审）

- Review mode: `cross-family`
- Reviewer: `gpt-5.6-sol`
- Verdict: **FAIL**
- Remaining blockers: 1
- Newly reported majors: 2

确认一致的部分：评论缺失诚实降级、逐字稿纯手动异步、抖音/网页/RSS 平台与登录边界、雷达只产选题、Project 内才产稿、高相似只阻止正式稿件采纳，以及 item→observation→snapshot→topic→Project reference 的数据归属主链。

| 发现 | 裁决与处理 |
| --- | --- |
| `B1 / RAT-CR-003` 仍无法区分黑马合法空结果与无有效响应 | 接受，未关闭；继续作为唯一实机 blocker |
| `FR-CR-006/017`、`NFR-CR-005/007/010` 缺显式 AC，永久删除保全和 adapter 隔离验收不足 | 接受；`AC-CR-001/003` 补引用，新增 `AC-CR-022/023` 覆盖删除/快照保全与 adapter/领域隔离 |
| 北极星分母排除了始终同步失败的账号，存在幸存者偏差 | 接受；分母改为“打开过雷达并创建 enabled source”，不要求成功 run；新增首次有效 run 和首次内容到达率护栏 |
| Round 1 M6 历史表述仍写“阻止创建 Project” | 接受；显式标记已被用户裁决取代 |
| Mermaid 节点 `R/M` 冲突且 `E` 悬空 | 接受；重写为 `RH/RADAR/MET/SNAP/SCRIPT` 唯一节点 |
| “不得进入 Contract”与“允许契约设计”措辞冲突 | 接受；改为仅允许 PLAN 内记录 adapter 失败信封草案，不代表进入 Contract |

受三轮评审上限约束，本轮发现已逐项修订并通过本地一致性检查，不再启动第四轮评审。总 verdict 仍为 **FAIL**，因为 `RAT-CR-003` 不是文档修改可以关闭的事实 blocker。

## `RAT-CR-003` 追加实机复验

2026-07-23 使用 CreatorOS 安装版当天更新、且 `checkDouyinStatus=true` 的登录 profile 临时副本复验：

1. 现有 `fetchDouyinSearchVideos("AI工具")` 仍返回 0。
2. 同 profile 的原始导航 HTTP 200，但页面标题为“验证码中间页”，正文仅 4 个空白字符；无头和有头 Chrome 结果一致。
3. 现实现只检查正文是否包含“验证”，因此未识别该验证码页。
4. 随后的硬编码 `/aweme/v1/web/search/item/` 返回 HTTP 200、`text/plain`、0 字节；JSON 解析错误被函数内部吞成普通对象，解析层再输出空数组。

这次复验把 blocker 从“没有有效响应、原因未定”收敛为“验证码中间页 + 空响应被伪装为合法 0”。它提高了根因确定性，但没有取得成功搜索信封，因此不关闭 `B1 / RAT-CR-003`，评审结论仍为 **FAIL**。

## 热点宝替代路径验证

用户随后指定抖音热点宝作为关键词黑马备选。2026-07-23 只读实机验证确认：

1. 当前 Chrome 登录态可访问 `douhot.douyin.com`，网页端“低粉爆款”榜支持关键词、时间窗和垂类筛选。
2. 输入“AI写作”后，`POST /douhot/v1/material/video_billboard` 返回 HTTP 200 JSON 和 21 条作品；请求体有 `page/page_size/date_window/sub_type/keyword/tag_version`。
3. 列表作品具备稳定 ID/URL、标题、封面、作者、粉丝数、播放/点赞/涨粉、点赞率和发布时间。
4. 详情 `item_info` 与 `data_trends` 接口另有分享数、评论数、完播率、平均播放时长和趋势字段。
5. 请求签名由官方页面会话生成；规格已禁止固化签名、Cookie 或脱离登录页面模拟静态长期调用，并明确该来源是策展榜单而非全站穷举。

因此 `RAT-CR-003` 从事实层转为 **PASS**，原 `B1` 的“无可行黑马上游”已关闭。由于上游从抖音原始搜索替换为热点宝是评审后三轮之外的新服务边界，本文件保留原三轮历史 verdict，不自行把总评改成 PASS；T-482 下一步应只做一次针对 `DEC-CR-010` 的独立 delta review，评审通过后才可进入 Contract/Build。

## DEC-CR-010 Delta review · Round 1

- Review mode: `cross-family`
- Reviewer: `gpt-5.6-sol`（独立只读 `codex exec`）
- Verdict: **CONCERNS**
- Finding: 0 blocker、1 major、0 minor

评审确认 `RAT-CR-003` 已关闭“关键词黑马无可行上游”的原 blocker，热点宝替换没有引入新的架构、数据归属或安全 blocker。唯一 major 是：规格同时写了热点宝“低粉爆款”榜单、三档黑马和复用 `detectDarkhorse`，但没有定义榜单候选与本地判定的唯一关系，可能导致实现者分别选择“全量接纳榜单”“沿用旧阈值二次过滤”或“按官方 score/rank 分档”。

**处理：接受。** `DEC-CR-010`、`FR-CR-010`、`FLOW-CR-003`、运行成功信封、OSS 复用表和 `AC-CR-005` 已统一为：

1. 热点宝 `low_follower_breakout` 只提供候选集；
2. 仓内 `detectDarkhorse` 保留为唯一领域判定，并修正未知粉丝语义；
3. 固定 48 小时窗口和 strong/niche/mid 三档阈值、优先级、排序、top 5 均写入规格；
4. 未命中候选只记 run 计数/过滤原因，不写内容本体；
5. 官方 rank/score/date_window/sub_type 只作来源证据，不参与本地档位。

该 finding 属可执行性补清，不改变用户已确认的产品方向、数据归属或平台边界。修订后需再做一次 delta re-review；通过前仍保持 blocked。

## DEC-CR-010 Delta review · Round 2

- Review mode: `cross-family`
- Reviewer: `gpt-5.6-sol`（独立只读 `codex exec`）
- Verdict: **CONCERNS**
- Finding: 0 blocker、2 major、0 minor

| Finding | 处理 |
| --- | --- |
| 规格同时要求持久登录会话、计划运行和“不保存 Cookie”，没有区分浏览器 profile 与业务系统凭据，重启恢复及安全责任不明确 | 接受。明确允许受控 session manager 在 canonical appData 下按账号/站点管理可撤销 profile；业务库只保存 `browserSessionRef`，adapter/任务/日志不得读出或复制 Cookie/签名；补 profile 清除、会话失效、重启计划 run 和 secret 扫描验收 |
| `fans_cnt=0` 不属于缺失，但旧赞粉比会除零/伪造；top 5 缺最终稳定排序键 | 接受。零粉赞粉比固定为 `null`，只允许命中绝对阈值分支；排序补为档位→非空赞粉比→点赞→发布时间→`item_id`，并补零粉与重复运行 fixture |

两项均为安全/确定性契约补清，不改变用户确认的产品形态。修订后执行最后一次 delta re-review；通过前仍保持 blocked。

## DEC-CR-010 Delta review · Round 3

- Review mode: `cross-family`
- Reviewer: `gpt-5.6-sol`（独立只读 `codex exec`）
- Verdict: **PASS**
- Findings: 0

评审确认：

- 热点宝已被限定为登录态下的 `low_follower_breakout` 策展候选源；
- 受控浏览器 profile 的账号隔离、持久化、撤销和敏感信息边界可执行；
- 本地 48 小时三档判定、零粉语义、过滤规则及稳定排序均有验收；
- 该 delta 没有引入新的产品、架构、数据归属或安全 blocker/major。

**最终裁决：接受 PASS。** 原 `RAT-CR-003` blocker 与本次服务边界 delta 均已关闭，T-482 可以离开 PLAN，进入 Contract。用户于同日明确要求开启落地实现阶段，视为在既有已确认范围内继续推进，不新增范围。
