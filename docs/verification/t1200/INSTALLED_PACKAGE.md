# 本轮新包安装与启动验证

固定打包入口 `pnpm -C frontend desktop:package-local` 实际 exit0。冻结源码 main `582f25d6fa2a3723ca2a24079ec82330911ac165`，生产变更提交 `ff3946f5`；其后只补 Sharp 环境修复控制证据。版本四处一致为 1.2.0，工作树干净，打包基本测试四文件45例实际通过。第一次 Sharp 缺原生依赖的打包失败保持在 T1205；没有改产品或检查标准消除失败。

唯一交付 `/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg`，837995132 字节，SHA-256 `2dd2dcb2eda709822cef15d4be50e8e588d8b5d9f1f87a3795f29d91873a0e47`。hdiutil 校验通过；只读挂载镜像内 App 深签名通过，主程序、sidecar.tar.gz、Info.plist 内容与构建 App、已安装 App 逐一一致；镜像卸载 exit0。本地 ad-hoc 签名，未公证。

固定入口已直接替换 `/Applications/CreatorOS.app` 并启动，无备份。首次即刻 status 探针 CONNECTION_NOT_FOUND 原失败保留；随后 status 连接成功、公开完整访问与 operations 动态发现成功。额外正常重启后新主 PID4372、直属服务 PID4490，HTTP57024；实际日志 MAIN_PAGE_LOAD_FINISHED http://127.0.0.1:57024/，运行时 tarball stamp 与本轮包哈希一致。仅证明真实安装版进程、服务、连接与首页完成事件，不冒充原生屏幕眼验。

公开动态发现并 describe 三个 read 操作后，以真实显式组/账号回读五组。原14个定时任务全部存在，账号归属、sourceKind、schedule、target、enabled 严格未变；未新增任务。两抖音组各6个任务，两个空组0，小红书组2个共享任务；小红书作品采集资格证据 missing、平台采集可用 true，不能将“平台可用”说成真实绑定证据或已存在采集计划。无显式业务写、登录、采集或模型调用。

知识库重设计仍以本轮隔离环境三轮视觉与操作记录为证，最终评分8.7/10；新包实际知识库屏幕操作与真实200%缩放尚未签通过。T1199/T1200保持待验。全局完整reconcile原29ERROR/0WARN及旧React静态债保持，分别T1204/T1203；启动日志既有CHANNEL_RUNTIME_DIGEST_MISMATCH仍在T1196。没有用出包签全功能成功。

本记录在打包验证结束、退出冻结后追加；不修改已打包产品。无push/tag/Release或公开分发。Downloads当前仅上述CreatorOS安装包；用户资料、激活、账号、素材和日志不删除。
