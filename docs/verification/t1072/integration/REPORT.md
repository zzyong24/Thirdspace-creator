# T-1072 隔离本地集成与验收

本地双设备实现已精确集成，真实原生HTTP消费和正常官网确认已闭环；正式安装版与真实双电脑验收仍待验。唯一写入工作树 `/Users/zyongzhu/.codex/worktrees/t188-completion-creator/Thirdspace-creator`，分支 codex/t188-completion-integration，基线6b1322af。当前最新已提交源码HEAD为af34bef454d4bab319e75806c068b9f3a7f8bf3f；全前端验证绑定未再改动的前端freeze6dd9db7acbcc80a85075f07a40964dd014d24454，后台变更和剩余FAIL另列。没有push、生产部署、安装替换、生产或真实用户码/设备操作或读取用户DB/Cookie/OS凭据；独立Lab仅使用本轮明确授权的新隔离测试授权与测试设备。

## 用户任务与真实交接

原电脑操作者持有已激活授权，设置内连接本人手机号；新电脑在官网选择本人准确原产品授权并短信确认，软件验签、保存读回、ACK后才启用。两台满额时官网明确移除旧电脑；失败保原授权、期限与本机项目，同意向恢复，不盲目重复登记。官网登记不能代替软件启用；本轮真实HTTP之外的组件fixture证据不冒充安装版。

## 精确源码与实现复核

| 变更 | 当前证据 |
| --- | --- |
| 引擎更新 | d4ebc034，product-to-code-orchestrator3.27.4→3.29.0；78暂停任务无损并入唯一活动表，不恢复暂停任务 |
| 双设备来源 | 59acab77仅fd09b64b+6855ba14的14文件、最终blob逐字一致；不导入无关40a5eaf4；source-provenance.json |
| 视觉修复 | 2a9389e5仅两Input补md:text-base，实际desktop字体16px；VISUAL_REVIEW.md与组件浏览器记录 |
| 实际协议兼容 | 原native错误强制ULID被真实Growth canonical LDR_UUIDhex拒绝；当前start/Journal/PKCE/poll/ACK共同严格支持合同canonical形状，ready Activity device仍严格ULID；原422/created-rejected日志保 |
| source恢复 | eab42768真实18行遗漏修复，durable58原50输入族+8反例；其中13标题/断言按持久协议调整，不声称原断言原样 |
| 发布搜索投影 | f4b0c492沿既有manualpublication/SearchIndex seam原ID补偿，不回滚成功发布事实；backend45、frontend5及searchscope5；独立实现复核准确范围 |
| 正常组素材/整稿/采纳 | 3a551fb5精确3生产文件：候选同源workspace键与scope、Artifacts同tx真实项目锁端口、两个MaterialLinks callback同tx返回真实project row；Worker14、backend82、legacy15、researchcomposition1 |
| 最后test装配 | 6dd9db7a完整Skill/worker flags/真实所有宿主端口和父子SSE，chat原5通过；desktop原4独立真实build保完整bytes/fork能力，原timeout不改 |

组修复独立报告：Growth completion/creator-group-generation-implementation-review.md明确当前3文件无新增具体guardblocker。外层call/op/receipt/file/lease/membership不变；现helper不逐值比较groupVersion，不声称不存在的拒绝门已验。研究composition1仅真实callback/事务scope反例，不等于完整研究模型UAT。详情GROUP_GENERATION_REPAIR.md、TEST_ENGINEERING_RECOVERY.md。

## 原生与官网隔离Lab实际闭环

唯一Growth候选localhost8872、独立ActivityHTTPS127.0.0.1:8850，新独立creatoros/official测试授权，同稳定machine、原首激/期限/owner/grant。client仅显式信任LabCA的合法leaf，不全局信任、不接受无效证书、不改release origin/验签。正常官网用户明确选择非latest原30日授权并短信确认；实际Rust consume ready→JWS Ed25519→原期限→加密保存/回读→ACK→清胶囊全部通过。foreignOrigin/untrustedCertificate/wrongSigningKey负例严格拒绝，secretExposure=false。原失败capsule/410/移除墓碑保，不延TTL、不重置首机或换新授权。

