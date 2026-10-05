# T-1028 抖音登录态公开读取长时间无返回

2026-09-30，在安装版 CLI `0.1.0`、合同 `0.4.0`、`connected=true`、`access=full` 条件下，使用明确账号 `acct-ae1a8346-9` 调用 `ingestion.douyin.status`。命令超过 40 秒没有任何结果，经 Ctrl-C 退出，未获得 `loggedIn` 或错误码；不能据此判断账号已登录或已失效。

当前源码调用链是 `ingestion.transport` → `checkDouyinStatus` → `douyinFetch.status` → `douyin-cdp.checkDouyinStatus` → `openContext` 的共享浏览器档案池。`checkDouyinStatus` 未传截止时间；档案租约、Chromium 启动、Cookie 读取或关闭任一步等待都可能导致公开读取无响应。需先用受控日志与进程状态定位实际等待点，不能仅凭调用链定因。

修复应保证一次登录态读取有明确截止时间和稳定错误码；取消要传递到浏览器借用与租约，不能损坏同账号正在进行的合法采集；其他账号读取不应被阻塞。验收包括浏览器正常、锁占用、启动失败、Cookie 读取挂起、用户中断与重试；安装版真机回读账号状态，不能只用服务 fake 证明。
