# macOS Appium 原生自动化探测

日期：2026-10-11（Asia/Shanghai）

## 环境与范围

- 已安装客户端：`/Applications/CreatorOS.app`，bundle ID `cloud.aitongban.creatoros`；探测仅尝试连接当前运行实例，不重新启动或关闭客户端。
- Appium 3.8.0 与 mac2 driver 4.3.6 安装在临时目录 `/tmp/t1207-appium`，未加入项目依赖。
- Xcode 26.6、`xcodebuild` 和 `ffmpeg` 可用；`appium driver doctor mac2` 无必需修复项，提示 Automation Mode 需要用户认证。
- Appium capabilities 包含 `noReset=true`、`skipAppKill=true`；没有执行页面操作、读页面树、截图、写入、扫码、采集、发布或付费生成。

## 实测结果

Appium server 已在 `127.0.0.1:4723` 启动并加载 mac2 driver。两次原生 session 都未能建立：`xcodebuild` 成功构建了 `WebDriverAgentRunner`，但 XCTest 的 session 初始化报告：

> The test runner failed to initialize for UI testing. (Underlying Error: Timed out while enabling automation mode.)

`xcresulttool` 从两份 WebDriverAgentRunner `.xcresult` 记录到 1 个失败、0 个通过。Appium 因 WDA 没有监听 `127.0.0.1:10100` 返回 500。当前结论为原生 App 未验收；没有截图或可通过证据。

## 解锁条件

macOS 的 Automation Mode 需要用户认证。待用户在系统界面完成正常授权后，可用同一临时 Appium 运行时重新建 session，再只读采集元素树和逐页截图。没有运行 `automationmodetool enable-automationmode-without-authentication`，也没有通过 TCC 数据库绕开系统确认。
