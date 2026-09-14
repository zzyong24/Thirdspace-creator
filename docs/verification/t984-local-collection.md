# T-984 本地打包与真实采集验收

用户明确要求：不用扩展改动范围，先本地打包实际验证。候选固定662641110e8563f6f976d573b464287c5aa5e947，沿用1.2.0。采用独立干净worktree、官方desktop:package-local入口；只做打包基本预检、安装包校验、备份、安装启动及本机真实采集验证，不改产品、测试、workflow或恢复架构，不触发GitHub/公开发布。

验收以真实四类作业、原任务状态、采集结果回读和日志为准。先读取原安装版可用性与账号；安装前正常退出并备份既有本地数据。新版验证任务拆分、作品采集、流量来源、评论、封面补全和原任务恢复；不清理或绕过未知占用，不以提交成功/排队代替成功结果。真实平台冷却、登录失效、权限不足等记录原始原因。

流水线或实测失败停止该失败步骤并留证，不在打包期修改实现。当前机器只能证明本地macOS结果，不能冒充Windows真机验证。T983未解决机制缺口用实际复现结果解释，不把理论缺口直接当作本机失败原因。

## 本轮已执行证据

- 独立冻结工作区：`/Users/zyongzhu/Workbase/Thirdspace-creator-t984-package`；HEAD `662641110e8563f6f976d573b464287c5aa5e947`。构建前工作树干净，`git diff --check`通过，四处版本均为`1.2.0`。
- 四个官方打包预检文件：42/42通过，日志`/tmp/t984-package-preflight.log`。
- 旧应用与现有数据已在应用未运行时完成APFS克隆备份：`~/.creatoros/backups/t984-20260914/CreatorOS.app`与`app-data`。未读取或修改业务库。
- 官方本地入口：`CREATOROS_LOCAL_SKIP_INSTALL=1 pnpm -C frontend desktop:package-local`，日志`/tmp/t984-package.log`。先产包校验，再调用现有安装函数。
- 生产sidecar冒烟已通过：ready、首页HTTP 200、浏览器初始化通过。此证据不等于真实平台采集成功；真实采集仍待安装后验收。

## 本地安装结果

- 官方打包命令退出0，构建后独立工作区仍干净。
- 产物：`/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg`，446932441字节。SHA-256：`d2b5a31c2e655bee24dc1f20596e23f5dd8a40a1133d2f01534c060645c486c9`。
- `hdiutil verify`：VALID。`codesign --verify --deep --strict`构建应用通过。本地ad-hoc签名，未公证，未创建更新制品，未公开发布。
- 调用仓库现有`installAndLaunchLocalMacApp`安装至`/Applications/CreatorOS.app`，返回进程41438。安装二进制与构建二进制SHA-256一致：`d657b37a71d1ef21caf6b9cb0cf777ac2e604e72cf3a9321f4ef2579e8d6ef1d`。
- 安装后`creatoros status`与`creatoros access status`均返回`CONNECTION_NOT_FOUND`，已请求用户在设置开启本次CLI访问。在访问开启前停止业务调用，没有查询数据库或绕过公开CLI。
- 真实采集尚未验收，不能据此宣称T983问题根治。

## 安装版真实回读：验收失败

用户反馈CLI自动开启、内容补全成功但封面仍缺失、作品数据同步一直转圈。本轮`status`与`access status`均返回`ok:true`、`full`，安装进程仍为41438；上一轮启动初期CONNECTION_NOT_FOUND不能推断必须手动授权。恢复T984验收，未修改产品代码。

### 封面补全存在漏检

- 唯一账号`acct-ae1a8346-9`（月明水清深）；公开CLI读取四类独立计划，拆分计划已存在。
- 用户刚运行的内容补全：`run-3c592a9f-6422-4ce5-a270-19b16dcc9d6c`、`ai-task-b259832d-200`，北京时间2026-09-15 00:42:59至00:43:35，状态succeeded，新增0、更新0。
- 日志原文：`[douyin-cover-backfill] 开始回填:候选 0 条缺封面作品`。步骤回读：`新增 0 条,更新 0 条(封面与内容补全本批已处理)`。
- 通过公开`pages.projectOverview.get`与`assets.get`确认封面素材记录存在；通过`assets.downloadUrl`返回的公开签名下载地址进行读取（未保存或记录签名token）：

|封面素材|结果|
|---|---|
|asset-ae1a8346-1143|HTTP404，not found|
|asset-2566ac81-4657|HTTP404，not found|
|asset-ae1a8346-1148|HTTP404，not found|
|asset-ed64285a-370|HTTP200，28351字节|
|asset-ed64285a-356|HTTP200，30351字节|

结论：已复现旧封面有记录但图片不可用；现有补全未覆盖这些情况。没有据此推断所有旧封面都丢失，也没有证据证明文件在哪次升级丢失。后续原T983范围内修复需把缺文件/不可用封面计入补全，不以记录存在作为成功验收；真实图片回读通过才算修复。

### 旧合并任务仍在续跑并展示抓取中

- 截图对应`run-74f651d6-15b8-409e-8e88-3e329a91db7b`，原任务`ai-task-82697853-2893`，请求时间2026-09-14T14:31:30Z早于新包启动16:40:21Z。冻结inputData仍含旧`operationsSync`全部四类能力，jobRun显示running，AI任务为queued。
- 另一个旧任务`ai-task-6fa4a22b-68`、`run-b1a3b072-94c1-4302-8723-264f4b9bdae7`始于2026-09-13；仍为running。两个旧run的fetch进度updatedAt持续刷新，步骤仍是历史部分失败记录，不能当作真实采集前进。
- 安装版日志16:42、16:45、16:52仍报`BrowserProfileBusyError/BROWSER_PROFILE_BUSY`。本轮公开`ingestion.douyin.status`实测HTTP400，消息为浏览器登录档案仍被其他操作占用。
- 已确认浏览器占用错误仍在；尚未证明具体占用所有者是活动浏览器还是旧租约，不能擅自删锁或终止未知进程。未重复提交原任务。

### 范围与结论

本地安装与启动通过，真实采集验收失败。保留当前原任务、已有数据与日志；未修改代码，未新增重试，未发布。T983继续保持未完成，T984记录本次失败，不能把包可启动写成问题根治。原始CLI回执位于`/tmp/t984-*.json`，本轮解密日志位于权限0700目录`/tmp/t984-live-logs`，不入库完整日志或签名下载地址。

## T985修复后的最终本地复验

用户授权T985修复后，以b3fc63ae重新冻结打包安装，版本仍1.2.0。原封面任务成功补回61张，最初三个404样本实际打开验证通过，原转圈任务已恢复执行并到终态。完整安装、备份、校验与真实回读证据见[t985-local-collection.md](t985-local-collection.md)。此前失败记录保留，不回写为当时已通过；T983仍有37条流量详情页面等待超时需定位，不能宣称四类采集全量根治。
