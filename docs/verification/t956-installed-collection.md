# T-956 安装版采集阻断修复验收

候选 `787b4279`，干净目录 `/Users/zyongzhu/Workbase/Thirdspace-creator-t955-package`；通过官方本地入口构建。

## 根因与修复

实际日志两次 `skills.min(1)` 使 `scheduled.self.traffic` 准备失败，原 task failed、队列 pending。仅该确定性浏览器任务允许真实空 Skill，其他模型任务维持非空约束。点击与重启恢复共用准备失败结算，按真实任务绑定结束 run；冻结队列按账号、作品、外部 ID、请求时间及 pending 条件标记失败，保留上次成功数据和并发新请求。页面立即读回失败状态并允许重试。

## 已发生证据

- 原始真实空快照红测；backend 72、contract 6、页面 7 项通过。补充真实数据库重启恢复与绑定 24 项通过（与前述存在重叠，不相加计数）。
- frontend 与 ai-worker 类型检查通过。
- 打包 4 文件 42 项通过；页面 hydration 与真实 sidecar 启动通过。
- DMG：`/Users/zyongzhu/Downloads/CreatorOS-1.1.0.dmg`，SHA-256 `bad6a0409fd3fe9a01aac6d2569d83622037bce5c8641503cda77ec622379931`，hdiutil verify VALID。
- 本地 ad-hoc 签名，codesign deep strict 验证通过；未公证。
- 已安装 `/Applications/CreatorOS.app` 并启动 PID 12464；二进制 SHA-256 `d7078bd3dd1e7a6895c9a6213a37493a20f191769f3d4f11a4e1515c85c92b82`。实际安装日志 2026-09-11T16:34:53Z 显示 `SIDECAR_STARTUP_VERIFIED`。
- 安装前完整备份：`~/.creatoros/backups/t956-20260911/app-data`，1806 个数据库文件哈希全部一致。
- 全局 reconcile 仍为旧有 233 errors、boundary 7 条，保留 T-916 欠债；不声称全局通过。

## 尚未完成

原作品真实重试和结果读回尚未发生。新应用启动初次 CLI 返回 CONNECTION_NOT_FOUND，已请用户在设置开启本次访问。原失败 project `project-185382ce-364`、publication `pub-185382ce-379`、video `7682655847549308169`，唯一账号 `acct-ae1a8346-9`。恢复应沿 public analytics.traffic.refresh/get 核验；不得凭提交成功或隔离测试标记任务完成。
