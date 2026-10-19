# T1365 视频号导航诊断候选的本机交付结果

新候选2d已实际构建、安装并完成精确清旧。T1365交付完成；T1364的真实单次只读导航另行执行，结果尚待Root实际看两图与判断，不能以本报告签导航成功、根因已定或视频号采集恢复。

```mermaid
flowchart LR
 A[受控工程门与独审] --> B[exact2d固定产包]
 B --> C[正式App同源与连续120秒]
 C --> D[14项精确清旧完成]
 D --> E[Root另放行一次只读导航]
 E --> F[T1364仍待真实证据判断]
```

## 实际来源与产物

本次安装源码是`2d3826ef164241860437daa393d336d9b042f980`；此前666c2a930及本报告后续提交均为文书，不是安装source。独立T7干净候选按既有本机授权运行唯一固定入口`CREATOROS_LOCAL_SKIP_INSTALL=1 pnpm -C frontend desktop:package-local`，四基本测试4文件45PASS，构建396.891秒、exit0、无超时。未在打包阶段改产品或断言，不并发Next/大门，不外发。

|对象|实际路径或SHA256|
|---|---|
|正式App|`/Applications/CreatorOS.app`，安装观察PID47707|
|主程序|`dd3c655a79b09c5fec4e776c6ee3dfa600e934210abb1159ce1671d8ca70a807`|
|sidecar tar|`1ab286281bd1f97ae192cbd1d55605db807dd243da14d9018745725ce7d99f85`|
|DMG|`/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg`|
|DMG SHA256|`8f8265111a3d719a50889a8725b65e4c33f56b78033f4758765fc68b1c5a8cb6`|

产物attestation/版本、主程序嵌入tar hash、只读DMG树与codesign/hdiutil实际核验通过。签名为本地ad-hoc，未Apple公证，没有tag/Release/push/公开分发。T1359旧e676交付原件和旧false快照均保留，不能改成这次2d通过。

## 安装、观察与公开回读

产物核验后fresh检查活动并正常退出旧App，同卷暂存备份替换，无force signal；原子替换及公开目标账号归属有原件。无原生dirty接口，不虚称已证明没有未保存；没有强退/点丢弃。旧e676 scheduled.comments在安装前自然failed是独立旧历史，不记新包回归、也不作新包测试或推断因果。

本次startup从open起算125.669秒；另完整连续120.430秒/25点观察确认同PID/runtime稳定，两种计时分别保留。旧helper说明121.597秒是旧模板文案，原件不改，本轮不用该文案代替实际数值。运行目录canonical核31851文件/746链接/5059目录，missing、字节/链接及类型差异均0；正确保留隐藏文件名前导点，不拿旧核验helper错误当生产采集器修复。

安装后公开目标视频号accounts.get成功、同组4成员可读，XHS/KS/DY原目录与抽样指标有实际只读回执；精确字段沿FINAL_DELIVERY_RESULT.json，不冒全部页面或新采集完成。CLI没有暴露原始HTTP状态数字，不写HTTP200。原公众号1726仍failed/accountId=null，未真人完成新绑定。native pixels不可用，不能以浏览器镜像冒新App像素/交互验收。安装PID是该观察时点事实；后续T1364授权配置重启的PID与结果单独记录。

## 精确清旧与原件保护

交付完成安全快照时间为2026-10-19T00:52:43.698390Z。Root核准14路径实际清理完成，两份独有trace先私有原字节保护，核准保护root保留，正式App及新DMG身份不变；用户Library数据/auth/profile/runtime未删除。du归属6360036KiB；df并发快照内部+891764736B、T7+3275837440B，不将du或df差值冒精确归因释放量。未扩大清理集合，也未用删除一次准入标记制造新的诊断额度。

## 诊断与全局结果分证

Root在交付完成后另授权T1364同2d/config一次/组`grp_legacy_acct-ae1a8346-9`/账号`acct-0d742f83-1558`的真实只读导航，外层8400000ms、backend2580000ms，同key不重POST，实际停止后恢复默认off。它不是collect，不属于T1365安装清旧的新动作。本报告不读取/复制key，也不预签已得图、physical close、DB lease release、off恢复或根因；T1364继续进行中，Root实际看图后决定。

安装完成快照中的realDiagnosisSeparateNotYetSent=true仅属于该时点，原件不回写；后续真实授权与结果另文件承接。原281/1499/1502、公众号1726和旧失败均不因本机安装通过而改成恢复。

候选2d唯一完整reconcile真实56ERROR/0WARN、1300.595秒，分类/原火与两单门后验分证沿T1364 control/RECONCILE_SCOPE_CLASSIFICATION。Root据当前能力工程门/独审及实际交付闭包放行，不称全局通过，不重跑full或旧UI洗绿。T1366两新宽收据及旧身份追加交叉待审，foreign9/T1255保留。

最终证据根为`/Volumes/T7-MacData/CodexBuilds/t1365-final-20261019-2d3826ef1642/checks`，交付完成原件为DELIVERY_INSTALL_COMPLETE_SAFE.json。仅对明确白名单字段生成FINAL_DELIVERY_RESULT.json；输入路径/SHA见FINAL_SAFE_WHITELIST.json，不整读或提交含key的旧整份SAFE_SUMMARY、raw日志、配置/env或私有图。
