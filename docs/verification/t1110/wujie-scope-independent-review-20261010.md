# T-1110 Wujie DOM 归属机制与合法恢复独立只读评审

结论：当前页面的“固定 iframe locator 查不到实际可见报表标签”机制已经明确，不能再把隐藏沙箱 iframe 当成登录失败或继续等其原生DOM长出标签。现有反例、官方说明与本机Playwright实现相互支持。但还未取得两项研究验证命令的实际闭合证据，不能据此直接写validated/关闭OPEN，也不能解释历史EXP-2为何落首页。

本次仅静态读取源码、已有工件及公开官方文档；不运行browser/API/测试，不修改产品、配置、卡或看板。HEAD当场核为b7a345592ee0abc6b6fa749b409967ad42ee83d1，T-1110仍暂停。具名现场观测由root交接，不冒称本评审重新执行或签收真人。

## 当前反例能证明什么

root具名现场事实：ef9887在原空间20/p6读到可见稳定ID唯一、复制值一致、原身份摘要匹配；菜单到视频数据后官方当前pathname为/platform/statistic/post。5c755f中的不支持waitUntil参数导致TypeError，不能记等待PASS；1a9ffe随后正确的120000ms waitForURL成功，f88add实际截图可见完整数据页。

0ddd1e/c51212在同一现页读到：唯一可见WUJIE-APP/open ShadowRoot内“全部视频”“单篇视频”“下载表格”各1；对应/micro/statistic/post沙箱iframe display:none、0×0。父realm原生Document.prototype.querySelectorAll调用读取其contentDocument，三标签均0、原生body长度0；iframe被代理的查询三标签各1、代理body长度2338。这里区分了真实节点所在地和子应用JS看到的代理document，不是靠页面截图猜内部DOM。

