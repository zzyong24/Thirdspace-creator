# T-924 页面缓存交付记录

## 改动与证据

代码检查发现项目页重新获取最多 500 条列表后做本地分页，并为显示行读取输出/发布/修订等关联数据；选题页候选与今日读取结束后，来源过滤和总览原本继续串行等待。没有据用户描述把数据量推测当作实测瓶颈。

新增 page-read-cache.server 展示缓存，通过 createCachedPageClient 只接选题与项目两条 route。每次 route 仍先 resolveSession 验证用户和账号；未选号/非 user 来源不缓存。按用户+账号+操作+完整参数缓存，15 秒 TTL；同 key 在途复用；最多 128 条、序列化载荷估算总 16 MiB/单条 2 MiB；返回独立副本。公共非 GET 操作开始和 finally 都使该用户缓存失效；引用核对防止旧请求回填。合法成功 envelope 才保留，异常不缓存。

选题候选、今日、来源及总览改为一次 Promise.all，保持过滤、数量、排序契约。没有改数据库或 AI 读取路径。

## 实际验证与边界

独立 SPEC 评审 continuous_budget PASS。代码复核关注错误 envelope 缓存问题，已补成功响应验证。复核提出的挂起 Promise 永久复用已改为 15 秒复用窗口，完成后才重新开始数据 TTL。

2026-09-08：pnpm -C frontend exec tsc --noEmit --pretty false 退出码 0（/tmp/t924-types-final.log 为空）；git diff --check 通过。

按用户要求未跑业务测试、未跑全局 reconcile、未使用真实账号数据测时、未打包安装；这些是 accepted-risk，不记业务验收 PASS。后台服务直接写入/跨进程更新仍在下一次过期读取时收敛，15 秒不会主动推送 UI；首次冷读、超出缓存载荷上限、超大列表渲染可能仍慢。本次仅交付 T-924，不将 T-919 整体卡顿定位标完成。
