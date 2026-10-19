# 当前本地包与安装验收

本地main源d712130f9a02887ee60c092f9263a6da56a941fe，版本1.2.0，45项基本测试PASS。固定本地入口实际409.623秒exit0，构建前后13098已跟踪文件逐字节一致。Downloads/CreatorOS-1.2.0.dmg为838211171字节，SHA256 7e0d60c1a55e3443b5903d5bc1d2d304c21dfbb9e6b74e84fd707e934d889982；hdiutil verify、App deep/strict codesign通过，镜像只读挂载核内部App的binary/resource/plist与本轮完全相同后已卸载。

安装暂存只有新构建App，没有备份旧App或库。温和退出原PID95601，替换唯一/Applications/CreatorOS.app后启动PID1909；未force kill。公开状态5次观察后connected=true，PID直接对应新安装App，CLI访问和产品身份不变，421项操作仍可发现。65项原项目/任务/会话/作品/稿件/能力/调用摘要读回数据SHA完全一致，无读回阶段写入/模型重发。

随后同一原已采纳r7粗剪执行一次真实本地导出，原任务succeeded、精确作品记录和asset/file已回读，640×360 MP4/8167ms/199098字节，工程不变，详见T1126。通用确认入口曾错误选择、409保留，正确原生入口已复验；不是产品修复。

这是macOS本机ad-hoc验收包，没有Apple公证，不代签Windows、全功能或原生页面人工眼验；用户当场页面确认尚未收到。完整对账原41债务、T1103联合候选、T1118旧日志丢失及T1124来源新功能整合仍未闭合。父T1062/T1080不因出包成功标成全部完成。

```mermaid
flowchart LR
 A[冻结已复核main] --> B[真实构建与镜像签名核验]
 B --> C[无备份安装新App]
 C --> D[公开启动及65项原数据一致]
 D --> E[同一粗剪导出成功并回读]
```
