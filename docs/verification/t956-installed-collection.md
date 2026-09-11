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

## 安装版真实数据核验

用户确认访问自动开启，重查 CLI connected/full，PID 12464。此前 CONNECTION_NOT_FOUND 出现在启动尚未就绪时，不能据此认定需要重新授权。

通过公开 `analytics.traffic.get` 读回原失败 project `project-185382ce-364`、publication `pub-185382ce-379`、video `7682655847549308169`，账号 `acct-ae1a8346-9`。状态 succeeded，error null，capturedAt `2026-09-11T16:54:32.073Z`，complete true；推荐页 85.8%、搜索 7.4%、朋友页 1.8%、其他 1.2%、消息页 1.1%、个人主页 1.1%、关注页 1%。没有重复提交该成功任务。

批量读取当前项目样本得到 succeeded 32、pending 28、failed 9（同一读取期间队列持续变化，只是快照，不是整批最终统计）。实际任务 `ai-task-9cd24147-412` 及 execution `exec_292aa390-cc96-4ee8-9833-4b5032c80be5` 均 running；run `run-142372dd-6878-4a0e-8016-b37b7cbd3d0c` 进度持续前进，证明启动阻断已解除，但整批尚未终态，T-956 保持开放。

失败样本 video `7648622692182134016` 在真实抖音网页流量分析 tab selected=true、tables=0，只有内容吸引力和观众参与度；未给流量来源表。不能编来源比例，也不能仅凭这个样本推断固定日期限制。当前等待表 15s 超时信息仍需改善；另一个失败为 BrowserProfileBusyError，运行投影还保留不准确的“模型阶段已挂起”旧文字。记录为后续体验/稳定性改进，未宣称整批全成功。Ego TaskSpace 14 已关闭。
