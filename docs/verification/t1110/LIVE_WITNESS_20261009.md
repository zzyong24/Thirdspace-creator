# 微信普通后台与五份实文件：恢复后的当场核验

用户明确答复“允许的”后，2026-10-09成功认领原Ego空间20，`taskctl resume T-1110`留下真实事件。沿既有已登录普通后台只读核查，未搬运Cookie或研究profile。本文是当前事实补充，不替换b1f0cc54时的缺失文件/控制停止记录，不宣布真人产品绑定与整体UI验收完成。

## 已取得的实际证据

公众号普通`/cgi-bin/settingpage`的当前账号信息明确显示AppID与名称。可修改的“公众号ID”不作稳定身份；固定采用当前账号设置AppID，不在以后遇到gh字段时自动换协议。本人字段SHA256为`56b7ddb9a2008cfefe09e731e8dcd3b6454a7b2636b908ff09802b05c4252952`；完整ID只在本机私人验收目录。微信支付[官方必要参数说明](https://pay.wechatpay.cn/doc/v3/partner/4013080340)说明公众平台公众号/小程序申请的AppID是唯一标识；[官方网页授权](https://developers.weixin.qq.com/doc/service/guide/h5/auth.html)另说明服务号appid唯一性。后者服务号范围不被扩写成所有公众号的API权限，本接入仍只读本人普通后台，不申请AppSecret或调用认证接口。

视频号普通`/platform`的`#finder-uid-copy.finder-uniq-id`可见文本与data-clipboard-text一致，`h2.finder-nickname`仅作展示。页面原生提示明确说明视频号ID唯一标识身份。本人字段SHA256为`24866f23b434a6cd0036756fa03e575529a50623c67b38d9e1b232fade378d75`；未使用uin、session、昵称或人工身份兜底。

五个当前原始文件均实际重新接收，公众号通过当前DOM真实原生href同会话fetch得到HTTP200，视频号监听native download并在同轮saveAs。文件只存本机私人目录，Git仅保以下安全元数据及`private-file-result-final.ndjson`。当前内容/单篇字节摘要与历史研究不同，未用旧摘要或历史结果代签。

| 原生报告 | 实际范围及含义 | 文件字节/真实解析行数 |
|---|---|---|
| 公众号内容分析 | 9月9日至10月8日，统计日期 | 45056；阅读趋势240、分享等趋势30、阅读来源60 |
| 公众号用户增长 | 9月8日至10月8日，统计日期 | 7401；31 |
| 视频号全部视频日报 | 9月9日至10月8日，统计日期 | 1100；30 |
| 视频号关注者增长 | 9月9日至10月8日，统计日期 | 998；30 |
| 视频号单篇视频 | 9月10日至10月9日，发布时间选择 | 5102；13，原生视频ID亦13个；指标累计范围仍未知 |

全部日期为2026年、Asia/Shanghai。单篇页面总数13、第一页10条，实际CSV13条。被动观察本次详情近30天引起的原生POST：startTime/endTime换算为上述9月10日至10月9日；响应成功协议为errCode=0、data.totalCount=13、第一页list长度10。只观察该UI实际发出的请求，不直接构造/调用平台内部接口，不持久化完整请求body或会话字段。

## 据此修正的实现

正式composition装配`wechat-dom-witness`，不再把缺witness的空工厂当作已可用。两平台身份固定读上述普通信息页；表格的近30天精确限定到`.filter-row:has(.filter-extra)`详情区域，避免同页趋势区控件抢先命中。单篇以本次新请求/响应、实际选择和总数共同就绪，监听前发出的旧请求即使同窗口晚回也不作证据。内部expectedRows随下载传到唯一真实解析器，CSV截断为10条时在commit前拒绝，保留已得前两份，不变成登录过期。

公众号内容页只有图表，用户增长表只有当前页10个日期；不能要求30/31个DOM日期或计算一组日期冒充表格。reader核当前可见日期输入与真实native href的日期相同；接收后解析器继续严格核统计表实际完整日期集合。下载前重新核同一状态，阻止过期href/总数变更。

实BIFF另发现阅读来源发表日期为YYYYMMDD；新增只在BIFF日期字段解码的兼容，raw仍保原八位字符串，非法日期仍拒绝。旧按横线日期合成的fixture不足以发现此问题，当前私人内容文件首次实际REPORT_DATE_RANGE失败保留，修复后五份文件全部解析PASS。

独评另指出隐藏登录提示、跨午夜重算窗口、无frame请求事件抛错。各项当场RED后修复：仅实际可见登录提示可判登录失效，本次窗口只冻结一次，无frame的无关请求只忽略；不会使合法采集失败。完整source+内置witness在等待原生response时取消/原剩余期限耗尽，实停后late response不再交第三份，原前两份保留。扫码弹窗去掉用户不需要的内部runId文字，原索引和可核对任务仍保留。

实际源码只读reader还通过Ego普通页运行：公众号身份哈希与私人字段一致；内容页返回真实日期输入/href证据，dates为空，没有假造30天表。最初桥接误把Ego异步url当作Playwright同步url，返回null；修正只读adapter后验证身份。内容页初次尚未完成加载同样null，后续实际读数通过；生产observe等待就绪，不以首次快照签成功。这些null不是登录过期或成功证据。

```mermaid
flowchart LR
 A[本人普通账号页] --> B[固定稳定身份]
 B --> C[产品独立扫码环境]
 C --> D[按每类报表真实日期选择]
 D --> E[页面就绪与原生完整文件]
 E --> F[真实解析：日期、单位、完整行数]
 F --> G[原租约与归属核验后逐份保存]
```

## 仍待完成

产品自身隔离Next实例已运行，临时PGlite与所有登录目录均在本次新建`/tmp/creatoros-t1110-fullpage.*`根，没有连接或迁移用户库。通过实际平台能力表→视频号弹窗→公开accounts.bind.start启动一次真实扫码任务；Ego空间20实际handoff后用户确认“已扫码登录”，根会话才takeOver继续原ID核对。

原任务`execution-task-4eb3a857-15`公开accounts.bind.status实际HTTP200但终态failed、accountId为空，错误为“该平台能力尚未接入可用的数据适配器”，组成员仍0。实际身份读取成功后，正式sourceAdapters仅登记nativeReports、漏bind，commitVerifiedBinding的原守卫因此拒绝。本次失败完整保留；不是Cookie过期，不称绑定成功，不把原失败ID改成功或自动重发。

补两平台公开composition行为回归：外部浏览器读数是明确合成fixture，实际start/status→profile采纳→原backend绑定事务→账号/组成员回读不替换。Vitest4签名错误导致0test的首次无效运行另存；修test后两平台真实行为RED（failed/null），再登记configured条件下bind/nativeReports两项，未绕过adapter、身份、成员或停止守卫。当前37个worker协议/停止/解析用例一次实际PASS，含两平台嵌套visibility:hidden/display:none反例和真实可见正例。

根会话继续核验修复后的产品绑定、2+3份完整采集及1366/1024页面旅程；研究空间已登录仍不等于产品绑定成功。
当前5份实文件、合成协议/公开DB链、类型及组件检查分别记录；真实产品扫码、完整browser采集与视觉旅程未签PASS。原全局46项失败与T1110-related-gates仍保留，不能据局部通过声称整仓全绿。

## 当前合并回归与保留的失败

当前一次完整worker三文件37 PASS（DOM11/source17/parser9），公开真实composition七例7 PASS，UI四文件57 PASS，frontend与worker类型检查实际exit0。公开composition首次正确签名执行为两微信行为2FAIL；修bind登记后5PASS/2FAIL，旧三平台case仅断言与当前批准SPEC的错峰时刻相反，修测试期待为小红书5/快手10，生产时刻未改，再完整7PASS。无效Vitest4签名0test运行另存，不记作行为RED。

LED047首轮并发8文件173PASS/1FAIL，原run-controls异步查询在并行负载下未及时满足；保此事实，不改断言/产品。同命令仅maxWorkers=1、retry0串行复验8文件174PASS。当前timeout-policy实际exit1，旧27个静态短预算项仍存在，无本次新微信文件；没有把动态35PASS的backend执行组误当worker用例。

新增独立闭合复核`t1110-witness-bind-closure-audit.md`核实际37/7/57与源码SHA；只签源代码接缝，没有代签真人或视觉。root曾误用三个不存在的check-*.mjs命令导致MODULE_NOT_FOUND，实际无Gate运行，日志另标command-invalid；随后按现有正式scan命令执行。此前context/progress唯一步骤缺失以及旧46个全局失败继续保留，不用局部回归替换全局事实。

产品已在同一隔离PGlite根温和重启配置，原failed扫码任务仍保留。root经实际表格弹窗明确开始新intent，公开索引为`execution-task-3eba3525-15`，实际页面等待扫码验证；Ego20已handoff给用户，未在用户控制时继续浏览。后续本人绑定和平台采集均仍待验证。
