# T-1447 平台绑定及登录状态

2026-11-09用户根据账号管理页截图要求，在各平台扫码绑定附近显示哪些平台已经绑定，以及登录是否有效。沿用当前组“月明水清深”与现有页面风格；T1444占用修复已真实绑定成功并交付4f3e9ca7c双端包。本任务独立实现新增显示，不修改旧候选来消除打包失败。

## 行为与证据语义

1. 在平台能力表新增“绑定状态”列，逐账号显示名称、绑定/身份未验证/已隐藏和登录结果。同平台多个账号分别显示，未绑定平台显示“未绑定”；功能“可用”、账号active、目录存在均不能推断登录有效。
2. 登录标签为“最近验证有效”“需要重新登录”“登录待验证”，带最近验证时间。来源只能是同一真实账号的成功扫码保存、匹配身份的授权证明及可信采集检测记录；已撤销、已到明确有效期或更新的needsAuth结果优先于旧成功。缺记录/损坏时间不造正常，不加自创时长TTL。标签明确是最近一次检测结果，不承诺未执行的实时浏览器探针。
3. 新增“刷新绑定状态”真实只读操作。初次/切组/绑定成功/刷新读取当前组；读失败显示“登录状态未确认”及可真实重读的入口，账号名仍取已读成员。该可选元信息失败不得阻止扫码保存、关闭成功弹窗或继续创作。进入页面与刷新均不弹浏览器、不扫码、不采集、不发模型任务。
4. 切组、卸载和重叠读取丢弃旧响应；同一批当前组读取只保留一个在途请求及最后一次重读。正常与窄视口沿用现有表格/横向溢出、tokens、字体与按钮，原扫码和管理入口不变。

## 契约、来源与权限

新增一个必要只读操作`accountGroups.bindingStatus`，GET `/account-groups/:groupId/binding-status`，params只有真实groupId，不接受body/query覆盖账号或证据。现有bindingCapabilities/listCapabilities是装配能力、collectionPlanReadiness明确不是登录态，不能替代；由backend一次聚合，前端不批量扫描任务或读取凭据。

返回`{groupId, accounts:[{accountId,platform,accountHandle,bindingState,loginState,checkedAt,reasonCode}]}`。bindingState枚举bound/unverified/hidden/unavailable；loginState枚举verified/needs_login/unknown，已知结果必须有真实ISO时间checkedAt。reasonCode仅expired/revoked/needs_auth或null，不输出平台稳定身份、secretReference、cookie、token、auth目录、原始任务checkpoint。未绑定平台没有accounts项，由真实当前成员空集显示。

平台账号模块校验真实组归属并只读当前成员/账号，使用自身拥有的account_binding成功记录投影扫码证据；平台采集模块通过只读service port返回当前账号授权及可信检测事实，不跨模块读repository，不建表/迁移/新缓存。已知时间/状态/ID比较是机械资源证据，不做内容语义判断。API按用户拥有的显式groupId读取，允许账号管理中查看另一自有组，但不切换保存的工作区。匿名401、非本人/不存在组404，状态源读取失败正常错误，重复读取不写库。

例如月明组的抖音账号保留acct-5d5290e4-4345，真实扫码保存发生2026-11-09T04:22:22.419Z，可显示“最近验证有效 · 11月9日12:22”；无证据的新登记账号显示“登录待验证”，不能显示绿色有效。转组只展示当前成员，原组历史内容和任务正文不移动、不导出。

## 实现与验收

contract定义只读资源、操作、user范围、CLI只读和观测分类；backend平台账号新状态service及group transport负责聚合，platform-collection只读证据port负责其数据；persistence-client仅装配端口。frontend AccountGroupManager及小组件/读取hook消费，成功扫码后独立刷新元信息，不影响原成功链。

验证先RED后GREEN：契约字段/权限/只读分类，真实PGlite当前组归属、同平台多账号、缺证据/失效/新证据覆盖旧结果、隐藏/已转出成员、无敏感字段且不写库；真实组合根接线；React切组/读失败/刷新/旧响应/扫码后刷新。contract/backend/frontend类型，LED047对应回归、timeout-policy、boundary；正常及窄视口的真实浏览器旅程按PAGE_SPEC/验证报告记录，不把fixture或逻辑测试当真人扫码。

真实界面验收可按现有工程授权创建本任务命名的临时验收组/未验证测试账号，验证空态、不同组与多账号后归档清理；不改主组现有账号/凭据，不为造失效状态撤销用户登录。授权来自用户本次显示需求及项目AGENTS对可恢复测试命名/归属的既定授权。新操作和字段边界记录DEC，未请求tag、公开Release、Growth/Activity或真实用户放量。实现冻结后更新本机，并按已有双平台交付授权制作包含本任务的新包。
