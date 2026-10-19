# T1362 同组双账号目录补充seed

顺序固定：fresh T1355 helper ready → 原T1356 seed成功 → 本脚本成功 → Next；复用同一独占PG基础设施，不另建数据库。禁止复用失败/已seed根。

命令：`pnpm -C backend exec tsx <本seed绝对路径>`，默认读取 `T1355_FIXTURE_ROOT/ready.json` 与同根 `dashboard-seed-safe.json`；支持 `--ready <root/ready.json> --manifest <root/work-entry-seed-safe.json>`。manifest强制留在同私有根。不能读取通用DATABASE_URL或用户连接配置。

检查canonical root/0600 metadata/0700根、owner nonce、精确PG PID/dataDir/listen/端口、helper PID、URL role/db/loopback与真实ensureLocalUser。要求原T1356七场景、14次完成提交、AI0，primary原XHS单成员，browseZero无Project，ready.currentGroup仍空；先独占写start，失败保记录而不重放。

追加一个真实快手账号到primary，可信合成binding授权，再分别真实collection start→claim→commit目录与指标，读回1目录、play_count=7、like_count=0/lifetime/available及实际ID。另建独立minimum纯typed组及XHS账号，分别真实提交1目录与view_count=0，不建Project/Publication。Project/Publication数量不增、所有legacy引用为null；实际计数必须18 collection/AI0。冻结helper与原seed逐字不改，原manifestSHA不变。primary原XHS筛选事实不变；新增账号使primary全平台视频累计值成为7，正式消费者不得沿用此前全平台未知的期望。

输出root/work-entry-seed-safe.json：primary.groupId/groupName/xiaohongshuAccountId/kuaishouAccountId/accountIds/catalog/metrics/expected；pureTyped复用browseZero保持兼容；pureTypedByProject按t1362-normal指原browseZero、t1362-minimum指独立新组，两个组均Project0，minimum含catalogWorkId/metricId；emptyGroup复用ready.currentGroupId；counts.before/after/expectedCollectionSubmissions=18/expectedAiTasks=0；真实operations与来源SHA。连接串仅既有私有ready内部消费，不stdout。

自验attempt01仅用41478/41479，19.30秒完成：原seed0、本seed0、helper0，collection14→16、AI0、Project2/Publication2不变；同组2成员，纯typed Project0。精确helper SIGTERM→正常私有PG stop，STOPPED.failures=[]，原根保留。没有启动Next、浏览器或外部平台/模型，没有操作用户App/业务数据。完整自验记录与私有日志路径见selftest-attempt01.json、SAFE_MANIFEST.json；这不是正式HTTP/UI通过。

自验attempt02（更新后当前源码）fresh独立根与41478/41479，20.30秒完成：原seed0、本seed0、helper0，collection14→18、AI0、Project2/Publication2不变；normal/minimum两套真实不同组、不同账号，Project均0，minimum真实view_count=0。没有重置或提交任何onboarding偏好。STOPPED.failures=[]且自有PG正常退出，未启动Next。旧16次提交的selftest-attempt01与SAFE_MANIFEST-attempt01.json、私有根/日志全保；不能用它签当前18事实。
