# T-745 V1 检查更新复验与首页滚动修复验收

> 验收日期：2026-08-09
>
> 结论：PASS（本任务范围）
>
> 视觉回归：按用户明确要求不运行；本任务没有修改视觉、布局、卡片或设计基线。

## 用户结果

- 旧本地 `1.0.0` 包的检查更新失败已定位到后续回滚的 `888e1b1a` CSP；当前候选不再发送该 CSP，未新增代理或更新接口。
- 当前候选保持固定公开 manifest GET；`current=1.0.0/latest=0.2.0` 明确返回“已是最新版”。
- 首页只让 Radix viewport 持有纵向滚动，外层 Root、window、AppShell、侧栏和顶栏均不跟随滚动。
- 没有修改生产 `latest.json`、workflow、下载地址、Activity/Growth 或发布范围。

## 代码与真实环境证据

| 检查 | 结果 |
| --- | --- |
| updater + AppShell 聚焦 Vitest | PASS，2 files / 49 tests |
| 首页真实 Chrome 滚轮旅程（1365×520） | PASS，viewport `scrollTop > 0`，第二行卡片进入视口，其余框架 `scrollTop = 0` |
| 当前正式桌面 Next build | PASS，Next 16.2.9 编译、类型检查、26 个静态页面生成完成 |
| 构建产物与当前源码 CSP 扫描 | PASS，未发现 `connect-src 'self'`；正式/开发 Tauri 配置均为 `csp:null` |
| 公开更新清单真实请求 | PASS，HTTP 200、CORS `*`、`version=0.2.0` |

## 工程门禁

| 门禁 | 结果 |
| --- | --- |
| frontend typecheck | PASS |
| T-745 聚焦 ESLint | PASS，0 error / 0 warning |
| 正式打包四项测试 | PASS，4 files / 40 tests |
| test-integrity | PASS，0 error；保留 1 条既有 coverage 配置 warning |
| boundary-scan | PASS，无新增违规；5 条既有基线 |
| semantic-boundary-scan | PASS |
| orphan-scan | PASS，0 error；100 条既有 warning |
| `git diff --check` | PASS |

## 诚实保留项

- `app-shell.spec.ts` 全文件本轮为 5/7：本任务新增的滚动旅程通过；两条既有失败仍断言旧版“7 个导航项”和旧焦点步数，而当前产品已有 10 个导航项。它们不是本次滚动回归，也未为打包临时改写。
- 线上清单仍为 `0.2.0` 是当前生产事实；在用户最终确认发布前不改成 `1.0.0`。
- 本 Gate 不冒充签名安装包真机证据。macOS 签名、公证、staple、Gatekeeper 与 Windows 构建由重新触发的 GitHub 正式流水线证明。
