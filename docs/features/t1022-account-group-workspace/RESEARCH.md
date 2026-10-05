# T-1022 调研：账号组的落点

时间：2026-10-04。来源：当前工作树、用户首页截图、公开产品官方帮助。未读取真实数据库、未登录外部账号。

## 本地事实

| 入口／数据 | 证据 | 结论 |
| --- | --- | --- |
| 全局账号切换 | `frontend/src/components/shell/account-switcher.tsx`，listAccounts的query固定platform=douyin | 当前切换整个单账号工作区；cookie、localStorage和事件都需要升级 |
| 绑定管理 | `frontend/src/features/platform-account/account-manager-interactive-region.tsx`，PLATFORMS=[douyin]与loginDouyin | 平台账号登记表不等于所有平台可扫码绑定 |
| 权限上下文 | `contract/src/request-context.ts`，`frontend/src/lib/session.server.ts`、`http-transport.ts`、`backend/src/request-context.ts` | accountId缺失是引导态，不能当全局聚合；新groupId需要明确scope |
| 组内创作与资源 | `backend/src/schema/projects.ts`、`assets.ts`、`candidate.ts`、`intelligence.ts`、`knowledge.ts` | 多个共享领域以account_id作隔离，改下拉不能解决共享 |
| 发布与平台事实 | `backend/src/schema/publishing.ts`、`analytics.ts`、`scheduling.ts` | 真实账号、作品和采集任务需保持accountId；不能用组ID伪装账号ID |
| 首页 | `backend/src/application/queries/dashboard.ts`、`frontend/src/features/dashboard/dashboard-page.tsx` | 当前三列六卡及五指标模板，粉丝读取还有douyin/current-account限制；重构须修查询合同 |
| 运营与复盘 | `frontend/src/features/review/review-workspace-data.ts`、`analytics-review-page.tsx` | 需要组范围和逐平台窗口，并接回现有经验采纳链 |
| 平台协议缺口 | `contract/src/primitives.ts`、`backend/src/modules/platform-account/platform-account.service.ts` | 枚举含douyin/xiaohongshu/wechatVideo/youtube/bilibili/x，未含kuaishou或公众号 |
| 公众号／视频号混用 | `backend/src/modules/ai-runtime/platform-adapt-context.ts`与`platform-draft-adoption.ts` | 标签wechat表示公众号长文，却映射到wechatVideo；历史记录不可仅凭内容自动纠正 |
| 稳定身份与媒体 | `docs/superpowers/specs/2026-07-10-immutable-account-anchor-design.md` | 已确认accountId稳定、昵称不作身份、隐藏不删、原storageKey不迁；新方案必须保留 |
| 现有视觉变量 | `frontend/src/styles/tokens.css`、`frontend/src/app/globals.css`、共享Button/SectionCard/PlatformIcon | 保留紫色品牌、中文字体、8/12/16圆角和共享组件；改变对象和信息层级 |

CodeGraph于本轮执行 `index --force --quiet .`成功。`callers resolveRequestContext`找到19处静态调用，覆盖dispatch、chat、blob、知识API和本地宿主授权；动态装配另以rg核对。`impact AccountSwitcher`覆盖Sidebar与AppShell，不能只改独立组件。

## 同类产品

- [Buffer账号分组](https://support.buffer.com/articles/using-channel-groups-in-buffer-vtEPrhAiNr)：组能选中多个渠道并在写作器批量选择，渠道可进多个组。借鉴“组选择＋目标渠道”交互；CreatorOS的组承担定位和数据隔离，推荐采用唯一归属而非可重叠标签。
- [Metricool用户／品牌／社交账号结构](https://help.metricool.com/account-structure-user-brand-and-social-profiles-xun54)：品牌承接整套社交账号，每平台一连接。借鉴稳定工作区对象；CreatorOS保留同平台多账号，不照搬单连接限制。
- [Buffer Insights](https://support.buffer.com/en-us/articles/using-insights-in-buffer-x4gLauQU5a)：跨渠道总览与单渠道下钻共用过滤，部分渠道能力不支持。借鉴统一筛选和明确能力差异；不据此推断国内平台授权、采集或发布能力。

本轮未取得各国内平台完整官方API权限及真实登录发布回执，不能宣称五平台自动发布或全指标采集已经可用。实际接入必须逐项标识bind/collect/publish/draft/manual能力并真机验收。

## 设计取舍

品类是创作者的多平台内容工作区。频繁任务是继续创作、查哪些平台还没发、比较同一期表现。首页以内容和下一步动作为主角，避免聊天失败记录、热度排行、逾期排期和累计指标同权堆放。

两个候选保留现有品牌：A以一期内容为主行、平台为子行；B以平台为列，突出运营比较。推荐A作为日常首页，B的比较结构用于运营分析。正式选定前保留两稿，不将推荐标为用户批准。

## 证据边界

用户截图作为首页现状基线保存在baseline.png。候选使用其中已有作品标题；没有确认的组成员、平台身份、播放/阅读或采集时间一律空，不编造多平台业务成功。候选交互只改变原型内筛选与查看状态，不写生产库。
