# T1369 production：原合成夹具由外层承担的最窄边界修订

本次仅收敛已观察到的夹具/OS边界，不改变产品源、准入门、真实导航时序或原失败。01为119B Unix路径EINVAL；02为短路径Unix IPC EPERM；03 loader成功后原宿主/bin/ps spawn EPERM，wrapper最初留PG24400，随后原root/UID/pgdata/PID核验及pg_ctl正常142.422ms清理已单独保全。前三次均未到build/seed/sign/start/UI，不能记产品RED/GREEN，也不反复追加前置探针碰运气。

## 确切原因与源码边界

`/bin/ps`实际`-rwsr-xr-x root:wheel`，Apple签名Identifier=com.apple.ps。原SBPL无process-exec显式deny，但原sandbox内spawn它返回EPERM，外层正常ps核验同一owned PG成功；这与macOS对setuid程序的sandbox执行限制一致。未新增纯allow-default探针对照，不冒称拿到内核内部拒绝原因。不能新增Unix/外网允许、复制/strip ps、改系统文件、钩子伪造进程信息或删身份门。

原T1355宿主44–48/56在启动与清理均以postmaster.pid+pgdata/port/127.0.0.1以及真实ps命令核PG。原T1356 seed19–33还核ready/owner/root/nonce/UID、唯一127.0.0.1 fixture role/database及PG/helper真实ps，然后36才建私有DB连接。故只将host移外层而seed留sandbox仍必撞同门。

seed47仅装静态合成capability sourceAdapters，55–59以start/claim/commitPage完成合成采集事实写入；这些不是访问真实平台的采集驱动。legacy Imported方法只写私有合成工程/发布事实，不执行真实发布。全seed无fetch/模型/外部worker。原host未装collect/onBound/外部适配器；其空binding drain定时器真实存在，不声称完全无循环，需以实际runIds/stage为空核无登录触发。

## 最窄拓扑与身份验证

外层owned驱动（最小env、全新0700 root、固定私有PG/host端口）正常启动原T1355 host/PG，原源码与ps门不改；标准Node `--import tsx`入口保留。之后顺序：

1. 外层host启动/health完整读取/身份验证，原300s绝对槽。
2. 原SBPL下完整`pnpm --dir frontend build`，原7200s槽，所有prebuild/类型/课程检查不跳过。
3. 外层执行原T1356 seed；随后原SBPL启动Next并完整auth/me准备。这三者共原600s绝对槽，seed前固定deadline，seed成功且剩余有效后才签唯一helper token并立刻spawn；不重置、不续token。
4. 原SBPL下Playwright/Chromium，原9360s test及原120s core，仍唯一normal自然平台→overview加原A-held/B-full overview/settings受控链，不新增竞争序。

PW production config移除自动webServer装配（`webServer:[]`），不设宽泛reuseExistingServer，不凭health200借任意既存host。外层在启动前核端口全空，且host是本轮实际spawn的owned后代；ready/owner必须新文件、0600/UID正确/非symlink、root和nonce一致，helper PID/PG PID与postmaster tuple对应。真实ps验证PG命令含私有pgdata、helper命令含原harness脚本名；核helper是本轮spawn后代、host监听PID=ready.helperPid且PG监听PID=ready.pgPid。测试前再核这些事实及合成auth/me user=seed.userId；任一不符原失败停止，无自动借用/重启。

build、Next、browser仍逐字原SBPL；verdict/loopback门和原build_smoke合成签名机制保持。签名seed只外层驱动内存，不进入server env/日志/Git，公钥仅本轮.next/server产物；普通web production不设置desktop或关握手flag。

**如实修订安全边界**：host/PG/seed属于外层合成fixture准备，不再宣称它们有OS禁网。它们使用全新私有数据与无真实适配器的原受控实现，最小env无真实身份/模型连接；原host只bind127.0.0.1。源审和最终state应证明没有bind/login触发、模型/实际采集/发布调用。build/Next/browser全程仍OS loopback-only。不得把这一夹具边界用于真实App/用户库，也不将其描述为“全栈sandbox”。

seed后保存host `/state`安全计数基线（runIds/stageDetails应空、aiTaskCount/scheduledJobCount为0；合成collection runs允许存在），结束前比较未新增binding/AI/schedule/collection任务，禁止读取或输出真实账号正文。host source safety fields必须表明externalHostAdaptersInstalled/collectionAdapterInstalled/onBoundInstalled为false。

## 预算与原件

原隔离本地探针360、host300、build7200、seed/start/authready600、test9360、各core120及已有更长子调用全部保留。外层现在承担显式进程清理，需完整列出：PW runner正常停止120s、Next正常停止120s、原host正常停止480s（其ownedPg ps180s与pgCommand execFile240s串行上限420s，另留60s；不以短外层误杀）。总清理720s，不能沿旧240s隐匿串行缺口。独立外层18840s，覆盖360+300+7200+600+9360+720+120调度=18660s，另留180s；不是给原失败续期，是经本边界修订批准的唯一新production04预算；最终host state读取在同一外层进入清理前，单次120s由test命令装配/结算与额外调度余量共同覆盖，不添加裸无界步骤。每阶段同原绝对deadline，任何失败终止，不自动再试。

外层资源规则仍入口8GiB、运行每5s检查低于3GiB停止owned子树；不许清用户cache。自有.next/dev trace副本已核原sha，只有必要才按原精确缓存规则回收。旧所有原件与源码快照保持，03原wrapper残留与后置清理分证不覆盖。

新增/窄改仅原production测试驱动、env、config和verification证据（均在既有T1369写集），原host/seed文件不改。执行前静态核新控制拓扑/身份/预算，中央登记该明确夹具安全边界；无新产品许可环。没有真实可定位导航RED不改产品、不签T1369完成。
