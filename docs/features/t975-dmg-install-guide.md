# T-975 恢复正式 Mac 安装引导

用户反馈1.2正式DMG打开后无背景/拖动引导。恢复已有设计，不改产品架构、业务数据和签名标准。

## 证据与范围
实测挂载6147d380正式DMG：背景PNG存在，但根目录无.DS_Store；Finder全局AppleShowAllFiles=1解释隐藏文件可见，不能解释背景缺失。Tauri macOS dmg源码在CI=true时默认--skip-jenkins，跳过Finder布局写入。

## 实现与验收
在Mac Tauri构建子进程启用官方TAURI_BUNDLER_DMG_IGNORE_CI=true；保留CI其他含义。不改用户Finder全局偏好。先用小型DMG验证CI布局路径与背景资源，再验收正式包。独立检查安装盘布局元数据和Applications链接，不能只凭配置文件通过。现有公证、真启动标准保持。禁止把根目录布局文件当运行时垃圾删除。

源码→Tauri启用Finder布局→DMG背景与图标位置→公证→挂载校验。

未完成重打和挂载前不声称已交付修正版。

## 本地证据
新增CI开关回归实测先失败后通过，5个打包相关测试文件46项通过。临时小型DMG在CI=true、执行Finder布局路径下实测生成10244字节.DS_Store；元数据包含800×500窗口、backgroundImageAlias和图标布局；Applications为链接。不是正式应用重打验收。
修复通过Tauri官方TAURI_BUNDLER_DMG_IGNORE_CI开关实现。CI挂载后报告布局资源状态，安装引导缺失不反杀可安装应用，仅明确告警。
