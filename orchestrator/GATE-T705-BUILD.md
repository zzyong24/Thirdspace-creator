# T-705 发布验收证据（2026-08-05）

## 结论

macOS 壳层启动条件已从“sidecar 进程存活且 TCP 可连接”收紧为“启动哨兵完成，且首页/激活重定向最终返回可渲染的 2xx HTML”。404、`Page Not Found`、空响应均不会再触发 WebView 首次导航。

## 回归证据

- Rust 红绿测试：`sidecar_http_probe_only_accepts_a_renderable_page`，覆盖真实 200 HTML 与 404 Page Not Found。
- Rust 启动分类测试：3 项通过。
- 桌面启动安全契约：8/8 通过。
- 桌面打包流程完成，包含混淆后真实 sidecar 根路由冒烟。
- DMG 完整性：`hdiutil verify` 通过。
- 版本：`0.3.0`。
- Bundle Identifier：`cloud.aitongban.creatoros`。
- 渠道配置拉取：构建时已启用，内置 Growth 生产 origin、验签公钥与 `growth-client-config-20260805-01` keyId。
- 本地测试包为 ad-hoc 签名，未公证；符合用户指定的本地测试包口径。

## 产物

- 文件：`CreatorOS_0.3.0_channel-config-fix_20260805.dmg`
- 大小：`404760444` bytes
- SHA-256：`892c64b044c2cb8ddd4ced4638902499ca530cb6e88b364cb7f3eb84768cb4de`

## 提交

- T-704 空 POST 修复：`4fc94c34`
- T-705 首次导航就绪修复：`69c28042`
