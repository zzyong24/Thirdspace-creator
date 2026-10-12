# Root集中复测追加记录

所有首轮、中间红测及其日志保留；本表逐运行列举，存在文件重叠，不能相加作为全产品通过数。App用户暂不授权、验收未完成。

|真实运行|结果|范围与边界|
|---|---|---|
|focused-root-ui-fixtures-attempt1|128项：121通过、7失败|完整14文件；6个shell fixture缺真实初始化read envelope、1个AssetPicker失败后仍保持重试弹层，后续精确修fixture|
|focused-root-module-fixtures-attempt1|79项：68通过、11失败|13文件；原新的权限/平台约束及受控publisher未装配，全部原失败保留|
|focused-root-module-fixtures-attempt2|73项通过，8文件|实际收集8，命令中9个module短文件名过滤不存在，未收集这些module；后续attempt3使用准确路径，不能把此轮写为17文件|
|focused-root-module-fixtures-attempt3|41项通过，9文件|完整公开模块：真实account父链，封面字节/CAS/原回执、索引/真实空/registry；发布用明确测试MockPublisher，不代表真人平台发布|
|focused-function-key-alias-attempt1|2项通过，1文件|仍穷尽全部前端functionKey；两个显式媒体alias实际assembly→冻结tool定义→原Host prepareTask落实kind；无模型或提交/唤醒|
|focused-auth-reset-binding-attempt1|37项通过，4文件|认证8、reset10、真实绑定stage12、本地平台公开composition7；reset只写本例fresh临时marker；绑定外部驱动是明确fixture，不代表真人扫码|

后两轮准确runner均retry=0，单测/钩子180秒，独立外层3960000毫秒覆盖3600000执行与360000清理；隔离APP/DB/media/浏览器/profile/备份/工作台，不读用户根、不继承PG/model密钥。root runner源码：`/tmp/t1246-root-focused-runner-v3.cjs`，每轮`*-exit.json`有实际PID/进程出生、deadline和退出清理回执，owned tmp根保留便于追溯。

尚待原legacy104升级、三个worker-entry/聊天原提交/评论正式dispatch完整复测；完整四包和重新打包/完整浏览器均尚未签通过。已修root产品源不会因测试原假根被拒绝放松归属保护。

追加真实focused-comment-diagnosis-public-attempt1：原完整1 body PASS，9.229秒exit0，公开CLI→HTTP正式dispatch→SQL幂等账本→真实Chromium；同key单次点击、跨账号拒绝、观测脱敏、删除后close及中断outcome_unknown断言全保。清理processClosed=true/owned成员0；外部HTML是明确受控fixture，不代表真人评论采集。

新T1247已独评，仅名单buffer修复；完整超时Gate实际8组结束exit1，静态2746文件报22问题，剩余7组PASS。见docs/verification/t1247/RESULT.md，不称全绿。

原公共Worker入口root20首次：14chat PASS、script6中4PASS2FAIL（真实公开DTO无deadline、取消fixture未绑定原execution）；第二script6为4PASS2FAIL（只读DB捕获port用错createDb而实际createConfiguredDb），均保留。第三script6完整6PASS、exit0、61.176秒/processClosed、owned组0；原retry3 HTTP仍严格成立，截止/budget从本例真实库只读验证、原task/source/候选/CAS/确认/字面稿0模型均保，新真实401原执行取消后克隆拒绝及0额外HTTP/credential读取完整通过。不得将重叠三轮相加为覆盖数。

类型闭包澄清：实际git ls-files与HEAD tree均确认frontend/tests-t1246-generated原100文件已tracked，不是untracked。其4个相对533的改动属于首轮既有driver准备字节，当前100/100完整匹配first实际manifest SHA且保护不变。不能在新candidate/标准tsc中删掉、排除或改写原稿洗绿；最终标准frontend tsc仍须实际执行并如实记录该历史生成稿的类型失败，局部driver静态类型成功不替代标准检查。

追加focused-root-ui-fixtures-attempt2：原完整14文件128项全部PASS，25.219秒、exit0、processClosed=true、budgetExhausted=false，owned进程组0；前后14文件SHA完全不变。仅修首轮7项fixture并保原断言/所有首次失败；没有共享Worker build。这是局部完整14文件回归，不代签完整frontend/最终浏览器/App。

追加当前真实事实（2026-10-11T21:37:50.810422+00:00）：原客户端完整19项全部通过；scanner新增7项通过。Rust IPC实际18列举中15PASS/3原ignored（standalone依赖），Rust browser实际12列举中11PASS/1原ignored，417个实际依赖是主Cargo.lock原708严格子集、tuple差异0；这两轮不可代签公共Node链、Windows或App。新生成leaf原10先3PASS/7可信状态丢失FAIL，两行修复后同10全部PASS；实际完整生成22为18PASS/4FAIL，73.03秒exit1且source不变/closed/group0。失败：badOutput及diagnosisEmpty真实partial，crashMixed6HTTP/38tokens对旧5/31，新finite公开DTO缺accountId所以未到到期行为。后续候选必须独复并重新完整跑，不借当前原红洗绿。App仍按用户答复未授权、未验。

