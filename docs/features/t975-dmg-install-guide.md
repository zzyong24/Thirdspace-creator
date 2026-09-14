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

## 正式候选
c4b377459eed034f2980bd8310ef96eae3c7a03e；干净隔离目录四处版本1.2.0、46项预检通过。正式Mac run34806574251已确认headSha一致，待产物验收。
一次错误派发run34806550281在推送完成前读取了旧main，排队阶段取消；未作为修复证据。后续用HEAD与origin/main相等的命令条件才允许派发。不能把取消记录为成功。

正式run34806574251整体success，Mac job103859523207实测T-975布局检查通过；公证Accepted、Gatekeeper accepted、真启动通过。前置reconcile仍233项既有错误，未新增，本任务不宣称全局全绿。

## 最终验收
下载正式DMG至 /Users/zyongzhu/Downloads/CreatorOS-1.2.0-c4b37745/mac/CreatorOS_1.2.0_aarch64.dmg，SHA256 7818bd0daf298bcd7bf9c2ef59af104ecc6444635981132c84cb8f4b41e1d3c4。本机挂载校验通过、stapler validate通过。实际解析.DS_Store：窗口800×500，背景类型2/alias存在，背景图片与源文件SHA相同，App图标(225,245)、Applications(575,245)，链接指向/Applications。证据docs/research/evidence/t975/dmg-layout.json。打开修正版安装盘供用户查看，未覆盖已安装应用或更改Finder全局偏好；未发布tag/Release。
