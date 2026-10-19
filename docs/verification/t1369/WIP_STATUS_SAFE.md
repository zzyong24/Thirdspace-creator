# T1369 诊断 WIP：未完成，production04未执行

首页平台筛选后侧栏卡死的用户问题仍未定位，产品源未改，不签修复/任务完成。

- 原natural01：真实Next私有合成链正常窗口通过，仅是有限输入GREEN。
- 原response02：首次首页document120s失败，受控链未进入；旧finally等待执行上下文后由已核owned runner SIGINT清理。原FAIL/interrupt留存。
- DEC136903补充response03：首页真实全文预热在600000.56ms绝对期限失败，仍未进入受控链；新清理正常context close、observer结束、pending0、端口空。自有Next5s采样主要事件等待，PG当时11idle，无锁等待；这些不能指定首因。
- 安装版唯一公开XHS/all/douyin/wechatVideo查询在各自样本约0.99/1.44/0.71/1.00s完整解析；只证明这些时点公共service读取快，不证明首页RSC/浏览器连接池/队列无障碍。旧XHS900s外层短于CLI原长观察的限度已另报，实际快读事实保留。
- 安装独立Chromium公开UI观察在账号选择前被本机应用guard快速403。原“pending”误读已撤回并保更正，不能代导航RED；没有注入握手/读安装凭据/寻找SSR替代路径。
- production01：长119B临时Unix socket路径EINVAL，5.16s夹具前置FAIL；02：短路径同原SBPL tsx IPC listen EPERM，422ms前置FAIL；03：真实TS loader通过，但原宿主/bin/ps setuid执行在sandbox内spawn EPERM，5.15s前置FAIL。三者均未build/seed/sign/start/UI。
- production03原wrapper如实留私有PG24400；随后已核本轮owner/root/UID/pgdata/postmasterPID和真实ps，并由原pg_ctl正常142.422ms停止。原残留与后置真实清理分证保留，当前端口空。

production04候选静态已完成：原host/PG/seed仅作为外层合成fixture装配，保原ps/nonce/root/UID/监听/本轮spawn祖先核验；标准build/Next/browser仍原SBPL。普通web生产拓扑、正式新随机build_smoke准入与原门不改；seed/start/authready同600s、SDK test9360/core120、外18840含真实720s清理/120s交接。原harness/seed与两生产源未改。该候选不再声称fixture全栈sandbox。

静态证据：frontend tsc实际exit0/45.09s，ESLint实际exit0，Node --check/Python compile实际exit0；独立静态审已核最终字节无阻断。此意见不是正式新cycle收据、不是执行授权。当前正式R3收据只绑定旧6f8114 SPEC；新候选及夹具边界待用户精确单次newcycle授权和正式流程。production04无host/build/seed/token/Next/browser执行，也没有04产物目录。

本次仅交WIP测试/驱动/安全报告。可Git白名单及SHA见WIP_FILE_MANIFEST_SAFE.json；用户原响应/截图/浏览器trace/OS sample/Next raw trace/身份正文/令牌与密钥/安装observer脚本/私有数据库与依赖缓存一律排除。所有原始证据留原本机私有目录/本树ignored证据，不泛清理、不中断实际App。