追加当前真实事实（原各段均为当时记录，未覆盖）：生成原完整22最终22PASS/0FAIL/0SKIP，child62669ms、wrapper63313ms；leaf10不与其相加。原B029正式完整3PASS/0FAIL/0SKIP，21358ms子进程/source不变/closed/group0；这是原源码真实运行，不是private替身。原Worker完整9文件46项为38PASS/8FAIL/0SKIP，137814ms子进程/source不变/closed/group0；失败在hooks4、draft3、callports1，待T1253独评窄校准，禁止写为全绿。proper backend/worker两tsc分别exit0、41251/7549ms。证据位于owner-final-evidence的三个freshnonce子目录。

追加新cfg Rust主锁投影复测：native-runs/f447c542219d6eba13e19ca3 原12列举11PASS/1原ignored，31.97秒；328源不变，实际main708→417严格tuple子集/差异0，owned cleanup确定0存活/0unknown。仅原cfg测试预算变更后的编译回归，不代签CLI公共原生、Windows或App。CLI默认HTTP300秒小于Native420秒的真实缺口已两树登记T1252；35秒公共验证不能冒签该上限闭合。App用户暂不授权，未验。

追加标准frontend types真实复验：首次完整4323输入为7错误，其中原封存100文件4历史错误、新public fixture三EndpointInput缺body。仅三输入补body:undefined后第二完整4323输入44.444秒/exit2，剩原4历史错误；source0drift/closed/group0，原输入未排除。两轮原日志保留，新增错误0不等于全局类型全绿。T1252已独评并两侧真实start（integration fc42b1d42391/canonical5ceaed23e00c），尚无实现或>300秒运行PASS。T1253只观察两原测试已获窄候选/工具独复，原25保持旧刺激与期待重跑，未校准签绿。


- T1252 两项原 Node25/global fetch 真实 RED 已结束：headers 301418.836ms `UND_ERR_HEADERS_TIMEOUT`；body 301383.645ms `UND_ERR_BODY_TIMEOUT`，各 POST 1，产品 0 PASS / 2 FAIL。collector exit0 仅表示完整收据采集完成，13 原工件逐 SHA 保留；进程/日志已关闭且自有清理确认，修复候选未应用，未签 GREEN。


- T1253 第二次完整原25字段观察：17 PASS / 8 FAIL / 0 SKIP，child64376ms、wrapper65372.220708ms，原刺激/期待未改；sourcef63f前后相同，stdio关闭、group0、自有目录清理。11个当时快照证明第三HTTP的Pi冻结/attempt2/retryOf/同摘要与原预留事实，最小UNKNOWN合同澄清仍待独评与两侧正式recheck，尚未校准原8失败。
- T1252 6产品+4原测试精确候选已获得ROOT与独立peer审查；确认仅mcp直接依赖Undici7.27.2、原lock全字节保留。新300秒GREEN/实际bundle/公共Rust与渲染链均待跑，不将候选批准当作产品通过。


追加当前实际记录（2026-10-11T23:41:04.464962+00:00）：MCP完整8文件116 PASS/0 FAIL/0 SKIP，proper types0、scanner8 PASS、实际原build-runtime及CLI bundle smoke0；210源/4914安装实现同字节、5子进程关闭及group0。ROOT完整渲染2文件11 PASS、child81235ms、源同字节/closed/group0。最新完整Gate boundary0、orphan0、timeout1：2746静态文件仅两处doocs内置30秒abort FAIL，其他七组真实PASS、完整EOF/group0；不覆盖首次22项FAIL。T1253第三轮3cb9正式评审两侧PASS，严格三测试候选已应用，实际25/46复测尚待执行。App用户暂不授权，验收未完成。


追加hosts V8实际整组：静态完整36、实际list30与JSON36/6原资格skip匹配；实际29PASS/1FAIL/6原SKIP，child27896ms/source0漂移/closed/group0/signals0。唯一停止owner cleanup新case expected succeeded但actual failed，24ms，交author精确诊断；未降低断言，不称native六例通过。证据t1250/runs/ct1250-regression-hosts-RRhxJc。原doocs两条请求默认30秒另在T1254登记CONTRACT盘点，不改scanner豁免或原vendor字节。


追加V8完整三组：CDP原31为30PASS/1FAIL/0SKIP，child17822ms（新慢公共body原账号a不存在，待独立核跨case初始化）；公开装配原2全部PASS，child85791ms；file recovery原55为54PASS/0FAIL/1原native资格SKIP，child12020ms。三组source同字节/stdio及process关闭/group0/signals0，分别保完整list与JSON；恢复skip未代签Rust journal。原与新均非App或正式平台验收。


追加T1253 combined V3真实原25：23PASS/2FAIL/0SKIP，child74332ms、wrapper76262.20875ms，sourceActualUnchanged/unchanged true、signals[]/closed/group0/自有根cleaned。两新严格字段失败为draft recovered usage的实际input/output归一shape与候选总量字段不符、ports原failure对象实际有own retryAfterMs:undefined；实际call.totalTokens仍5、candidateOwner0记录保。精确consumer待核/私有窄V4未apply。原46随后按已准入完整运行，禁止先改运行中的三source。


2026-10-12T00:10:34.230899+00:00 当场补充：T1252 实际打包CLI受控两条310秒headers/body均PASS，十份raw SHA已逐一核验，单POST/完整JSON EOF/自有group及listener关闭。T1253 V3完整25=23PASS2FAIL，原9/46=44PASS2FAIL，两组不相加；proper backend/worker types均0，原两红完整保留。T1250仅两新增slow测试隔离获独立与ROOT复核后已应用，V9完整hosts正在跑；不签App或总验收完成。
