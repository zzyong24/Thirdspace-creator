# 定位并修复视频号作品明细原生响应校验

沿用用户持续修复、双平台正式包、本机安装重启授权。目标组grp-5d5290e4-4284，视频号acct-2578f847-5299/月明Verse，原job-2578f847-5301不变。T1454安装036a9318a的真实一次同步已进入正确菜单/前两报表，在channelsWorks prepare REPORT_RESPONSE_INVALID失败；自建验收任务内部重试已停止并保留原记录，不能标同步成功。不再使用已消耗的任何一次截图授权。

先只补固定形状观察，不更改任何业务成功/失败条件：内部WechatBrowserSourceError与onDiagnostic增加responseObservation，限wechatVideo/prepare/channelsWorks/REPORT_RESPONSE_INVALID。所有字段只允许固定枚举、boolean或有界非负整数/null；无原始响应、请求、正文、字段名列表、链接、身份、headers、cookie、文件名、异常message。观察回调失败不改变原错误、物理停止或lease释放。其余平台/阶段/错误不发此观察，未知/多余/错误类型字段整项丢弃；不得spread任意error对象。

readChannelsWorksResponse每个原失败门附固定reason：endpoint、request_window、response_incomplete、body_unreadable、response_error、count_type、count_bounds、list_type、list_count。失败code和用户文字保留；只有对原合并条件作等价拆分以定位首个拒绝分支。附errorCode状态zero/nonzero/missing/invalid、totalCount类型number/string/missing/invalid、有界count、list状态array/missing/null/invalid、有界listLength及当前页/页大小是否为原1/10，不保存任何实际行内容或原始错误码。任何观测数据不得参与放行。

源码真实RED/GREEN覆盖原全部失败分支、非目标路径不发、无效字段过滤、回调抛错、取消/预算/物理停止；成功旧样例仍成功，全部旧强归属/日期/总数/响应/下载族保留。403业务及导航回归、types、timeout-policy、boundary、task-governance/diff检查；检查后提交、固定入口本地包并验证安装源一致，只运行一次正常同步取得固定字段，不额外截图/导出诊断窗口。若原任务内部重试需停止，限本Agent新建验收任务并保留ID，不能改用户后台任务。

得到实际分支/形状后，依据官方公开固定bundle和本机安全枚举证据修复已证协议差异，生产行为变更前更新本SPEC并复核，先完整公共链路RED/GREEN和旧合法/拒绝输入族，不能只为过门放宽类型或省略校验。源码范围只在ai-worker微信browser-source/DOM witness及其测试与native-entry完整集成测试；不改公共CLI合同/后端写库/账号/数据归属/日期含义/总期限。真实正常同步的保存结果回读成功后才制作最新Mac/Windows正式包并安装本机；失败如实保留原ID，不反复猜测或重扫。