同原授权当前2/2；父主控正常官网实际回读原期限与新电脑，1440/390/360字号>=16/action>=44/overflow0及返回刷新稳定。精确Nativepublic交接 native-http-handoff.json包含当次sourceHead f4b0c492及6真实源码SHA256、实际二进制SHA2569ffeabc8568b9e20515a76b1a3ab0d0a91ad65f132f83856069e2037f36ec92e；不copy原码、secret或ciphertext。LIVE_HTTP.md、native-http-prepare-gd-ready.log、native-http-consume-gd-ready.log为1/1真实网络，不能当内存Transport或正式安装双机。

## 测试与审计真实状态

| 验证 | 当前事实 |
| --- | --- |
| 全原生lib | 204pass/0fail/2ignored，native-full-engineering-final.log；手动HTTP另1pass，ignored不算自动通过 |
| Next正式候选构建 | frontend-engineering-final-build.log exit0；未打包/安装/部署 |
| 最新typecheck | frontend-final-fixture-complete-typecheck.log exit0，含最后test真实服务类型 |
| timeout-policy | 分批5+20+34+67+14 exit0；原native/frontend修复保持期限、RetryAfter与恢复限制 |
| 第一次全前端 | 35文件失败/88tests失败、exit1，frontend-full.log；冻结基线对照与每类RED/GREEN保，不因既有放行 |
| 修复后全前端第一次最终 | 414files：2fail/411pass/1skip；3612tests：2fail/3608pass/1skip/1todo，474.16秒，源码3a551fb5；日志frontend-engineering-final-full.log |
| 最后两项聚焦 | chat-read-host原5/5；desktop原4/4；完整清单/账本/bytes/handshake与原预算保；中间FAIL日志全部保 |
| 当前完整重跑 | freeze6dd9db7a，maxWorkers2/retry0，无timeoutoverride，exit0；414files413pass/1skip，3612tests3610pass/1skip/1todo，581.41秒；frontend-final-repaired-full.log及invocation绑定真实源码 |
| 编排控制面 | 本轮真实65→36→30errors/1warning，最后reconcile-engineering-interim.log仍FAIL；T1072自身SPEC变更receipt过期，其余旧回执、boundary、lessons分开保，不改旧PASS或baseline |
| context/记忆 | 最新真实contextcompile、pmemsync已执行，pmem-final.log；pmem“剩余5”来自旧boundary baseline计数，不表示实际scanner7条/2新增已解决 |

## 仍缺事实与恢复

正式Mac/Windows安装包、OS凭据journal、实际两电脑首台连接/第二台启用/第三台替换/离线移除/重启恢复未验，T1072待验。候选包缺真实sidecar.tar.gz、原生sidecar资源和显式正式签名seed；DESKTOP_CANDIDATE.md说明精确准备与恢复边界，未读取OSkey或运行会安装/复制到用户目录的package-local。开发Lab公钥不得冒充正式渠道签名资源。

母T915显式新消息与逐call identity提案已获独立设计缺口复核，但未正式母审核、未实现。精确patch/candidate/schema-wire-downstream表及已应用待审规范draft在CHAT_MOTHER_SPEC_DRAFT.md；母T915与T1072各自cycle1 round2/3，最后round3必须范围稳定、独立准确当前packet再由真实工具记录，不借旧review或新cycle绕cap。成功无候选按钮的新尝试行为及S5完整价格/成本仍未通过，不能被测试工程GREEN掩盖。

本轮新增reconcile原因与旧欠账按准确日志继续处理；未把全局FAIL声称全绿。最终测试与审核收尾仍继续，无正式交付完成声明。回退以隔离源码提交为单位；旧授权/首机/期限与失败审计不清除。

后台控制门聚焦原26files/747tests为4文件7失败/740通过，backend-control-lessons-real.log exit1；四项test-only修复已获精确授权并在TEST_ENGINEERING_RECOVERY.md登记。LED052标准postgres单次无密码连接也因role不存在exit1；无新DB、无secret读取、不继续猜role。creator-isolated-pg-postgres-create.log是能力缺口事实，不能将PG门skip视为通过。

