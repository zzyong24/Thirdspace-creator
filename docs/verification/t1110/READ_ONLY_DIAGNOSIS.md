# T-1110 浏览器开发资源只读诊断

## 结论

**直接失败层已确认，底层触发仍为 UNKNOWN。** 第二个绑定旅程不是“表格 locator 偶发找不到”：页面加载期间，Chromium 对一组 Next 开发静态资源统一报告 `net::ERR_NETWORK_CHANGED`，随后 Turbopack 抛出 `ChunkLoadError`，页面进入 “This page couldn’t load”。

- journey log SHA：`d624f380b8f7a4aa0f84eb7be4fc74aeeba4a70707e8e03375755101fbdb2946`
- 第二旅程 trace SHA：`ff55d2ede190d1bcb08fa876106da176240566fde52c41f7b4d10e098b04b53e`

## 可证事实

`0-trace.network` 中共有60个 `/_next/static/` 请求取得 HTTP 200；另有10个静态请求没有HTTP响应，状态为 `-1`，`_failureText` 均为 `net::ERR_NETWORK_CHANGED`。第一批失败集中在 `2026-10-09T05:41:57.472Z` 左右，包括：

- `node_modules__pnpm_1aoue7m._.js`；
- creator layout chunk；
- error/not-found/accounts page chunks；
- 后续两个 Turbopack HMR client chunks。

console先记录相同 `ERR_NETWORK_CHANGED`，随后页面错误明确为从 React Server Components 客户端加载 `node_modules__pnpm_1aoue7m._.js` 失败；HMR chunk 的 ChunkLoadError 是后续同类失败。失败请求没有404/500或响应正文。

因此目前证据支持“浏览器传输层报告网络环境变化”这一直接原因，不支持以下定因：

- Next生成的文件不存在或返回404；
- chunk内容哈希失配；
- 多工作树互相覆盖 `.next`；
- 安装版资源损坏。

触发 Chromium 网络变化判断的底层事件仍未知。归档没有OS网络事件、Chromium netlog或代理/接口变化记录，不能继续猜成缓存、并发服务或网络接口切换。

## 后续证据建议

若在当前隔离开发服务复测，应同时保留 Chromium netlog、Playwright `requestfailed` 文本与 Next 访问日志时间线。若缓存自然重建后不再出现，只能记录“恢复、原根因未知”；不应删除其他工作树缓存或据此修改产品。

本报告没有启动服务或测试、没有删除缓存，也没有判断第一例T1108准备顺序修复或安装通过。
