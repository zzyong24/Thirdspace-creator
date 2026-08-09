# T-745 V1 检查更新复验与首页滚动修复规格

> 用户确认：2026-08-09，正式包继续前先修复检查更新误报和首页滚动问题；不改视觉。

## 1. 已复现事实

- 当前安装包版本为 `1.0.0`。
- `https://creatoros.aitongban.cloud/updates/latest.json` 当前真实返回 `200`，清单版本仍为 `0.2.0`；因此 `1.0.0` 客户端应显示“已是最新版”，不能报网络失败。
- 用户截图来自今天较早生成的本地 `1.0.0` 包。提交历史证明该包所处的
  `888e1b1a` 曾同时在 `frontend/src/proxy.ts` 的页面响应与
  `frontend/src-tauri/tauri.conf.json` 注入 `connect-src 'self'`；因此其中的
  `desktop-updater.ts` 跨源 GET 会被浏览器拒绝并收敛成网络失败文案。
- 该整批未经逐项确认的安全改动已经由用户确认回滚：当前候选
  `41c50538..bfaabc3c` 的 `proxy.ts` 不再发送 CSP，正式与开发 Tauri 配置均为
  `csp: null`。所以当前候选的正确处置是复验既有公开清单 GET 已恢复，而不是再新增
  同源代理、扩大接口或改变更新契约。
- 首页外层 `PageScrollArea` 根节点和 Radix viewport 同时承担纵向 overflow；Chrome 中实际滚动发生在内层 viewport，根节点并无可滚内容。桌面 WebKit 下这套双重责任会导致用户滚轮链路不稳定。

## 2. 用户结果

1. 设置页继续显示真实当前版本 `v1.0.0`。
2. 点击“检查更新”时继续使用当前包编译期固定的 HTTPS manifest URL；不得新增路由、
   不接收客户端 URL，也不发送激活码、machineId、账号、项目、密钥或渠道票据。
3. 当前版本不低于清单版本时显示“已是最新版”；HTTP 不可用、格式错误和真实网络错误分别给出可读提示。
4. 保持当前候选已回滚后的 CSP 行为，不重新引入旧安全分支的响应 CSP；远端清单仍只信
   `version/notes`，不采纳其中的下载 URL。
5. 本任务不把线上清单提前改成 `1.0.0`；只有正式包完成并经用户最终发布确认后，才更新生产版本与下载地址。
6. 首页沿用当前卡片、间距、配色与结构；只保留 Radix viewport 作为唯一纵向滚动容器。鼠标滚轮可从顶部滚到第二行卡片，window、AppShell、侧栏和顶栏不跟随滚动。

## 3. 实现边界

- 更新检查不新增生产路径；只补足 `current=1.0.0/latest=0.2.0` 的回归断言，并在当前候选
  的正式桌面构建响应中确认没有旧分支的 CSP 头、公开清单真实可访问。
- `PageScrollArea` 根节点只负责 flex 尺寸和裁剪，Radix viewport 负责实际滚动；不替换组件、不改 dashboard 结构。
- 不修改 workflow、发布产物格式、Activity/Growth、渠道清单 schema 或视觉样式。

## 4. 验收

- updater 测试证明仍只请求包级固定公开清单，`current=1.0.0/latest=0.2.0` 返回
  `uptodate`，有新版仍只打开固定包下载页；构建后以 HTTP 响应和真实清单请求验证旧 CSP
  已不在当前候选中。
- AppShell 单测与真实浏览器功能 E2E 证明：正常与低高度窗口中 viewport 的 `scrollTop` 会随滚轮增加，第二行 dashboard 卡片进入视口；document/AppShell 不滚动，侧栏与顶栏位置不变。
- frontend typecheck、相关 ESLint、打包四项基本测试、test-integrity、boundary 与 semantic-boundary 通过；按用户要求不跑视觉回归。
