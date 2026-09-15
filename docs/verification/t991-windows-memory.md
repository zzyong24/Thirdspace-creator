# T-991 Windows 构建内存修复验证

候选/main：`5a5f61dd5859d9e31723202954651d4a3b3849a6`，版本 1.2.0。

正式运行：[34935220088](https://github.com/zzyong24/Thirdspace-creator/actions/runs/34935220088)，Windows job104271592648，最终 success。仅一次 Windows 验证运行，未盲目重试。

## 原因与修复

旧 run34932675118 在源码编译成功后，TypeScript 检查 V8 默认约2GiB堆耗尽exit134。修复只为 Next 构建及其类型检查子进程设置有界堆预算，不跳过类型检查、不更改产品行为、不污染安装后运行时。

本次CI实际host/effective均8186MiB，old-space预算4864MiB。源码编译91秒、TypeScript58秒成功；Windows闭包实际消费者通过，随后正式打包成功。

## 验证

- 新增回归先失败（模块缺失），修复后真实Next Worker堆继承探针与闭包测试15/15；闭包全部测试32/32。
- 四项官方打包基础测试42/42，独立只读评审无阻断；建议的容器环境隔离已补。
- Windows真实安装到包含中文/空格的路径、runtime物化、实际启动和WebView首页加载、官方卸载器清理全部通过。首次启动45.35秒，超过45秒软目标、低于120秒硬门；不声称启动性能已无改进空间。
- artifact `desktop-windows-x86_64`，ID10384190665，内含 `CreatorOS_1.2.0_x64-setup.exe`。CI attestation源SHA与候选相同，预期555862213字节，SHA256 `cdd555839c8aa483760bad3dea7f13605b541c354c88c8803789513a461bccc7`。
- Windows未做Authenticode签名（沿用用户已接受状态）；updater签名已生成，不将两种签名混淆。
- pmem sync已运行，reconcile新增LED051和既有LED047/048/049/050通过；全局保留T916既有233条工件漂移，不伪称全绿，不扩大本次范围。

Mac继续使用T990 run34932675118中已通过公证、签名、安装引导与真启动的1.2.0包；Mac源SHA7e279603，Windows源SHA5a5f61dd，二者差异为本次Windows构建内存修复及文档记录，不伪称双端同SHA。

未创建tag、GitHub Release，未更改生产下载/Growth/Activity配置或公开分发。

本机下载校验完成：`/Users/zyongzhu/Downloads/CreatorOS-1.2.0-34935220088/CreatorOS_1.2.0_x64-setup.exe`，555862213字节，SHA256 `cdd555839c8aa483760bad3dea7f13605b541c354c88c8803789513a461bccc7`，与CI attestation完全一致。
