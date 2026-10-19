# T1174 核对本轮随包浏览器检查选择了缺失的headless shell

用户要求有问题立即建task及时修复。本地d414包实际已完成，DMG完整性、深度签名、字节闭包和原泄漏扫描通过。随后原smoke函数在根私有驱动中使用随包Node并将PLAYWRIGHT_BROWSERS_PATH指向随包资源，实际25.805秒exit1：默认无channel的chromium.launch寻找不存在的chromium_headless_shell-1223。该次服务已有真实SIDECAR_STARTUP_VERIFIED及HTTP进展，不能称App启动超时，也不能称浏览器/本轮完整启动已通过。

阶段4-build诊断维护，退出打包冻结后依用户既有修复授权处理；先保原日志与收据、只读核随包目录、SDK和真实生产消费者。不先假定漏带媒体浏览器，不下载新浏览器或改包/生产代码/原smoke断言。不备份用户App/库，不启动真实profile或触发微信第三实验。

若真实消费者需要缺失的shell，另精确产品SPEC独立评审再修；若仅根驱动误把默认headless-shell检查当随包full Chromium验证，则只校正私有验证上下文：保原失败，原smoke按其原语义实测，随包full Chromium用实际公开SDK选择与原页面SSR/hydration断言补验。不得用宿主Chrome冒称随包浏览器、mock启动或略掉pageerror/非200断言。提供master key等宿主注入使用新随机隔离值，不读取真实用户密钥。

验收只签根检查上下文与随包浏览器事实，源码和最终DMG保持d414字节；真实安装/激活用户主页、模型、采集与全功能不在该补证范围。原失败不能改签PASS；本轮新结果另存，原T1159限制和40项全局失败保留。

```mermaid
flowchart LR
 A[原检查实际失败] --> B[核真实随包资源和消费者]
 B --> C[保原失败校正验证上下文]
 C --> D[随包Node与浏览器实际补验]
```
