# T1302 增量：预览先显示成稿，选择区默认折叠（待正式round3独立recheck）

用户原授权为恢复Codex功能并精简文章/图文工作台。Root结合真实production验收和独立oil评审，批准本窄增量；不重置T1300 round3，不改T1301已审生产范围。原主SPEC及initial锁/审核完整保留，主SPEC同路径仅追加本增量绑定，走原lineage recheck。本展示增量未实施；T1303恢复实现已在130b97f71b8170ad6674e4eb3c25dc3a9eae9bd6冻结并经独立局部复核，当前以其新两card字节锁审，不用旧UI输入冒未来closure。

## 真实问题与裁决

本轮2168294候选，A在两个原平台真实生成、预览、部分选择、采纳、读回后报告11case8PASS3FAIL，3原模型均succeeded。失败、故障注入、runner假设和实际产品问题分列于FRONTEND_VALIDATION.md；不以模型成功代整体UI通过。creation文章预览有6个模板占位，同稿采用后0个且nativeLayout为空；已定位creation卡漏传原NoteRelayEditor的simplified，导致空layout默认主题与工作台不同。独立9图评审指出683×450有效CSS视口文章首屏被选择区遮住正文。评审全文在acceptance/runs/control-post-ui/INDEPENDENT_VISUAL_ORIGINAL.md，不能只截取有利结论。

Root裁决：对齐已有效的工作台简洁预览；全部原选择保留但默认折叠。不是全局修renderer缺变量，也不根据无变化/空值删除勾选项。原关闭预览后采纳的已验证流程保持，不加第二套采纳按钮；弹窗直接采纳建议为非阻断改进，当前避免扩张动作/焦点与恢复状态机。顶部截断次要建议保留，不列本次改动。

## 最小呈现合同

1. creation卡现有NoteRelayEditor补simplified，与editor卡及采用后工作台一致。空nativeLayout按现有graphite-minimal默认渲染，预览与导出均走原真实组件；已有显式nativeLayout仍优先，必须保theme/布局原参数及导出内容，不能用simplified覆盖它；不写nativeLayout，不填假栏目/账号，不清洗HTML，不改显式旧主题、renderer、native bundle或布局降级规则。
2. 两卡共享AssistedWorkSelection只有enabled且ready的真实选择区默认折叠，用已有noterelay/lazy-disclosure.tsx或等效原生可访问折叠语义及项目tokens，优先复用现有组件。该组件按open挂卸children，只可包就绪选择内容，不能包NoteRelayEditor、卡层hook或必须可见的状态。无enabled review不造空折叠。首次打开先见文章标题/正文或图文内容；用户能展开原字段、事实及来源。
3. 原Object.hasOwn字段全集、合法空字符串/缺省tags/空数组、默认选择、keep/replace事实确认算法、refs、metadataSource、原document/body/key及序列化全保。不能按相同/空值删除checkbox或自动改默认；折叠只改变呈现。
4. useAssistedWorkReview及选择hook仍在原card/member层，折叠与关闭不重置选择、不取消pending。loading/error和必要pending原因始终可见，原恢复操作可发现。T1303现已引入review.locked/confirmed与真实pending状态；折叠必须保持其原锁定语义，confirmed同样不能修改原请求选择。必要pending原因及loading/error/原确认提示在折叠外可见；modal打开时外卡通常aria-hidden，所以modal内折叠外必须独立显示必要pending/confirmed锁定原因，可复用review.confirmationMessage或原简洁状态，不能拿外卡文案代modal内发现性，不新增按钮/读取/状态语义，不改该hook状态机、持久格式、派生证明或回执核验；状态恢复仍属独立T1303，不能靠折叠隐藏失败或local标记冒保存成功。T1302最终acceptance等待T1303 acceptance，但T1303实施不依赖T1302 acceptance，防循环。
5. 保现有close→adopt保存路径、焦点返回、输入发送、来源校验和CAS。全局助手/脚本/视频/另一平台及原稿无语义改变；本次不新增模型请求/API/数据库字段。

