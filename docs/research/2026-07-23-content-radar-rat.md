# T-482 内容雷达外部链路 RAT 记录

> 日期：2026-07-23
> 目的：验证现有对标主页、黑马搜索、收藏夹、动态网页、RSS 是否真的可读；只读，不写业务数据库。
> 应用运行版本：CreatorOS desktop runtime `0.1.0`。
> 源码状态：当前工作区（有未提交改动，不能用单一 commit SHA 代表）。
> 隐私处理：不记录账号昵称、`sec_uid`、收藏夹名、作品 ID、Cookie、正文或 URL 查询凭据。

## 执行约束

- 抖音测试使用当前桌面应用登录 profile 的临时副本；原 profile 未被测试进程打开或修改。
- 每类只执行一次限量读取，不触发 scheduled job，不调用写入 service。
- 动态网页使用现有 `readUrl`；RSS 使用现有 `parseFeed`。
- “函数返回空数组”不自动算成功，必须能证明获得有效上游响应。

## 结果

| RAT | 当前路径 | 预期 | 实际 | 判定 |
| --- | --- | --- | --- | --- |
| `RAT-CR-001` 本人身份 | `fetchDouyinIdentity` | 能解析稳定身份 | `ok=true, hasStableId=true` | PASS |
| `RAT-CR-002` 主页作品 | `fetchDouyinUserPosts(maxPages=1)` | 能获得有效公开作品 | 返回 36 条，36 条有稳定作品 ID | PASS；证明主页公开读取可行，不证明全量续传 |
| `RAT-CR-003` 关键词黑马 | 抖音热点宝 `douhot.douyin.com` 的“低粉爆款”榜单 + 作品详情 | 获得有效关键词结果、稳定作品 ID、作者粉丝数和表现指标，并区分登录/失败/合法空态 | 已登录网页输入“AI写作”后，榜单接口返回 HTTP 200 JSON、21 条作品；列表包含作品 ID/URL、标题、封面、作者、粉丝数、播放/点赞/涨粉、点赞率和发布时间。详情接口另返回分享数、评论数、完播率、平均播放时长和趋势结构 | PASS；热点宝可替代失效的抖音原始搜索路径，但结果是官方策展榜单，不宣称全站穷举 |
| `RAT-CR-004` 收藏夹列表 | `fetchDouyinCollectsFolders` | 获得稳定收藏夹 ID | 返回 1 个文件夹且 ID 完整 | PASS |
| `RAT-CR-005` 收藏夹条目 | `fetchDouyinCollectsVideos(maxItems=20)` | 获得有效收藏条目 | 返回 13 条，13 条有稳定作品 ID | PASS |
| `RAT-CR-006` 动态网页 | `readUrl(百度热榜)` | 抽取正文并保留页面身份 | Readability 抽取 8,258 字符，title/final HTTPS 均存在 | PASS；但当前 trend host 后续会丢弃 title/finalUrl/链接证据 |
| `RAT-CR-007` RSS | `fetch + parseFeed(BBC News RSS)` | 解析结构化条目与链接 | HTTP 200，解析 35 条，35 条 URL 有效 | PASS |

## 关键结论

1. 对标主页、收藏夹、动态网页和 RSS 的底层读取具备可复用基础。
2. 旧黑马路径仍然失效：真实登录 profile 可被 `checkDouyinStatus` 识别，但抖音原始搜索导航落到“验证码中间页”；硬编码接口返回 200 空正文，异常最终被压成 `[]`。该路径不得继续作为产品数据源。
3. 本 RAT 只证明“读得通/读不通”，不证明新产品的持久化、增量同步、重启恢复、调度、指标历史、逐字稿和确认门；这些仍需进入发布 canary 矩阵。
4. 热点宝在已登录 Chrome 中真实返回有效结构化响应，关闭了“关键词黑马没有可行上游”的事实 blocker。它的请求包含由官方页面会话生成的签名参数，CreatorOS 只能复用受控登录会话和页面运行时，不得写死签名、复制 Cookie 或脱离页面模拟长期静态 HTTP。
5. 热点宝当前品牌为“抖音生活服务热点中心”，但实测“AI写作”关键词仍返回非生活服务垂类作品。它是带榜单规则、时间窗和低粉爆款筛选的策展数据源，不是抖音全站任意视频搜索；产品文案必须使用“榜单发现/低粉爆款”，不能承诺全量搜索。

## 可复核摘要

```text
T482_DOUYIN_CANARY={
  "identity":{"ok":true,"hasStableId":true},
  "profile":{"ok":true,"count":36,"validItems":36},
  "search":{"ok":true,"count":0,"validItems":0},
  "favorites":{"ok":true,"folderCount":1,"hasStableIds":true}
}
T482_FAVORITES_ITEMS_CANARY={"ok":true,"folderCount":1,"videoCount":13,"validItems":13}
T482_SEARCH_NETWORK_CANARY={
  "legacyDouyinSearch":{"http":200,"title":"验证码中间页","apiBodyLength":0,"status":"failed"},
  "douhotBillboard":{"http":200,"contentType":"application/json","method":"POST","count":21,"status":"passed"}
}
T482_SEARCH_DOM_CANARY={
  "source":"douhot.douyin.com",
  "loggedIn":true,
  "board":"low_follower_breakout",
  "keyword":"AI写作",
  "visibleRows":true
}
T482_DOUHOT_LIST_SCHEMA={
  "request":["page","page_size","date_window","sub_type","keyword","tag_version"],
  "item":["item_id","item_title","item_cover_url","item_duration","nick_name","fans_cnt","play_cnt","publish_time","score","item_url","like_cnt","follow_cnt","follow_rate","like_rate"]
}
T482_DOUHOT_DETAIL_SCHEMA={
  "item":["item_id","item_url","play_cnt","share_cnt","like_cnt","comment_cnt","fans_cnt","finished_rate","like_rate"],
  "trends":["play_cnt","share_cnt","like_cnt","comment_cnt","finish_ratio","play_avg","new_fans_cnt","home_view_cnt","publish_time"]
}
T482_WEB_CANARY={"ok":true,"textLength":8258,"hasTitle":true,"finalHttps":true,"extractor":"readability"}
T482_RSS_CANARY={"ok":true,"http":200,"count":35,"validUrls":35}
```
