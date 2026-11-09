# 构建依赖下载恢复

用户2026-11-09明确同意新增独立构建修复：修复ffprobe下载及Windows NSIS工具准备，保留原有校验，加入备用下载与有界重试，重新制作双平台正式包并安装本机。此次授权解除packaging-creatoros-release对独立代码任务的前置限制；不在冻结的52b8c5528发布树上改代码，先在现有工程控制树实现和验收，再提交新候选。

## 问题与边界

run42567656694前两次macOS在固定b6.0的ffprobe下载返回504；Windows首次已编译原生程序，但NSIS3.11下载504。Windows后续原流程重试已通过。只读实验确认官方资源API可取回NSIS且SHA256与官方metadata、SHA1与当前tauri-cli2.11.4源码一致，ffprobe原地址完整GET与既有缓存一致。原错误记录保留在t1447验证目录，不把静态检查或旧包充当新交付。

本任务仅构建脚本，不改账号、业务页面、DB、激活、签名、公证或发布标准，不添加运行时依赖或第二套缓存。固定原仓库、版本和资产名；备用入口仍为同一GitHub release官方资源API，不切未知镜像。token只通过子进程stdin配置传入，不进入命令行、URL或日志，跨域跳转不转发凭据。

## 行为

下载使用有界连接/传输/子进程预算和有限重试；只在暂时性网络或5xx错误后请求同仓库/tag/名称的官方metadata，校验唯一资源、来源URL、长度及有提供时的摘要，再下载其官方asset API。调用方固定SHA1/SHA256必须保持；主/备路线同等校验。拒绝错误页、截断、错误资源或摘要失配，失败清理临时文件，不破坏旧缓存。ffmpeg/ffprobe原BUNDLE_SRC、缓存和尺寸/版本冒烟继续有效，覆盖原四个target映射。

Windows在原package入口、tauri build之前准备当前锁定CLI对应NSIS3.11和nsis_tauri_utils0.5.3；核对Tauri固定摘要后，在原LOCALAPPDATA/tauri/NSIS工具目录原子就绪，原bundler继续校验并打包。不新建app运行时缓存。已有可用工具优先复用；非Windows或未登记CLI版本直接交回原bundler。预备失败保留旧工具并由原bundler继续原流程，不因新增可选预备步骤反杀原可成功构建；绝不把未验证资源写成已就绪。Windows固定使用SystemRoot/System32/tar.exe，避开Git Bash PATH中的同名GNU tar；缺少系统工具时仍交回原bundler。失败只记录阶段和受控错误码，不打印下载凭据或原始网络错误。路径通过无shell argv调用系统tar，包含空格/中文/引号的目录按原样传递。

## 验收与交付

RED/GREEN覆盖原成功样例、四target缓存/显式文件、主地址网络/5xx失败后备用来源、权限/不存在不误恢复、错误资产/摘要/截断、重试预算、失败清理、凭据不出argv/日志；Windows真实ZIP/插件及目录接线，非Win/旧缓存/未知CLI与预备失败均保留原合法构建路径。运行固定四项打包基本测试、timeout-policy和diff检查；无界面变化不重做视觉方向。提交冻结后走原双平台正式workflow，核验两端安装/主页面/卸载、macOS Developer ID/公证/staple/Gatekeeper，下载并校验两包并更新本机。Windows未签名边界沿用已有确认。不创建tag、Release或改Growth/Activity。
