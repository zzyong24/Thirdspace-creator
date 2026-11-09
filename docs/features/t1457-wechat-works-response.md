# 定位并修复视频号作品明细原生响应校验

沿用用户持续修复、双平台正式包、本机安装重启授权。目标组grp-5d5290e4-4284，视频号acct-2578f847-5299/月明Verse，原job-2578f847-5301不变。T1454安装036a9318a的真实一次同步已进入正确菜单/前两报表，在channelsWorks prepare REPORT_RESPONSE_INVALID失败；自建验收任务内部重试已停止并保留原记录，不能标同步成功。不再使用已消耗的任何一次截图授权。

先只补固定形状观察，不更改任何业务成功/失败条件：内部WechatBrowserSourceError与onDiagnostic增加responseObservation，限wechatVideo/prepare/channelsWorks/REPORT_RESPONSE_INVALID。所有字段只允许固定枚举、boolean或有界非负整数/null；无原始响应、请求、正文、字段名列表、链接、身份、headers、cookie、文件名、异常message。观察回调失败不改变原错误、物理停止或lease释放。其余平台/阶段/错误不发此观察，未知/多余/错误类型字段整项丢弃；不得spread任意error对象。

readChannelsWorksResponse每个原失败门附固定reason：endpoint、request_window、response_incomplete、body_unreadable、response_error、count_type、count_bounds、list_type、list_count。失败code和用户文字保留；只有对原合并条件作等价拆分以定位首个拒绝分支。附errorCode状态zero/nonzero/missing/invalid、totalCount类型number/string/missing/invalid、有界count、list状态array/missing/null/invalid、有界listLength及当前页/页大小是否为原1/10，不保存任何实际行内容或原始错误码。任何观测数据不得参与放行。

源码真实RED/GREEN覆盖原全部失败分支、非目标路径不发、无效字段过滤、回调抛错、取消/预算/物理停止；成功旧样例仍成功，全部旧强归属/日期/总数/响应/下载族保留。403业务及导航回归、types、timeout-policy、boundary、task-governance/diff检查；检查后提交、固定入口本地包并验证安装源一致，只运行一次正常同步取得固定字段，不额外截图/导出诊断窗口。若原任务内部重试需停止，限本Agent新建验收任务并保留ID，不能改用户后台任务。

得到实际分支/形状后，依据官方公开固定bundle和本机安全枚举证据修复已证协议差异，生产行为变更前更新本SPEC并复核，先完整公共链路RED/GREEN和旧合法/拒绝输入族，不能只为过门放宽类型或省略校验。源码范围只在ai-worker微信browser-source/DOM witness及其测试与native-entry完整集成测试；不改公共CLI合同/后端写库/账号/数据归属/日期含义/总期限。真实正常同步的保存结果回读成功后才制作最新Mac/Windows正式包并安装本机；失败如实保留原ID，不反复猜测或重扫。

## 第二次最小实验：只核实endpoint分支

R1实际226c685fa一次run-c85cc56e-5505-411b-ad53-672c9d7c684f / ai-task-a721d53e-79 / exec_295d205b-b563-40cb-996d-faf5f8c92aa7，在collection-a721d53e-80给出reason=endpoint，其余数据形状尚未读取。原自建任务首次失败后已公开取消，不能据此做空列表/类型兼容。

原responseObservation增补httpStatus（100..599整数/null）及method（POST/OPTIONS/GET/HEAD/OTHER/null），不保留任意方法名、URL、headers或原body。只读取原Response/Request现有方法，不额外请求、不改匹配/失败/成功条件、deadline或用户文字；未知/额外/类型非法元数据仍整项丢弃。第二次最小实验仅同原账号一次正常同步核实endpoint原因，首次失败后停止Agent自建验收任务。研究卡仍最多两次实验，不能继续重复全量同步。根据已证匹配差异再复核并修复，其他约束不变。

## 已证修复：接受官方客户端相同的HTTP成功范围

两个研究实验现已闭合：安装1052226424后，collection-a721d53e-338实际为endpoint / HTTP201 / POST，且已命中当前目标菜单；官方同站816.c7a59812.js内Axios validateStatus为200<=status<300。错误是本机只接受HTTP200。HTTP201后的JSON和保存尚未核实，不能先宣布全成功。研究卡docs/research/t1457-works-response-shape.md已validated并现场两项verify通过，任务已返回📋。

只把原HTTP成功门改为标准整数2xx（200..299）；同官方origin和固定endpoint、同Frame、POST、当前新请求/目标窗口、currentPage1/pageSize10、finished、errCode0、有界整数总数、完整首屏list、DOM/CSV日期与总数、停止及deadline全部保留。非2xx、非法状态、空body/JSON、非零errCode或任何数量/归属不符仍失败，不把成功HTTP当作业务数据成功，不按空列表猜零，不引入重定向跟随或额外重试。

RED必须包含HTTP201真实Chromium → 正式source/witness → 原生CSV → parser/collector/backend事务/公开回读全三报表；同时保留HTTP200成功，HTTP201坏JSON业务码只能partial两份，HTTP204无body只能partial两份且不能当0。单测覆盖标准2xx整数范围及非2xx/非法状态、201下原日期/Frame/POST/响应码/总数/列表拒绝族；全旧业务/导航族、types/timeout/boundary/task-governance/diff检查不减。新增公共链测试明确合成、禁外网，不冒充账号真机。

这次公开runNow复用了已有目标手动任务run-b10927b7-92fe-49df-854e-24836d73a4d6 / ai-task-a721d53e-337 / exec_6f5bf2c3-5927-4d29-89b8-a0ddd03b1831（deduped=true），并非Agent创建；保留该任务，不取消或重提。修复后安装普通无诊断配置包，跟随同一原任务重试并回读真实完整保存结果。若安装时该任务正在执行，等它进入原queued间隔再替换，其他用户原任务记录保留。真实成功后按既有授权双平台正式包、核验并安装；未成功不交付为已修复，不再追加研究实验或截图。