[无界官方原理](https://wujie-micro.github.io/doc/guide/)说明：JS实例在iframe运行，DOM放在主容器webcomponent中，iframe的查询接口及head/body代理到该容器。这直接支持当前原生0/代理1的差别。[Playwright官方定位器说明](https://playwright.dev/docs/locators#locate-in-shadow-dom)说明其默认定位器可穿透open Shadow DOM，XPath和closed ShadowRoot另有限制。

因此，当前可见标签存在但不属于固定沙箱frame的原生document，生产scope选错是明确的当前反例。“隐藏iframe”不能推出“登录失效”；“代理frame查询有标签”也不能推出“Frame.getByText能查到标签”。不能据此证明历史EXP-2导航到首页的原因、五报表下载/完整日期/公共写回或公众号绑定。

## 本机 Playwright 查询链已核对

可读的旧影子依赖源：

/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/creatoros-t1110-shadow-bqAkiI/source/node_modules/.pnpm/playwright-core@1.60.0/node_modules/playwright-core/lib/coreBundle.js

SHA-256：f74353fcb8e406756a70a6af0dfc4a5069acd577e35ec9d923ccf36ac009c2f5。项目lock/package登记1.60.0；此次只读该目录下实际bundle，没有运行SDK签运行时版本。

- 第53471行getByTextSelector生成internal:text；53549附近filter visible追加内置visible；53700的count调用frame._queryCount。
- 第46889–46927行内置引擎选择：internal:text/visible/CSS默认utility，_react/_vue或自定义非contentScript引擎才需main；当前生产没有这样的自定义引擎。
- 第16903–16909行选择指定frame的对应context；16820–16828行queryCount在该context的document上调用注入querySelectorAll；36188附近Chromium创建独立utility world。
- bundle内嵌source3静态解码后，injected第6585行internal:text使用_createTextEngine(true,true)；6752–6773行pierceShadow=true；5327–5343行递归当前query根的shadowRoot。它穿当前frame document下的open ShadowRoot，不跳到父Page下另一个WebComponent。

故iframe主realm中被Wujie改写的document方法，并不是该内置utility locator的文档代理。原生frame DOM=0与主Page ShadowDOM=1在本查询链下具有确定解释。这是依赖源码与现场反例的推导；本评审没有在现场另执行Playwright locator.count。

最小实现方向是让报表UI locator使用唯一实际可见的主Page Wujie容器，并保留原官方path、实际identity、唯一/可见、日期及完整性判断，不force显示沙箱frame或取第一项。不能只把scope变量机械改成Page并强转Frame：现readWechatReportDom使用micro路径和document查询，Page.evaluate也不会自动替其querySelectorAll穿ShadowRoot；channelsWorks还以实际请求frame证明响应归属。需要分别保留UI根与原实际子应用网络frame的证据关联，不能因修DOMscope取消响应来源校验。这是研究实现方向，尚非已通过候选。

## 机制标准与必要只读验证

“当前SECTION_MISSING来自实际DOM根与固定frame scope不一致”已由本轮反例明确识别，并淘汰“当前页面不存在这些标签/隐藏iframe必然未登录”的解释。可见菜单进入路径已有当场正确等待和截图证据。历史首页原因仍unknown；不要抹去EXP-1/2或声称所有旧失败同因。研究标准若涵盖当前错误scope及实际安全可见入口，应按这些新证据更新observed并说明历史未知；不能偷换标准成“某文件SHA相同”。生产完整采集、日期和写回属于恢复后的原验收，不能要求第三次native执行来闭合只读机制研究。

在root允许配置验证器时，两项key应指向真实存在、经独立核对的项目只读验证器，例如未来的verify-wujie-scope.mjs mechanism/boundary两个模式；当前这些模式/命令尚未实现，本报告不提供冒充现成成功命令的假路径。机制模式必须验证实际反例，边界模式必须核验真实动作边界，二者范围要明确：

| key | 必须验证的事实 | 不足以替代的材料 |
|---|---|---|
| t1110_wechat_section_mechanism | 同一已授权Page/同一官方path与身份布尔；唯一可见Wujie open Shadow；原生frame标签0与对应实际可见根标签1；依赖的实际内置utility查询链；定位器精确/visible计数及归属差异 | 单纯assert(card.status)、读取摘要中的passed:true、只核文件SHA或再运行mock TDD |
| t1110_wechat_section_boundary | 实验数仍2、无新native任务/扫码/空间/Cookie迁移；原失败/0报告保存；生产源边界未改；实际只读动作种类、原Page所有权、有限预算及失败/停止限制 | 写几个自报false字段、OS Chrome0冒充正式profile收据、忽略无效waitForURL那次TypeError |

优先在同一现存已授权Page经原工具做仅count/visibility/read的定位器观察，不点击日期/下载、运行prepare或提交业务。若当场只能用CDP，应明确记录实际原生/代理realm及查询方式，不能把CDP计数冒称真实Playwright调用。只读测量沿原signal/end和至少120000ms有效预算；遇到过期、停止未确认或所有权问题就保原失败，不重试开新空间。

若验证器只复核已保存的工具结果，必须绑定原实际工具输出/测量方式/时点/Page与artifact SHA，并断言上述具体反例关系；可标“复验真实观察证据”，不能标“本次重新运行浏览器行为”或“产品采集通过”。现有摘要没有真实locator计数来源时不能用纯摘要检查补这个证明范围。完整旧失败、当前只读观察、无效调用和后续正确调用分别保留。

verify配置后要实际执行两个命令、记录真实exit/stdout/stderr和版本/工件SHA；断言失败、证据不完整、只读调用未停止或命令未执行均不能关门。现卡recommendation包含OPT-2后面的说明文字，而官方validator要求其恰等于一个option.id；需把recommendation写成OPT-2，并另处保留解释。卡保留同task/research_task/family/open-trigger lineage、两次实际experiments、至少两个候选和两个criteria、证据hash及原未知，不新建任务/重置额度。

## 合法恢复入口

已读 [product-to-code-orchestrator/SKILL.md](/Users/zyongzhu/.codex/skills/product-to-code-orchestrator/SKILL.md) 和 [Gate 04](/Users/zyongzhu/.codex/skills/product-to-code-orchestrator/gates/04-research-first-gate.md)。门明确要求“恢复时必须现场执行 research_verify_commands[verify_key] 成功，不能靠手写 passed: true”，且当前只允许只读取证/更新卡或已有额度内实验。此处不使用TDD或第三native实验替代研究闭合。

research-gate.mjs实际只有observe/resume/audit；仅export auditResearchGates。validateCompleteCard和validateDecision未export，无verify-only/no-state/dry-run。resume在验证和命令执行后直接setTaskStatus(⏸→📋)，再追加research_resume；因此不能直接调用该CLI而违反AGENTS的taskctl唯一状态写入口。audit只证明有效暂停，不能代替validateCompleteCard或命令。

若采用与先前OPEN相同的政策兼容登记路径，event-only CLOSE是概念上的关闭，实际action必须为research_resume：activeOpenEvent及audit都仅认此action，research_close不会关OPEN。最低条件是：

1. 先独立核对同一OPEN的task/card/research_task/family/trigger、完整v2卡、两个实际命令和真实结果、所有证据SHA、实验额度、原失败/未知及decision_impacts；有实际高影响变化时保原必要用户DEC，纯实现不能编造新增授权或批准。
2. 卡只有在上述事实成立后才能validated；独立检查应等价覆盖当前validateCompleteCard/validateDecision要求，不能跳过私有validator中任何相关失败条件。本报告本身不是这个完整通过凭据。
3. 根唯一writer在原state-lock下重读OPEN、卡/hash、BACKLOG和events快照，确认未漂移后追加真实actor（例如codex-policy-compatible-registration）的event-only research_resume；携带同卡SHA、原OPEN lineage、验证命令及日志证据、decisions、manual_registration/state_write=false，并注明没有调用research-gate resume或其官方validator。BACKLOG在此步字节不变，不伪造actor=research-gate或PASS。
4. 释放该锁后由taskctl resume T-1110 --reason <真实闭合证据>独立执行，不能持锁再调用造成竞争。taskctl自己校验OPEN已关闭、原review receipt等并在状态写锁下留真实转换事件；若拒绝就保持实际暂停，不写成功或手改状态。恢复后仍走原TDD/公共链/UI/边界/收尾Gate，不标complete。

这是满足现有用户唯一状态入口的最小兼容方案，不是当前已经恢复：当前verify配置/实际验证尚缺，卡仍researching，原OPEN保留。没有新实验、代码或状态修改；评审homogeneous inherited，不签binding、五报表、正式停止receipt、研究validated或产品PASS。
