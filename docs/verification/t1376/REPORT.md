# T1376 本地安装交付记录

## 当前实际交付（2026-10-20）

用户明确回答“现在退出并重装，允许中断任务”，已记DEC-137602并由taskctl正式resume。安装源是干净已提交的`dedc4b367016c719bbcd0b513a53a65be544ac0e`；原0b四门44PASS/1FAIL保留，独立T1377修正39PASS/独审后，新四门58PASS/4文件，固定skip-install产包exit0/454.197秒。

DMG：`/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg`，SHA256 `7a0aa554bbfdfc43cf1afe2bee375ff4f22f755a9250c3bc44393e3c62a8e88b`。hdiutil、App与DMG内App的deep/strict签名、全树同源均通过。包为本地ad-hoc，不是Apple公证或双平台发布；BUILD_ONLY额外smoke/TLS/硬化没有运行。[产包安全证据](PACKAGING_VERIFICATION_SAFE.json)

正常quit实际exit0，fresh旧PID55420及4个owned进程结束；未pkill/强杀/逐任务取消、重发、恢复或改期限。旧App完整备份在`/Applications/.CreatorOS.app.t1376-backup-548d38217296`，旧树精确保留；同卷rename将新版置于`/Applications/CreatorOS.app`并open exit0。安装器只操作App，没有删除或清空Application Support、auth、账号、媒体、profile或Keychain。

新主PID22213、owned Next PID22560，版本1.2.0；实际tar/stamp和37,660项canonical文件/类型/链接均同本次包，0缺失/额外/失配。公开Ready在UTC03:02:15.075至03:04:17.601（本地11:02:15至11:04:17）连续122.526秒、7点exit0/connected，同PID与runtime归属稳定。初始取证脚本错误假定comm不变的FAIL保留；只修观察脚本归属，不改产品或重启App。[安装安全证据](INSTALLATION_SAFE.json)

安装后5组可读、用户账号登记7行可读，各组项目数据入口只读单页均exit0；这些返回证明现有读取可用，不是全库字节对账或原业务任务自动恢复验收。[公开读取安全证据](PUBLIC_DATA_AVAILABILITY_SAFE.json)

本次已实际交付源码，T1374原“旧安装未交付”这一条件已消除，但视频号原采集失败/无原生报表/site-safety限制仍未恢复；T1369连续导航仍未验证修复。原业务任务已按用户授权允许中断，自动恢复未验证。native像素不可用，未用浏览器代签。完整reconcile因T1373既有安全预检阻断未运行，不能称全局全绿。

## 首轮失败与授权历史（保留当时事实）

当前主代码0b823在干净T7/APFS隔离树完成四版本1.2.0和来源预检、独立依赖闭包准备。四基本测试实际44通过/1失败（4文件中3通过/1失败），exit1/10.144秒。原日志仅私有保留，命令/退出/hash见[PREFLIGHT_FAILURE_SAFE.json](PREFLIGHT_FAILURE_SAFE.json)。

失败是原T1063测试对整个workflow禁止timeout-minutes，当前独立T247 relay任务依法有150分钟串行预算；普通build job本身没有新增总timeout。未把这个FAIL当安装已执行，也未删断言/改脚本/重跑洗绿。

按项目packaging技能“预检失败即停止”，本轮package-local尚未启动；旧App未退出、未替换，用户数据未由本任务操作。原App继续处理既有任务。独立修复由Root裁定，本任务不冒产包或安装PASS，不触发T1373危险full。

正式taskctl block已实际exit0写事件，T1376⏸️。独立T1377仅📋待授权单文件草案，尚未开始代码/测试。Root已向用户提出唯一修正许可问题，本执行者不重复询问或默认许可。

用户已明确“允许修正并继续安装”，T1377单文件修正39PASS且独审GO/提交8062921/taskctl完成，T1376正式resume exit0。原冻结0b首轮FAIL保留；本次承接新已提交候选（仅测试及控制文书变，原产品/入口不变）重跑四基本门后再固定产包/安装。
