# T-928 聊天失败修复与本机交付

候选：711403ad4c9f0ab5f3d25c7db161175822ae7ba9。冻结干净工作树 /tmp/creatoros-t918-package，版本四处一致为 1.1.0，已提交范围静态扫描无私钥/token 标记。包含 T-930 的 Pi 与装配清理。

根因：公开 CLI req-3302704d-595 返回 creatoros.guide 官方版本 v1+methods-intent-2026-09-08，与旧聊天硬编码 v1 冲突。真实官方模板的完整准备链路修复前必失败，修复后三入口通过；说明降级和账号/主 Skill 拒绝边界验证见 T-928 审计。未调用真实模型或读写业务数据库。

固定入口 pnpm -C frontend desktop:package-local：首次在混淆后启动检查因本机 Playwright headless-shell-1223 缺失退出1。仅用 playwright install chromium --only-shell 补齐环境，同候选同入口重跑退出0，没有修改或放宽构建脚本。

- DMG：/Users/zyongzhu/Downloads/CreatorOS-1.1.0.dmg
- SHA256：590eead2b8438896049abc688292953136413751ec6891cf71a7a349ff7cd2fc
- hdiutil verify：VALID，退出0。
- 本地 ad-hoc 签名，codesign --verify --deep --strict /Applications/CreatorOS.app 退出0；未 Apple 公证。
- 已替换并启动 /Applications/CreatorOS.app，PID 70579；日志 sidecar-2026-09-08-4.log.enc 于 12:15:43 UTC 记录 Ready，bundled Chromium 已配置。
- 安装端与候选 sidecar.tar.gz SHA256 均为 9094b5439708dc8aeae215af10cb1033516940c75c5f9bdae60b122c42283ab8，源码/安装不同步已消除。
- 构建生产编译、类型检查、Pi 依赖加载、隔离 sidecar 与浏览器加载检查通过；CodeGraph 更新退出0。

启动日志仍有既有 CLIENT_CONFIG_ACCESS_CHANGED 与初始化时 AccountRequiredError，不将其隐去或宣称全应用零错误；本次修复的是已实证的聊天版本门阻断。原失败消息无任务，不批量重提；真实模型生成由用户在原对话重新发送一次验证。

沿用用户暂缓业务测试授权：未跑业务自动套件、四项独立打包vitest、全局reconcile；没有发布、推送、tag、Windows包或真实生成。正式模型业务验收为 accepted-risk，不能把准备链路通过说成已生成正文。

日志：/tmp/t928-chat-fixed-package.log、/tmp/t928-chat-fixed-package-retry.log、/tmp/t928-chat-dmg-verify.log。
