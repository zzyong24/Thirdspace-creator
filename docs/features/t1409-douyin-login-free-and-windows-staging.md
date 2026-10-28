# T-1409 Windows 扫码登录目录归位与免登录主页、转写

## 用户需求（2026-10-27）

1. Windows 上 C 盘权限问题导致抖音无法登录：扫码后的临时登录目录无法转成正式账号目录。
2. 内容雷达：不登录抖音也能添加并保存博主主页。
3. 项目选题：不登录抖音也能转写作品。

## 现状与根因

- 扫码绑定先写 `<appData>/.auth/douyin/_staging-<token>`，身份确认后 `rename` 到 `<accountId>`。Windows 上刚退出的 Chromium 子进程、杀毒或索引服务会短暂持有 profile 内文件句柄，目录 `rename` 返回 `EPERM/EACCES/EBUSY`；原实现只对跨卷 `EXDEV` 回退复制，其余错误直接让整次绑定失败。
- 博主主页来源的契约要求 `collectorAccountId`，添加前必须用登录账号预览；未登录时无法保存。抖音对游客可返回主页身份，但不返回作品列表，作品同步仍需登录。
- 转写首选 iesdouyin 分享页，但该页对游客已不再下发 `videoInfoRes`，于是总是回落到需要登录 Cookie 的详情路径，未登录即报 `TRANSCRIBE_LOGIN_REQUIRED`。实测游客打开 `www.douyin.com/video/<id>` 时，页面自身会请求带签名的 `aweme/v1/web/aweme/detail/` 并返回可下载的播放地址。

## 实施范围

### 1. 登录目录归位

- `douyin-auth-staging.ts` 所有目录搬移统一经 `moveDirectory`：`rename` 遇 `EPERM/EACCES/EBUSY/ENOTEMPTY` 按 100ms→3s 退避重试（约 10s）；仍失败或 `EXDEV` 时复制后删源。
- 复制跳过 Chromium 运行期锁文件（`lockfile`、`Singleton*`）；复制中途失败删除半份目标，保证回滚逻辑不把残缺目录当完整登录态。源目录只剩被锁文件时不让整次登录失败。
- 删除统一带 `maxRetries/retryDelay`。回滚、备份移动、最终清理同样使用该路径；事务语义与恢复记录不变。

### 2. 免登录保存博主主页

- 契约：`creator_profile.collectorAccountId` 改为可选；`intelligence.sources.update` 新增可选 `collectorAccountId`，只用于给未关联的主页补关联。
- 后端：未关联主页只接受 `douyin.com/user/<sec_uid>` 且与 `externalAccountId` 一致；`externalKey=profile:unbound:<sec_uid>`、不写 `browserSessionRef`、不发起首次同步。手动同步与执行输入读取给出“先登录并关联账号”的校验错误；每日计划跳过未关联主页，并把 `nextRunAt` 推后一个周期，避免这些主页占住每批名额。补关联要求账号可用、只能从未关联变为关联，同账号已有同一主页时返回冲突，不制造重复来源。
- 前端：添加来源对话框在博主主页下提供“直接保存主页（登录后再同步）”，本地解析完整主页链接（短链仍需登录预览）；无账号时下拉显示“可先保存主页”。未关联时说明写明不会立刻同步。来源行显示“待登录 / 未关联抖音账号，登录后可同步”，按钮为“关联账号”，对话框列出可用账号，关联后自动同步；无账号时指向“账号管理”，不提供可点的假关联按钮。

### 3. 免登录转写

- 新增 `ai-worker/src/runtime/douyin-transcribe-anonymous.ts`：不带任何账号 profile 的无头浏览器打开作品页，截取同一作品的 detail 响应，复用 `parseAwemeDetail`。游客路径不 acquire、不上报 `creator-center`，避免验证码把账号级冷却拉起、或成功把已有冷却清掉。不覆盖 UA（UA 与内核/平台不一致时接口返回 200 空正文）。
- `transcribe-worker-source.ts` 的详情回落顺序改为：游客作品页 → 已授权登录账号详情。游客路径失败不改变原登录路径与错误码；登录详情仍走 `creator-center`。

## 不在范围

- 不放宽采集账号归属校验，不伪造账号或 Cookie；未登录仍不能同步主页作品列表。
- 不处理短链主页的免登录解析，不改变扫码窗口、账号组或激活逻辑。
- 原 PR #11 / T-1407 中未合入的 Windows 扫码补丁不在本地分支，本任务独立实现，不宣称覆盖其其他修复。

## 验收

1. `douyin-auth-staging` 真文件系统测试与注入 `EPERM/EBUSY/EACCES` 的锁定测试通过，含复制回退、锁文件跳过与回滚恢复原登录态。
2. 内容雷达服务测试覆盖：未关联保存、去重、同步/执行/计划拒绝、补关联、换绑拒绝、重复冲突；前端测试覆盖直接保存、短链拒绝、待登录行与关联对话框。
3. ai-worker 游客详情单测通过；本机对 3 个真实作品实测游客路径返回可下载 MP4（206 `video/mp4`）。
4. contract / backend / frontend / ai-worker 类型检查及相关测试通过。Windows 真机扫码归位仍需在安装包上复验，源码测试不代替真机验收。
