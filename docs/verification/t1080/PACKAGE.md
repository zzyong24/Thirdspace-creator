# T1080 本地main安装包

本轮冻结源码main `0480ebe17717bd426e083709fc22ccbdb9eb7840`，工作树干净、版本四处1.2.0、打包基本4 suite45项通过后，固定入口`CREATOROS_LOCAL_SKIP_INSTALL=1 pnpm -C frontend desktop:package-local`实际exit0，耗时365.64秒。没有外层构建超时，没有App/用户数据备份，没有自动安装/替换/启动当前客户端，没有push/tag/Release。

唯一交付：`/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg`，840142728bytes，SHA256 `7fae2a0736891a6b6cb321cfd79966734b665821ad745baee53cc9f61df8396f`。

实际`hdiutil verify` exit0；只读挂载后镜像内App深签名exit0，CreatorOS二进制/Node外壳/sidecar.tar.gz/Info.plist四个内容SHA与构建App逐一相同，卸载镜像exit0。本地ad-hoc签名，未配Developer ID、未公证；不能描述为已公证正式包。

包内实际Node25.9.0、ffmpeg6.0、ffprobe6.0按原生启动器`lib.rs:2856-2857`的动态库路径运行均exit0。首次直接运行外层Node遗漏库路径，实际exit-6及原日志保留；随后从同一正式tar提取实际内层Node和共享库，按真实启动env验证。不是借宿主已安装工具替代包内探针，临时提取目录已清理，没有启动App或触碰真实数据。

构建成功与完整安装版功能验收分开：本轮没有替换当前客户端、未完成新包实际首页启动或逐功能安装验收。原T1062全功能验收仍保留原状态，原失败和候选不重发。全局流程收尾检查在出包后继续，不修改产品来消除原全局欠债。

出包后原转录兼容公共命令40项、原资源生命周期公共命令344项均实际通过，全部真实强断言保留、零跳过。后续仅测试/文档/控制变更，产品代码与构建0480一致；无需用新包声称安装验收已发生。完整全局对账原44错误/1告警不改签；7项整合收据归属缺口登记T1082，原短预算T1081及其它历史失败仍待闭环。