后台四文件test-only工程提交8b8d6d1eaa3a965da67d61a0513dfcba2f3e0c29完成：原7失败/740通过→完整原26files/747tests零失败，109.14秒，backend-control-lessons-repaired.log。原5s业务预算与hook默认预算不变，真实独立DB初始化/关闭按fixture生命周期，全部原场景、正常父对象/宿主归属端口和strict负例保。后台tsc与PG缺口仍独立未通过。


## 本轮后台旧测试端口、完整JSONB守卫与剩余业务差异

精确test-only公开装配提交109b2d95、46f7f5c8完成原5文件170库存接入，退役转写整批入口没有兼容shim；原3文件50真实Worker场景通过。后台12旧类型诊断最终闭环，backend-current-real-host-final-typecheck.log与guard后两次typecheck真实exit0。

完整JSONB回执顺序缺陷按旧R03原行为修复4b0b69b5，唯一production文件execution-transcribe-workflow.service.ts只改Node内建完整深相等。独立实现复核发现新fixture getter静态求值，故初次0HTTP声明不足；test-only ed97f547改实时getter与真实SSE计数正控制，完整51/51（24.87秒、无skip）和后台tsc0为有效当前证据。原负例完整字段、strict schema、真实模型identity、有序作品binding与0新工件/原账本守卫均保；没有修改pending母draft、partial/generic失败或冷却状态。详JSONB_RECEIPT_GUARD_RESULT.md。

guard后原完整170为136通过/34失败（chat22、转写12）、48.55秒exit1；backend-five-real-worker-guard-fixed-red.log完整保，不以类型GREEN放行业务。随后发现后续T768已正式覆盖旧DEC-ASR022配置故障阻断，主控独立源hash-chain核实后仅授权F7-a test-only按后续契约迁；这不等于母新范围或production fallback修复。旧34RED不删除，最终170数字另按真实重跑更新。

完整26控制集合最新版backend-control-lessons-guard-final.log真实747/747、128.25秒exit0，invocation绑定4b0b69b5；该集合不含剩余34失败，不能替代它们。LED052当前隔离PG有效role缺口不再探测；正式双机安装包与母规范正式receipt仍受阻，reconcile正在真实执行，未声明通过。


T768后续批准来源经主控独立重算核实后，仅原F7-a坏配置test-only迁为安全local一次/0在线/0lease/真实原账本与稿读回。最新完整170为137通过/33失败（chat22+转写11）、58.60秒exit1，backend-five-approved-t768-final-red.log；后台最终backend-approved-t768-final-typecheck.log exit0。旧34FAIL保作前态，未实现其余终态/冷却/generic错误候选，不声明产品全部通过。

最新reconcile-jsonb-engineering-final.log真实exit1、25errors/1warning：18回执/1boundary/6lesson。后续仅公开AI入口test修复24b432b1消除了本轮新增的repository跨界，当前scanner仍7条vsbaseline5（原live SDK2）；未重跑完整reconcile，不能据此自行减少总数。LED024真实竖屏15.34≠15在原6b1322af同命令复现，MOTION_TIMELINE_DURATION_PROPOSAL.md记录未应用候选。LED018普通cargo因缺真实sidecar binary在build阶段exit101，137前端测试通过不代表Windows测试运行。LED038独立原命令重跑9/9，通过与旧reconcile失败同时保留，未证实旧失败原因。控制面仍未通过。


## 当前口播时长、原聊天库存和研究观察驱动增量

6597ae18980a02c4dea6ade4e79eb30735058c1b仅chat-assembly.test.ts按主控已核后续来源恢复原90输入场景。原90实际90P，完整170为159P11F（剩余转写11），相关46为43P3F，类型0；原RED不删。历史T920/T928/T932/T962记录不冒当前正式PASS，母T915 draft未成为改终态依据。CHAT_CURRENT_CONTRACT_RECOVERY_RESULT.md含完整每族映射。

c4e13e27d5ecfaec67d9da0a80d3de667e5c3aaa仅template.ts既有口播回位时长实现缺陷、当前8条边界补测与精确删两行错误尾tween快照。准确新增8在原6b源码5F3P；最终template88P。原LED024实际整链：Worker11P、backend186P、frontend12P、strict15秒真实横竖预览全部通过。T902沿既有安全门实际本地渲染/ffprobe1080×1920、30fps、3秒、无fallback，后台类型0。原15.34失败及首次87P1snapshotF均保；MOTION_TIMELINE_DURATION_RESULT.md明确不是正式安装或真实人物新增UAT。

