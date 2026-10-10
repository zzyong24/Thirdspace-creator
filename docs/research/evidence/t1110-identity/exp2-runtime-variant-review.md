# T1110 EXP2 运行版本差异与冻结意见

结论：本轮必须记为实际执行的第 2/2 次实验，使用已加载的旧仪器变体；修正后磁盘候选的静态复核不能移作本轮运行通过。身份机制仍未闭合，不得 GREEN/CLOSE，不再新增 intent 或实验。保持 `collection-db52c710-52` 与原期限，收集其自然终态和停止收据。

本审查只读源码、已有私有固定事件与收据文件；没有调用 API、操作浏览器、测试、服务或共享控制面。以下时间均为 UTC。

## 可解释本次差异的源码机制

正式 composition `getBundle():7322-7329` 将 `buildPersistence()` 的 Promise 固定在进程级 `globalThis.__creatorosPersistence`，后续 getter 返回已有 bundle。构建 bundle 时 `:4604-4607` 创建 DOM witnesses 与 `wechatSource`，`:4688` 创建捕获它们的 collector 及 `collectReports` 适配器。

因此，同进程磁盘变更或新模块编译不等于重新创建既有 bundle/闭包。旧文件事件与新 console 事件的差异有直接源码依据，不能用当前磁盘 SHA 断言该次执行采用修正代码。单独的 Next Ready/Compiled 也不能证明每个运行时实例已更新。

已读宿主记录：启动 `04:43:10.099Z`、ready `04:43:32.642Z`；修正 manifest 时间 `04:44:31.335Z`；公开 start `04:46:10.617Z`。旧文件事件在 `04:46:10.793Z` 出现 `profile-authorized-and-acquired`。它与旧适配器的 appendFile 行为吻合；修后适配器只写固定 console JSON。运行时代码精确 SHA 仍须用原启动存档/实际加载证据绑定，不能由当前文件反推内存 SHA。

## 必须分别冻结的两个版本

root 报告的已加载旧变体：

- browser research：`846c2278b53fdc17e3b43850aa5649c444f89669916577c8747918e54cf7380d`。
- composition：`7b6b7f9ad5b9a483d8d4673484dd50a5436f7b71abc585c90b84a28bf52f46bf`。
- DOM witness：`9eedfeca552e4b6d508a9c57b22e0b8e794e57230b078311029198305e5a1025`。

本次只读实际重算的事后磁盘修正变体：

- browser research：`e85b51addfd0d0b84e7d04bf23820c73107db2ae3ec504c77758db43a7b6efe7`。
- composition：`4f9601f699bd8c25b60434eb2522b9bbf53e6897bbc6a5ce6e245f6c05c13448`。
- DOM witness 同上。

旧变体仍具有上轮指出的 awaited 无 signal/end 日志、并发 void 日志和未局部保护的协议 console 风险；不能因为磁盘修正就撤回这些运行限制。但没有发现凭据/URL/正文泄露、新的 report commit 路径或 authority 绕过。旧日志不能成为任务成功门或补签机制闭合。

应保留原 manifest、修正记录、启动状态、原日志及原公开 start/get 文件，另登记 loaded/runtime variant 与 current-disk variant，注明加载确认方法和没有冷重启。若旧完整源码只能从准备脚本重建，必须标为重建并核对 SHA，不能称启动时已独立采样。不得为了补试修后仪器清 singleton、重领租约、重发本 ID 或创建第三 intent。

## 本次读取时出现的新事实

本轮公开 start 已有文件记录：`collection-db52c710-52`、generation 1、startedAt `04:46:10.617Z`、初始 queued/0 页。按原 30 分钟规则，deadline 为 `05:16:10.617Z`，不能续期。

读取期间旧固定事件文件新增了下列记录：

- `04:54:23.351Z`：readIdentity / identityFields / IDENTITY_MISSING / WechatBrowserSourceError。
- `04:54:23.413Z`：physicalStopConfirmed。
- `04:54:23.524Z`：identityRejected。

已观察文件为 4 行、710 bytes，SHA `d1be8aa50e85bcb26c62f7869f65f7fabe9b3d83bcc77836d531ce7dc6bbef38`。旧适配器只在原 `options.onStopped()` 成功返回后记录 physicalStopConfirmed，这提供了本轮停止回调返回后的实际标记；其时间是记录时间，不能替代独立 DB/公开终态、OS 清理或正式停止审计的全部证明。旧异步记录的文件顺序也不能机械当作所有事件的严格因果顺序。

这些事实能定位本轮最终拒绝在身份字段段，没有 healthy/activeStop 记录；尚不能解释字段缺失的 DOM/SDK/导航根因，也不能签原 62/83 原因或 Cookie 失效。480000 字段观察预算是源码上限；仅凭当时 running 近七分钟不能断言实时正在该观察阶段。

本审查读到的最新公开 get 文件仍是 `04:47:30.732Z` 的 running/0；没有发新请求，因此不声称当前公开终态。root 应读取原 52 的自然结果和原停止证据，原 62/83 与报告 0 的历史保持不变。

## 研究卡需要据实补齐

本次读取时卡内 EXP2 仍为 PLANNED_NOT_RUN、experiments 仅 EXP1，尚未反映已发生的公共 start。这是当前待补的证据漂移：应登记本轮第 2/2 次实际实验、旧运行变体、事后磁盘修正未进入运行，以及真实终态/停止证据；不把代码修正前后的两种 SHA 合并成一个已验证版本。

两次实验已用尽。保留 researching/OPEN 和真实 UNKNOWN，不借当前磁盘静态通过、主动研究停止、正常停止标记或报告 0 签机制 validated / 产品 PASS。之后只能在既有授权范围内整理证据与等待本原任务清理，不能再用 TDD、新标签或冷启动补出第三次原生探针。
