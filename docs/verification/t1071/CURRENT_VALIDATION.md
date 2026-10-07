# T-1071 当前验证与冻结边界

四处前端修复已提交 a2b803ed。原 SPEC 与独立评审绑定不变，八个产品/测试文件与实施证据逐一 SHA256 相符。真实 RED 5 失败 → GREEN 35 通过；LED-047 162 通过、frontend typecheck 通过。真实源服务的原生剪辑工程在四 Tab 和账号页面保持同宿主/同句柄；六步 editor.get 12→0；Undo/Redo、保存与 MP4 完整解码已通过。详见 FRONTEND_IMPLEMENTATION.md、BROWSER_ACCEPTANCE.md 与独立 implementation-review.json。

完整 reconcile 实际 exit1、37错误/1告警，与82406168冻结前的 ERROR 行集合完全相同，没有新增或消失错误。原始日志与SHA保留在 reconcile.result.json；旧边界/评审/LED失败继续由 T-1018/T-1015 核因，不以局部通过代签全仓。pmem sync 实际 exit0；它与本次 reconcile 起始短暂重叠，未伪称严格顺序。

提交前 cached diff --check 曾对新增 implementation.patch 的十条统一 diff 空白上下文行报 trailing whitespace、非零；命令组合未因此阻止后续 commit。原补丁不改写，源码/测试改动的早前 diff 检查实际0，提交后工作树 diff --check 实际0。提交输出提示 PATH 中无 lefthook；不将该 hook 描述为已执行。已运行的真实测试与独评证据不依赖该 hook。

当前不完成 T-1071：安装版冻结安装/启动/逐项切页、原生200%按钮和重复同条件性能仍待实测；dev 单次六步最后一次视频353→626.7ms变慢，不能承诺每次更快或外推安装版。不会新增管理离开拦截、后台缓存、数据库或执行期限改动。

```mermaid
flowchart LR
 A[四前端修复已提交] --> B[功能与独评通过]
 B --> C[冻结并本地出包]
 C --> D[当前App安全安装重启]
 D --> E[安装版点击与功能实测]
```

## 2026-10-07 当前安装准备事实

原主App PID96089在本会话发送退出信号前已经不在场，公开CLI返回CONNECTION_STALE；没有收到用户保存状态答复，不以“继续”代签已保存。旧sidecar PID96205仍PPID1并占用数据库。SIGTERM后实际观察125秒未退出；内建Node Inspector只读探针另实际125秒未响应，OS采样物理占用14.3G且主线程停在同步WriteBuffer，不能据此断言具体写入FD或确定内存泄漏。

第一次备份被过早启动，正确exit2拒绝，未复制数据或替换安装；原只认PID48995/inode的旧观察器也已过期。独立只读核对后，私有新观察器仅机械重绑15个当前共享代码进程和原25路径的当前inode；拒绝算法及三个备份引擎原字节保留，96205及任何数据库/可写占用仍拒绝。新观察器在停机前真实exit2拒绝，保留完整原始记录。

独立停机复核后，本会话再次核实96205的UID、PPID、PGID、启动时间、exe/cwd和55382归属，只对该单PID执行既有停机兜底SIGKILL；实际进程及旧监听已消失，未向其他进程组或共享代码进程发送信号，未声称数据库已优雅flush。随后全新备份dntvfwhr的5目录、prefs、明确缺失目录和最终源/副本内容及元数据闭包，9步骤真实exit0。闭包SHA256为eede5bc74f5b6b28286c5cb344f9daf97ea1415cbf7bcc9b20fb4fcadea2743f，原失败与旧安装仍保留。完整备份不代签数据库恢复、启动或功能验收。

当前新App已暂存、全7文件与已核DMG一致，安装器修正为沿原流程不新增外层截断，并精确绑定产物核验JSON；最终安装/启动/点击证据继续记录，不完成T-1071。

## 新包已实际安装，原生点击仍待验

独立复核的0eb2f安装器已真实exit0：安装前新备份闭包、实时占用、全7文件stage镜像与签名通过，旧App改名保留，新App安装后深签名和启动请求通过。当前原生PID37432、子sidecar37873/58646；公开CLI实际connected/full、持久访问恢复。初次初始化期间两个CONNECTION_STALE保留，随后正常恢复，不把open成功单独当首页成功。

公开回读5账号组与3账号均与安装前完整数组深等。显式中性组101/项目104的video119工程revision6/editable可读，文章221/version233与图文242/version258可读；read-only preview实际8.16秒/零警告，再读工程完整深等且未改revision。原render任务100仍succeeded，关联asset144/currentFile145通过公开URL直连下载199098B，H264640×360/8.166667秒、AAC8.16秒，完整ffmpeg解码exit0。初次urllib默认opener实际502失败保留；同公开URL改为loopback直连后200，未读凭据、未伪造授权头。不代签新提交渲染或重新导出。

暖态groups list整条CLI命令5次325/284/286/287/292ms（包含CLI启动，不是界面点击或纯查询耗时）；首次5994ms保留。sidecar启动10分钟时单次OS采样footprint1.1G/peak1.8G，不外推长期泄漏已排除。

普通浏览器访问安装版业务真实403，界面显示本地应用来源限制；125000ms等待真实exit1，保留snapshot和资源状态。没有修改安全检查、Origin/授权头或读取连接凭据。TaskSpace2实际finish keep all，未新建空间规避403。当前macOS辅助功能为false、ScreenCapture preflight也为false；仅能确认PID37432的1440×900原生窗口存在，不能自动观察或点击其正文。已异步询问用户原生首页与账号管理/Tab切换事实，尚无答复。

证据索引见installed-public-readback-result.json；T-1071仍不完成，原生实际点击、同条件安装版性能、200%按钮及用户最终验收待补。T-1070字幕/变速/替换真模型与T-1062完整功能验收继续保留，不以本轮公开只读检查代签。

本轮安装与公开回读20件主体证据已由navigation_scope_review独立核SHA和实际结果，窄复核PASS，原生首页/点击/200%、新render及长期泄漏仍未签。完整私有报告SHA6fffe8a7d018ede2d351726a53fd6017b0078e323c8d7e1e2e9cee2380c3f377，索引见installed-public-readback-independent-review.json。

继续只读观察时，原生PID37432与子sidecar37873仍在，公开CLI再次connected/full。3秒OS采样真实exit0，physical footprint 1.2G、peak 1.8G，主线程可见定时回调/Promise与无符号JIT栈；不能仅据此归因某个查询或服务。125秒是采样进程执行预算，3秒是测量窗口，未新增产品执行期限。RSS与footprint不混比，不称后台空闲、长期泄漏已排除或所有切页更快。原始身份/采样/当前ps/CLI回读SHA索引见installed-runtime-observation.json；无新业务写、模型任务、应用重启或产品改动。

当前公开groups list实际5组；按这5个真实组ID显式逐一回读execution.tasks.list的running/queued，共10次全部exit0/total0。两种状态为0不证明其它状态、不可见组或后台扫描不存在；整条CLI命令313.3–813.04ms、最大并发2，不冒充界面/纯SQL计时。相关原始JSON及SHA保留在同一观察索引；后台共同慢点继续只读核因，未扩大四前端产品写集。
