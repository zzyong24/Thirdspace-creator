# T1194 当前新包安装与旧测试制品清理

2026-10-10按用户本轮明确授权完成：替换 `/Applications/CreatorOS.app`，启动当前本地1.2.0新包；删除两个旧包装空目录，保留当前新DMG。没有额外构建、App/数据备份或公开发布。原账号、项目、素材、激活、诊断、验收证据、Git源码与其它会话进程未执行删除或业务修改。

## 安装及当前包

- 新包 `/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg`，841223134字节，SHA-256 `d91079d6542407a6f5c3232f35cd815cfaff259c51fa9e40e5ccf030eb10a1d1`。
- 产品代码源 `4b10e89e226cd16ed12744d6c885931d3a09f0dd`；本轮安装前main HEAD f2d97aea仅后续证据提交。新App与DMG一致性由上一轮当场镜像验证和本轮安装前后双SHA校验共同证明，未把同版本号当内容一致。
- 已安装主程序SHA `6660986e09570348f8b5cf87e0f3385a5c922636c5742780fbf83be65d53f6bf`；运行包SHA `23e72d02e3ff2c2a00a74801b00e8a375d5689e19517bccaabcc9d637b44da1f`。
- 旧App主程序SHA acfec3e9… /运行包8288886e…，已在新App完整暂存验证后替换。安装前原生客户端没有运行；没有退出其它会话的CLI/MCP。`ditto`、暂存及安装后的deep/strict签名检查、`open`均exit0，安装收据5.049880秒exit0。详见 [安装记录](installation.json)、[原始收据](install-run.json) 与 [实际驱动](install.py)。本地ad-hoc，未Apple公证。

## 真启动核验

本轮实际原生主进程46836，路径 `/Applications/CreatorOS.app/Contents/MacOS/CreatorOS`；直属服务47036监听127.0.0.1:57122。公开CLI `status` 返回installed/connected=true/access=full，产品creatoros、包cloud.aitongban.creatoros。版本/help/access/operations读取成功，无显式模型调用或业务写入。运行时真实stamp与新运行包SHA完全相同。

原生日志真实记录 `SIDECAR_STARTUP_VERIFIED` 和 `MAIN_PAGE_LOAD_FINISHED http://127.0.0.1:57122/`。只签本地服务就绪及原生HTTP首页加载完成，没有原生屏幕眼验、各功能验收或全功能PASS。不会把 `tauri://localhost` 启动页完成当作首页。

首私有探针错误把公开status主PID当服务PID，15.006404秒exit1；原 [失败收据](startup-run.json)、[失败日志](startup-run.log) 与驱动保留，归T1195。校准后按真实主PID、直属HTTP监听、HTTP首页事件和运行包stamp核验，1.257406秒exit0；[当场结果](startup-v2.json)、[复验收据](startup-v2-run.json) 及 [校准驱动](probe-startup-v2.py)留证，不覆写原失败。

## 清理清单

| 实际删除路径 | 内容 | 大小 |
|---|---|---:|
| `/Users/zyongzhu/Applications/CreatorOS-backups` | 只有系统 `.DS_Store`，无App备份 | 6148字节 |
| `/Users/zyongzhu/Downloads/CreatorOS-1.2.0-34935220088` | 空的旧流水线下载目录 | 0字节 |

操作前再次核修改时间及每个目录的当前内容，逐项删除文件后rmdir，两个路径均不存在。没有使用宽泛通配删除。常用Applications/Downloads/Desktop、当前验收根及各已存在worktree构建bundle范围的实际 [清单](inventory.json) 没有发现额外旧安装包或旧CreatorOS App副本；不宣称扫描整块磁盘。当前新DMG、安装App与当前同SHA构建制品保留。[实际清理结果](cleanup.json)记6148字节；替换旧App不是额外回收846MB的净空间，未虚报释放量。

## 同轮真实问题与全局界限

首页实际加载成功；配置同步仍有 `CHANNEL_RUNTIME_DIGEST_MISMATCH`、展示副本同步HTTP502、`config_sync blocked http_status=502`，登记T1196待诊断，不推断根因、不绕过验签或重置激活。自动scheduled.intelligence.sync失败归原T1098，不重发任务。必要标记随startup-v2.json保留，完整原生诊断只留私有目录 `/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009/t1194-install`；私有日志SHA是存档时快照，App仍运行时会继续增长。

本轮只操作既有制品及记录，无产品/构建/测试代码变更。上轮完整全局对账23ERROR/1WARN、timeout-policy27项既有失败和全功能未完事实，见 [新包原始报告](../t1191/LOCAL_PACKAGE_4B10/REPORT.md)，没有重新签全绿；本次有限安装清理操作不重跑23分钟全量产品测试。T1181/T1182和微信研究暂停保留。[文件校验清单](ARTIFACT_CHECKS.json)只绑定实际已存档字节。