```mermaid
flowchart LR
 A[打开原候选预览] --> B[成稿正文先可见]
 B --> C[展开原选择区 全字段默认保留]
 C --> D[关闭预览 原采纳动作]
 D --> E[真实回执与指定版本核对 T1303]
```

## 精确写集与串行职责

A唯一实现writer，生产仅现存frontend/src/features/copilot/chat-work-editor-card.tsx与chat-work-creation-card.tsx，测试允许对应两个现存.test.tsx，另精确允许现存frontend/src/features/copilot/work-candidate-adoption.ui.integration.test.tsx仅按真实UI增加展开选择的动作/同文件公共helper；原body/key、fields/facts、恢复/锁定/零自动写、脚本及另一平台隔离断言均不改。不能test-only强制展开、恢复默认展开或删弱断言。只读依赖noterelay/lazy-disclosure.tsx、noterelay-editor.tsx及原native/layout消费者；运行原noterelay-editor.test.tsx/native-bundle.test.ts、ai-copilot-content.test.tsx、ai-copilot-interactions.test.tsx只读，不改renderer/native主题。新受控证据仅docs/verification/t1302/runtime/refinement/**与REFINEMENT_RESULT.md。C串行控制、R独立报告；T1303已冻结130b97f71b8170ad6674e4eb3c25dc3a9eae9bd6并局部独评，implementation经工具中间done，acceptance仍pending；现在以其新card字节锁本delta走同lineage recheck，正式PASS后交/root/sol_ui_followthrough实施。两个卡共享严格串行，不能锁当前旧SHA冒未来closure。原implementation历史/packet与实际写权保留，新增ui-refinement步骤在原implementation之后、acceptance之前，依赖T1302:implementation和T1303:implementation；acceptance依赖ui-refinement及T1303:acceptance，不重跑原实现来改旧证据。

## 必要验证与限制

产品编辑前，实际行为RED分别证实creation空布局与原采用后默认不同、已ready两卡选择区默认展开遮蔽内容；夹具错误不算目标RED。修复后两卡默认折叠、可展开全集/空值/原defaults、开关及modal关开保状态、pending原因/loading/error可见；原body/key部分选择逐字等同。simplified必须经真实NoteRelayEditor现有导出/渲染路径验证，不只mock一个prop；原native bundle只读回归，无需为one-prop扩生产write_set。

聚焦两卡、frontend类型、boundary/semantic/timeout和LED-047受影响路径；执行test/hook180s、retry0，外层留完整余量。新production候选包含T1301及本增量/T1303，独占资源、全新owned根，真实公众号/图文预览→选择→原采纳→读回刷新、原脚本和另一平台不变；同文预览/导出HTML占位前后对照。1366及窄窗、683×450布局与真实浏览器菜单200%分开记录，键盘Tab/Enter/Esc、焦点、滚动实际操作并看图。CSS zoom裁切不能冒原生200%通过。独立oil视觉复核，不打虚构分。

历史失败全部保留；本增量未实现/未验。T1302接受依赖T1303恢复，T1300父矩阵仍pending。T1301组合前置RED缺证及未答复accepted-risk不由本增量销账。


## REV-001 精确测试适配（round3待审）

round2实际record为CONCERNS[REV:3e95dc34dc6a]，open major REV-001保留；不是实际测试RED，也不改成PASS。Root已授权仅把上述现存组合测试列入W：新UI默认闭合后，原114/117/121等消费者须先通过真实summary/展开动作再查checkbox，可提同文件公共操作helper；不得通过测试环境自动展开/取消折叠、跳过保护族或改变期望值规避。原T1303五前置RED/增量RED/120及19最终测试历史、源码绑定和独评均不回写。当前只改方案/module/锁，产品和该测试字节尚未变；该适配与两卡呈现统一由A串行执行。
