# T-1434 首次官网更新交付

> 用户于首次上线后追加多平台与版本命名要求；本文件保留首次交付事实，随后追加两站真实截图与SEO；当前结果见 [第三次交付](r3/RESULT.md)，版本命名修订见 [第二次交付](r2/RESULT.md)。

2026-11-01 官网已部署，访问 `https://creatoros.aitongban.cloud/#changelog`。

- 已撤下页面顶部旧 Mac 验收包整块内容与下载入口。
- 补充 v1.2.0 九月、十月两批共 16 项功能与修复说明，更新至 2026-10-29；保留五个历史版本。
- 首页提示与页尾统一到 v1.2.0。近期构建沿用相同版本号，按月份归档，不编造额外版本。
- 保全线上 CR-1.5 的既有页面、隐私安全示意图与历史日期；不恢复仓库旧页面的商业入口。

## 验证

- `node --test website/*.test.mjs`：8/8，通过日志 `website-tests.log`。
- 真实旧线上页面失败证据 `production-before.log`：顶部下载块仍存在、版本为 v1.1、缺少最新记录，未伪造单测红色结果。
- `node docs/verification/t1434/verify-website.mjs --local`：本地真实浏览器通过。
- `node docs/verification/t1434/verify-website.mjs --report`：生产 HTTPS 真实浏览器，1440×1000、390×844；两个视口均检查 7 个批次、唯一选中项与面板、方向键、刷新、无下载块、无破图、无整页横向溢出。观测见 `browser-observations.json`，截图 `verified-1440.png` / `verified-390.png`。
- 前端正式收据：`frontend-report.md`，公共验证器执行结果 `frontend-gate.log`，最终任务完成事件由 taskctl 生成。
- `pmem sync` 已执行。`reconcile --profile quick --read-only` 为 0 error / 2 warning：看板超过 30KB 与 T-1420 既有长行。本次未执行全产品 lessons、桌面或安装版全量验收，不将控制面对账等同于全仓验证。

## 发布与回滚

仅原子替换远端 `/var/www/creatoros/index.html`。原 HTML 备份 `/var/backups/creatoros-t1434/20261101T094832Z/index.html`。发布前核对原文件哈希，避免覆盖并发改动；`updates/`、`prompts/` 下 6 个文件元数据保持不变，未改安装包或自动更新源。

公开 HTTPS 回读与本地 HTML SHA256 均为 `49e3a229122a844d295f5946b7d6d814781c19c3988ec1e930f1864614d954f7`，详见 `deployment.json`。仅在本地提交源码与验证记录，未推送 GitHub。