研究typed观察驱动仅test，目前原3业务场景仍3FAIL：已越过旧JSON.parse首尾片段问题，后续实际采纳缺正常账号父组，以及两项continuous冻结预算与原隐式有限fixture冲突。18新增严格驱动控制通过；完整JSON损坏/标记变体/身份位置/正文可见首尾/副作用/错误HTTP类型仍拒绝。真实模型首12000来自完整可见证据数组，下一短窗完整schema且同source/snapshot/offset；没有从DB或账本补给模拟模型。两处明确公开账号与显式预算装配候选另见RESEARCH_CURRENT_FIXTURE_RECOVERY_PROPOSAL.md，尚待裁决，不直接改partial expected。

最新全局审计总数仍只引用已执行reconcile25errors/1warning；口播/工具入口的后续真实成功不能未经reconcile就自行扣减全局错误。scope仍在补证，不消耗T1072末round3、不造新PASS。


观察驱动隔离提交eae717e97cf308f9b01db8839cf819e574df1314已经完成。原46+新18按maxWorkers2/retry0真实完整64为58P6F0skip/149.80秒，原46为40P6F：研究原3+Redfox3实际timeout。首错误扩清单72结果和原beforeAll5未运行均保，不把控制通过当业务通过。后台tsc末轮0。RESEARCH_VISIBLE_OBSERVER_RESULT.md与result.json含源码/补丁/log精确指纹。

主控核Growth正式GD§5/§10 SHA62c0754...与真实cycle2round2后仅授权T1072第47行原一句身份同期，SPEC现在971a503642f67e92b5343772d96abc6800ba74814c014b30fdfb6b486e866f7b。native/wire/代码不变，准确分register_device商品scope后本人原授权profile、link_owner来源唯一profile；仅本T1072身份规范下游待自身独立末recheck，manifest局部invalidated/not-run，未改T915或reviewevents。T1072_GD_SCOPE_SYNC.md保准确前后hash与字段。


Redfox后续资源对照同eae717e9原源码/所有原期限，单独maxWorkers1/retry0真实原5全部通过，80.57秒exit0。原并行timeout与完整64FAIL仍保，不能分项替代整套。研究3仍真实待裁决；没有新模型/工具协议行为实现。


## 研究精确输入恢复与转写部分闭环调查更新

研究公开账号同事务父组和显式 maxSteps/maxTokens 装配经主控精确授权后，唯一测试代码提交 af34bef454d4bab319e75806c068b9f3a7f8bf3f。应用前同原输入完整64为61P3F/0skip/32.82秒；应用后原research3为3P（18仅filter未选），准确原46+新增观察18完整64为64P0F0skip/40.23秒exit0，后台tsc0。源码SHA5447901af5779b4896191a3d1e1f8a403f0ca56b84a307d838aa7e4f8e914990，两处输入/op摘要确有变化，不声称逐字原输入不变；原业务expected/预算20/10/8与6/5/4调用和安全反例保。详RESEARCH_CURRENT_FIXTURE_RECOVERY_RESULT.md及原RED/GREENlogs。上文研究未迁3FAIL与并行资源FAIL作为前态保，不替代当前64真实结果。

转写仍原30为19P11F，完整170仍159P11F/36.90秒exit1，未更改任何待裁决终态expected。TRANSCRIBE_PARTIAL_WIRE_COMPAT_PROPOSAL.md本次只读补齐任务结果、项目稿面和准确恢复：producer-only会让没有稿的失败源因整批publicsucceeded被Draft判done并隐藏按钮；现partial只能刷新，控制key未持久回执，普通projects.transcribe只合并同project单来源在途，no-project恢复会直接skip。已列精确非breaking候选及独立待裁决范围，未改producer/UI/Worker/contract/terminal，未用T915draft实施，未消耗T1072末round3。历史全front/nativeHTTP不代表新增恢复已验。
