# CreatorOS 任务看板(BACKLOG)

> **单一执行真相。每个会话必读(SessionStart hook 自动注入)。** 规则见 `CLAUDE.md` 的「任务流程铁律」。
> 状态:📋 待办 · 🔨 进行中 · ✅ 完成 · ⏸️ 搁置 · ⛔ SPEC 审核 FAIL(没过审不准开工)。
> 读取顺序:**本看板 → 任务引用的 SPEC → 代码**。
> 铁律:需求即任务(提了就建);开工从看板顶取;做完改状态+提交;**禁止 P0/P1 分级、禁止多阶段执行**,任务清楚即起 Workflow/并行 subagent 一次做完。

## 🔨 进行中 / 📋 待办(按执行顺序,从上往下取)

|ID|任务|状态|审核|验收|文档|一句话|
|---|---|---|---|---|---|---|
|T-1402| 历史激活码无感升级模型权益与原授权恢复 |🔨| PASS[REV:d3792db71858] |待验|[SPEC](docs/features/t1402-legacy-license-one-click-upgrade.md)| 用户最新要求无需点击，桌面启动自动核对升级；原按钮实际已恢复并复用原钱包，修状态联动与自动生命周期。原期限/次数/钱包/有效绑定保护不变，新增合同待独评，本地打包安装沿用授权。 |
|T-1401|修复 AI 额度连接错误被通用不可用提示掩盖|✅|—|—|[SPEC](docs/features/t1401-ai-credit-link-errors.md)|保留配置错误分类与重试语义，验证开发接口，删除临时诊断；仅本地提交，不push。|
|T-1400|修复选题 Copilot 长候选采纳区裁切|⏸️|—|待验|[SPEC](docs/features/t1400-topic-adoption-scroll.md)|四来源 mock 回归、补齐弹窗 flex 高度链；不真实调用、不push，补丁交付。|
|T-1399|固定侧栏 AI 助手页脚与收拢入口|⏸️|—|待验|[SPEC](docs/features/t1399-sidebar-assistant-footer.md)|仅调整助手卡片与测试，保留全部导航、折叠及原 Copilot 参数；指定回归、补丁交付，不push。|
|T-1398|修复 Copilot DeepSeek 强制工具请求、失败重试与错误诊断丢失|🔨 待办|—|待验|[SPEC](docs/features/t1398-copilot-deepseek-failure.md)|用户授权最小修复、相关测试与补丁交付；不真实调用、不读密钥、不修改许可激活签名、不push。 第四轮补 DeepSeek 推理历史回传与缺失历史关闭思考；第三轮补发送前明确失败结算与日志；当前源码 mocked DeepSeek 定位成功，历史 exact exception 未复现，任务保持未完成。|
|T-1397|修复main Verify并核实已知失败|🔨|—|—|[授权与验收](docs/features/t1397-verify-main-green.md)|用户授权契约漏登记、后端CI终止根因、完整本地测试与逐项known清单；6144串行类型检查及各包质量门，HTTPS普通推送并最多2轮追加修复，报告至terminals/ci-green。|
|T-1396|清理启动恢复留下的旧版及数据副本|✅|—|—|[授权与范围](docs/features/t1396-local-recovery-backup-cleanup.md)|已按授权删10处旧App/旧DMG及数据副本，逻辑12.14GiB；当前App、正式数据、新DMG均保留，原进程与首页200通过；轻量证据保留。|
|T-1395|用当前源码重打本地包并保留数据恢复启动|✅|—|—|[授权与验收](docs/features/t1395-local-package-startup-recovery.md)|源码7252d30d5本地包已安装，58测试及DMG/签名通过；副本迁移与实际库核心内容保留通过，原生首页正常且保持运行；旧App/原库已备份，不发布；quick仍既有22/17。|
|T-1394|排查本机CreatorOS启动失败并核定恢复路径|✅|—|—|[诊断范围与验收](docs/features/t1394-local-startup-diagnosis.md)|已定位T1382实测把原库升0139，旧App仅0137/0138；冷快照保全，当前源码副本只读兼容PASS；失败App已退出，未重打包安装/恢复启动，需匹配新包；quick仍既有22/17。|
|T-1386|提交质量门并合并远端main后普通推送|✅|—|—|[授权与验收](docs/features/t1386-quality-main-integration.md)|2026-10-22续授权：保留双方任务与stash，审查剩余改动，排除私密/临时文件，分组提交并普通push；gitleaks零发现，quality/boundary及quick对账不劣于原基线。|
|T-1380|解除协作者本地Mac完整构建对作者私钥的依赖|⏸️|PASS[REV:fade0e6a2c0c]|—|[独立本地构建范围](docs/features/t1380-independent-local-mac-build.md)|用户已明确取消Local方案并要求回退；本任务产品/脚本改动已私有保全后撤回，未产包/安装；原R1仅历史，不冒完成。|
|T-1379|核对协作者Mac本地完整包的条件与正确操作|✅|—|—|[只读操作说明](docs/features/t1379-collaborator-local-mac-package-guidance.md)|只读核本地ad-hoc/可选updater与必需root/verdict，保T1378在途；无本机再构建/安装或共享私钥。|
|T-1378|诊断每日观测HTTP422与接收端固定清单兼容|🔨|PASS[REV:48c6e24fa806]|—|[原拒收与隔离范围](docs/features/t1378-observability-http-422-registry-diagnosis.md)|10/20原422/待发1563保；合成跨端RED确认两已登记ID不兼容，Growth T248三文件本地39PASS/非作者及补丁实用独审PASS；原stage/body、发布及owner待核，不催传/追签首因，见t1378/RESULT。|
|T-1385|修复 Verify 的 Node 堆内存耗尽|🔨|—|—|[SPEC](docs/features/t1385-verify-ci-memory.md)|用户授权最小 CI 修复：两个 job 6144 MiB 堆、串行 typecheck；本地全检查及内存测量，不改许可/激活/verdict/签名，不push，交付补丁与本地提交脚本。|
|T-1393|按真实密度重排内容雷达三栏|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1384.md)|用户授权沿ui-ux-pro-max与MASTER重排11来源/5分类/40作品；1440与1280保留三栏、缩略图、紧凑状态与筛选，保功能及详情唯一升级入口。当前分支本地提交或补丁脚本，不push。|
|T-1392|重新规划内容雷达三栏与来源操作布局|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1383.md)|用户授权使用ui-ux-pro-max，1440px来源完整、三栏重排与窄窗降级；保留全部功能、详情04唯一升级入口、分组卡片与未知状态。补vitest/typecheck，当前分支本地中文提交或补丁脚本，不push。|
|T-1387|统一主导航宽度并恢复选题页1440px完整布局|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1378.md)|用户2026-10-21明确：intelligence/topics侧栏统一约224px，选题右侧03/04完整显示；遵守MASTER，补vitest，独立中文commit至当前ui-fixes分支、不push。用户已允许跳过缺失技能；按本项SPEC执行并如实记录验证边界。 实际结果 / RESULT.md [RESULT](docs/features/ui-fixes-2026-10-21/RESULT.md)|
|T-1388|修复项目页首开自动滚动到口播脚本|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1379.md)|用户2026-10-21明确：定位autofocus/scrollIntoView/hash根因，首开停顶部项目准备，保留主动去写稿#script；补vitest并独立中文commit。用户已允许跳过缺失技能；按本项SPEC执行并如实记录验证边界。 实际结果 / RESULT.md [RESULT](docs/features/ui-fixes-2026-10-21/RESULT.md)|
|T-1389|补全选题来源中文标签与未知值兜底|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1380.md)|用户2026-10-21明确：candidateSource的trend/benchmark/demand/idea/favorites全部中文，未知值兜底；补vitest并独立中文commit。用户已允许跳过缺失技能；按本项SPEC执行并如实记录验证边界。 实际结果 / RESULT.md [RESULT](docs/features/ui-fixes-2026-10-21/RESULT.md)|
|T-1390|移除雷达作品卡片重复的升级为项目按钮|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1381.md)|用户2026-10-21明确：只移除ItemCard入口，保留作品详情04选定方案入口；补vitest并独立中文commit。用户已允许跳过缺失技能；按本项SPEC执行并如实记录验证边界。 实际结果 / RESULT.md [RESULT](docs/features/ui-fixes-2026-10-21/RESULT.md)|
|T-1391|容错雷达作品未知转写状态避免整页崩溃|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1382.md)|用户授权未知transcript.status显示“状态未知”，避免整页ZodError；五项frontend typecheck/vitest，保留T767失败与既有lint，授权/激活/verdict/签名不变。技能缺失处理、完整原文与实测边界见原SPEC、RESULT及编号映射。|
|T-1374|查明并恢复所有已绑定媒体的既有数据展示|⏸️|PASS[REV:16648a3ea984]|待验|[逐平台完整恢复范围](docs/features/t1374-all-bound-platform-data-recovery.md)|本轮仅补三测试/seed，52+3+双窗2通过、prod0改；安装仍旧2d未交付，视频号原EXPORT_FAILED/0页且native0/site-safety受阻，已block不冒全部恢复；full未跑/T1373保。|
|T-1369|修复首页平台筛选后的连续侧栏导航卡死|🔨|PASS[REV:e8916b9b3f96]|待验|[连续导航范围](docs/features/t1369-dashboard-filter-sidebar-navigation.md)|旧R3收据仅绑定6f8114；用户已明确允许本次新夹具单次cycle，真实DEC136909保，正式新cycle尚未记录；production01–03均前置FAIL、03残PG已后清理，04未执行/未证修复，本轮先整合代码。|
|T-1373|核对完整对账中真实CLI的用户目录与联网副作用|📋|待审|待验|[当前安全阻断](docs/features/t1373-reconcile-cli-side-effect-isolation.md)|102完整对账预检发现LED053原CLI未隔离，存在HOME配置写/更新安装可达；先只读登记，不冒新full、改旧门或补旧receipt。|
|T-1367|恢复视频号折叠导航下的报表入口|⏸️|PASS[REV:c7a98f074848]|待验|[事实与候选范围](docs/features/t1367-wechat-video-collapsed-navigation-entry.md)|665受控实现与验证已整合，真实owner/采集恢复UNKNOWN且site-safety受阻已block；T1368后验不代恢复，原full58与旧失败保，不绕行/新collect/打包安装。|
|T-1366|核对导航诊断新增的旧宽路径收据失配|📋|待审|待验|[收据根因边界](docs/features/t1366-navigation-diagnosis-wide-receipt-drift.md)|2d完整56ERROR含本次T1354/source与T1356/persistence新宽收据漂移，T1294既有身份亦有新增交叉；与旧44、clean候选缺旧产物及两新LED后验环境失败分证，不洗旧PASS。|
|T-1360|核对本批绑定首页与切组变更导致的旧宽路径收据失配|📋|待审|待验|[根因边界](docs/features/t1360-current-binding-dashboard-receipt-drift.md)|最终44ERROR含新增1345/1347及1348/1346/1350宽收据失配，按实际消费者分证；不归旧32项、不洗旧PASS或全量模型重跑。|
|T-1358|核对隔离首页首次装配与组读取长耗时|📋|待审|待验|[观察边界](docs/features/t1358-unselected-home-readiness-latency.md)|19d无group首页9.2分钟、1db带group首次导航120秒失败后200约2.5分钟；组query日志139秒与装配分证，首因未证，不冒真实空新用户或旧App回归。|
|T-1353|核对本轮工作区与日报接线导致的旧宽路径验收收据失配|📋|待审|待验|[新失配根因](docs/features/t1353-current-batch-legacy-receipt-drift.md)|843审计确认1343/1342/1341/1338/1330/1328/1324旧全文件收据失配由本轮新字节触发；与1298/1296等开工旧债分列，按真实消费者影响处理，不冒旧功能全程重验。|
|T-1351|核对账号管理进入组与驻留视频宿主的离开保护边界|📋|待审|待验|[源码风险登记](docs/features/t1351-manager-video-leave-guard-risk.md)|只读审计发现manager进入组不显式requestVideoLeave；宿主保旧scope，不冒丢稿/越权。先隔离公共证明实际用户风险，再定是否需要窄修。|
|T-1349|修复项目列表窄桌面首列标题归零与右侧动作裁切|📋|待审|待验|[公共失败与基线](docs/features/t1349-project-list-responsive-columns.md)|本轮冻结候选两视口标题可见断言120秒失败；原项目页全文件与88945相同，固定列宽挤掉标题，单独登记不冒本轮已修。|
|T-1336|核对校准结果到经验置信度的既有反馈预留|📋|待审|待验|[当前no-op与旧OQ3事实](docs/features/t1336-calibration-learning-confidence-bridge-observation.md)|自动调整经验置信度仍未接入，现有预留非本轮回归；仅登记调查，不START/不改7f1，手动Learning回流另验。|
|T-1333|明确结构表脚本历史来源读取兼容|📋|待审|待验|[结构表历史来源既有缺口](docs/features/t1333-structured-script-history-source-compatibility.md)|确认稿reader读得到结构表正文，旧workSource schema1历史正文为空且digest原样；无旧成功证据，单列未支持族不扩本轮产品。|
|T-1321|诊断图文重新组织与手动校正未形成可采纳候选|⏸️|PASS[REV:271af53ebf46]|待验|[原U14真实失败待核](docs/features/t1321-graphic-reorganization-candidate-diagnosis.md)|两原终态无结构化可采纳候选，安全日志仅知executeExternalTaskTool冲突；先只读及受控诊断，具体tool/input/断言未知，不猜测修复或重发原任务。|
|T-1300|恢复Codex各能力可用性并落实已定位性能优化|⏸️|PASS[REV:6094ba8d7ed5]|待验|[本轮实现及分模块验收](docs/features/t1300-codex-functionality-and-performance.md)|用户授权实施T1299建议并重点复验选Codex后的对话/功能；先核真实配置路由与各能力，再窄修及优化，专用隔离数据，不批量销旧账、不安装发布。|
|T-1297|修复原生时间轴缩放滑块被全局方向键拦截|📋|待审|待验|[T1296追加键盘复验](docs/verification/t1296/REPORT.md)|既有capture热键未避让role=slider，ArrowRight未改缩放；真实鼠标拖动持久化正常。保留失败，单独核修键盘边界。|
|T-1292|核对合并后的全局对账失败并逐项归因|📋|待审|待验|[原32项现场失败](docs/features/t1292-post-integration-global-reconcile-findings.md)|原历史失败保留；T1300本轮32ERROR=原29身份+T1294/1296/1298 frontend收据路径漂移，精确原输出与归因引用见SPEC新增段；不重绑旧PASS、不冒全功能通过，身份相同不代根因相同。|
|T-1291|核对旧原生编辑器验证器与当前715源码库存|📋|待审|待验|[原额外验证真实失败](docs/features/t1291-legacy-native-verifier-source-inventory.md)|旧manifest及710模块/合同复制哨兵与715漂移，隔离组合仍FAIL；不补假模块/洗validator，不在固定本地包调用链，保独立欠债。|
|T-1289|修复原生构建清单随解包目录深度变化|🔨|PASS[REV:92eba9d78497]|待验|[归档重建真实差异](docs/features/t1289-native-build-graph-virtual-module.md)|715源/F0一致，六runtime产物一致，第七清单虚拟module路径随目录深度变化；原FAIL保留，只核机械ID与归档元数据，不只补生成JSON。|
|T-1288|校准合并剪辑后的两个契约测试库存|🔨|PASS[REV:cf5a6070b2b5]|待验|[当场43项库存失败](docs/features/t1288-integrated-editing-contract-inventory.md)|R全契约43FAIL/475PASS保留；只核两个原测试427→429与已审script read/propose两路径，不改产品或放松穷尽。|
|T-1287|闭合Growth全量回归的旧夹具与隔离缺项|📋|待审|待验|[真实全量失败与边界](docs/features/t1287-growth-full-regression-fixtures.md)|原Python9FAIL/1189PASS、Node10FAIL/270PASS与对账10ERROR保留；0076启动head已窄修28PASS，余5测试/3hooks和Node实际清单先独审，不改经营安全来洗绿。|
|T-1286|校准模型来源接线后的旧前端集成夹具|🔨|PASS[REV:be715ef3b46d]|待验|[当场30项测试接线失败](docs/features/t1286-model-routing-frontend-fixtures.md)|全frontend31FAIL保留；仅三原测试30项，忠实legacy GET与固定110库存；旧write真实同步缺陷交T1278，不改产品或吞范围外radar1。|
|T-1283|核对Codex账号工作区路由预检拒绝并恢复粗剪|📋|待审|—|[真实预检与失败边界](docs/features/t1283-codex-account-routing-preflight.md)|新安全完整预检5RPC成功且两个host退出0；新独立作品真模型粗剪/试听门/采纳刷新PASS，仅删停顿0.96秒。原unknown保留，拒绝根因未复现，不改配置或自动重发。|
|T-1279|接入模型来源新迁移的真实数据库谱系护栏|🔨|PASS[REV:3056f3673e0a]|待验|[当场初始化失败与窄范围](docs/features/t1279-model-routing-migration-lineage.md)|原6FAIL保留；0135固定谱系窄修独评3056通过，W e81f80cf7完整PG/PGlite三组73PASS、退出清理闭合；主任务全功能与全局收尾未完成。|
|T-1278|统一激活授权并允许官方、自配和本地Codex按能力组合|🔨|PASS[REV:c23accf0a926]|待验|[用户需求与验收](docs/features/t1278-unified-license-capability-routing.md)|cycle2独评583a通过；W03d60d39/Gbbf225eb已提交，Creator145/91/76、Growth122/销售23通过；设置浏览器15项retry0留图；全frontend原31与新4FAIL保留，新4串行14绿；R四包类型通过、合并回归在验；收尾两项用户已确认，cycle3新审在途；整包/App未验。|
|T-1276|修复原片准备事务内根设置连接自等待|⏸️|PASS[REV:f677c9cdf3ed]|待验|[当场超时与窄范围](docs/features/t1276-production-source-transaction-runtime.md)|cbe8ec195同tx修复、原请求probe/采纳及完整媒体旅程、真实偏好冻结已验；最新build/类型/timeout通过，全局仍原29ERROR；严格回执关联3个共享dirty路径，已登记阻断。|
|T-1275|排查剪辑验收隔离服务冷编译与数据库初始化超时|⏸️|—|待验|[实际阻断与范围](docs/features/t1275-editing-verification-runtime-timeouts.md)|原两轮超时保留；隔离服务/真实公共媒体旅程已恢复，最新build/类型/timeout通过，全局仍原29ERROR；严格frontend回执关联5个共享dirty路径，已登记阻断，不代签纯HEAD。|
|T-1274|参考ChatCut可复用模块重设计CreatorOS剪辑工作区与自然语言剪辑链路|⏸️|PASS[REV:55a3f14a70a5]|待验|[SPEC](docs/features/t1274-chatcut-editing-redesign.md)|真实模型删除/重排复制、ASR词删、粗剪试听采纳、CLI/MCP/MP4、200%/dirty及T1285原CAS恢复均有证据；最新build通过，严格收尾仍有19个共享dirty路径，未代签纯HEAD或安装App。|
|T-1277|核对原生AAC首尾有效样本与音画对齐|📋|—|待验|[当场旧内核对照](docs/features/t1277-native-aac-valid-samples.md)|旧83b与新候选AAC真实PCM逐字节相同，48@24画面2秒而AAC2.0898秒；保留原FAIL，先核priming/padding，不裁原音或冒全范围PASS。|
|T-1273|CreatorOS反逆向加固严格零性能损耗|🔨|PASS[REV:f993e9496349]|待验|[SPEC](docs/features/t1273-release-anti-reverse-hardening.md)|仅7基线源码已落地，隔离9c70afc00+c98e7a958；既有Node10/Rust7/打包45通过，末笔新回归未跑；tar减37,607,996B/既有根104B签名；用户10/14暂缓验证，构建中断留缓存，App/200μs/总包未验；见t1273/RESUME。|
|T-1271|CreatorOS Codex调用不保存个人历史会话|🔨 待办|PASS[REV:b5247eee4711]|—|[用户确认与会话边界](docs/features/t1271-codex-ephemeral-sessions.md)| 两源临时会话已应用；共享100/100、owned31/31与类型/build/timeout/边界通过，提交2ab097673；全局对账在途，当前App未换包，原失败与限度见t1271/RESULT。 |
|T-1265|修复本地Codex结构化输出Schema适配导致真实400|🔨 待办|PASS[REV:54a830e5bcfc]|待验|[实际故障与范围](docs/features/t1265-codex-structured-output-schema-compatibility.md)|T1246当前新故障，原证据与失败保留；窄审后集中修复及完整公共链复验，原模型配置/归属与App未验不变。 新R f966公共provider19/Worker114实际PASS，但完整worker typecheck TS5097及异构schema泛型TS2345红已记；只在已审同域回归写集校正导入/泛型，原19断言及生产保持。|
|T-1264|修复协议账本读取前Next元数据恢复顺序|🔨 待办|PASS[REV:363fd9378c93]|待验|[实际故障与范围](docs/features/t1264-protocol-ledger-next-closure-order.md)|T1246当前新故障，原证据与失败保留；窄审后集中修复及完整公共链复验，原模型配置/归属与App未验不变。|
|T-1263|修复协议验收替身与隔离临时根的归属校验冲突|🔨 待办|PASS[REV:b4fda4422df6]|待验|[实际冲突与范围](docs/features/t1263-protocol-fixture-owned-temp-root.md)|db4669协议组提交disabled且无task；fixture os.tmpdir与launcher owned tmp前缀冲突，保原七项FAIL/栈缺失，独评后窄修归属守卫并公共链完整重验，不代签真实模型或App。|
|T-1272|校准新增观测后的前端回归夹具与迁移库存|🔨|PASS[REV:57f7140fcca6]|待验|[当场六项夹具红](docs/features/t1272-current-observability-frontend-test-fixtures.md)|当前0134末条及新共享getter使旧frontend6红；只审两原测试，保81设置/4完整冻结Worker回归，Main109与R108分开，不改产品或删错误。|
|T-1270|校准当前观测迁移后的原回归库存|🔨|PASS[REV:ed99956c0313]|待验|[当场三项库存红](docs/features/t1270-current-observability-migration-test-inventory.md)|当前合法0134使journal109，原三尾库存断言仍108；只审两原测试并保旧迁移/归属/前缀，不删foreign生产，Main与108打包树分开绑定。|
|T-1268|闭合集成契约测试库存与手工保存类型|🔨|PASS[REV:b9d6a2958cc7]|待验|[当场43失败与类型红](docs/features/t1268-integrated-contract-inventory-and-manual-save-test.md)|只补三原测试：已有日志三operation穷尽登记、428库存与原manual strict parse；不删功能/断言，保当场FAIL，全量正常复验后续新包。|
|T-1267|校准Pi公共聊天验收能力键与HTTP最终审计|🔨|PASS[REV:cc01d69f8185]|待验|[真实夹具失配与范围](docs/features/t1267-pi-public-fixture-capability-and-http-audit.md)|原Pi任务waiting_user/HTTP数UNKNOWN保；项目主能力topic.generate而夹具配copilot.assist，独评后只修夹具与finally审计，不改产品resolver或旧任务，新公共红绿及新包复验。|
|T-1266|核对并修复设置偏好首载时ASR菜单不可达|🔨 待办|PASS[REV:bda5b2a67bbd]|待验|[真实失败与窄范围](docs/features/t1266-asr-menu-preference-layout-race.md)|原93普通Qwen点击120秒失败，异步模型区插入后菜单出屏；保原FAIL，oil局部公共对照复现、独评后最小修复，不猜全局浮层或增加模型配置。|
|T-1269|补齐原持久分场失败的可读诊断与原任务重试验收|🔨|PASS[REV:03376b43b303]|待验|[原14失败与精确范围](docs/features/t1269-managed-video-failure-diagnostic.md)|持久failed在onRuntime后停轮询，只有legacy诊断卡；保原FAIL及旧恢复断言，独评后窄补同ID脱敏错误与公开retry复验，不造新任务或放宽状态。|
|T-1261|修复开发包验收暴露的运行时缺陷与用例合同|🔨 待办|PASS[REV:cd5f6ec85eda]|待验|[实际故障闭包](docs/features/t1261-runtime-acceptance-defect-closure.md)|T1246后续轮确认native结果/状态ACK/选题确认/Copilot/Doocs缺陷及旧聊天fixture失配；原回执保，独立初评后9源集中修、便携回归、新包全量复验，App未验。 Pi新隔离公共提交前双输入严格定位冲突（0任务/本轮HTTP0）已记，helper按唯一AI助手dialog窄审；不冒目标能力RED。 新Pi同四ID公共聊天实际提交后执行准备failed/CHAT_WORKER_INPUT_UNAVAILABLE、calls0/HTTP0且完整关闭；底层cause未记录，目标能力RED未证，保本轮失败待私有诊断；R整合34源及1测试类型修正clean64ca6ad；开发包45基础/8全绑定/只读挂载实通过，完整浏览器复验待完成。|
|T-1260|核对T1255审核绑定生成PROJECT造成收据漂移|📋|—|—|[实际对账失败](docs/features/t1260-generated-project-review-binding.md)|T1259完整对账26ERROR，25与旧回执逐字一致；另T1255绑定动态PROJECT已过期，保旧审核和事实，不重哈希洗绿，核稳定宪法与真实重新评审。|
|T-1259|排查用户1.12版扫码绑定与配置同步异常并修复确认缺陷|✅ 待办|—|—|[排查与修复范围](docs/features/t1259-user-binding-config-repair.md)|用户确认1.12为当前、1.11为旧版；核版本与实际失败链，缺陷先RED再修，保原账号登录态与校验，不重发真实任务或发布。|
|T-1258|分析用户2026-10-12四份加密运行日志异常|✅ 待办|—|—|[诊断范围](docs/features/t1258-user-log-diagnosis.md)|仅本地只读解密四份附件，按时间与影响分析失败、恢复及证据缺口，不改产品、不重发用户任务。|
|T-1257|将当前已安装版本制作本地签名安装包|✅ 待办|—|—|[范围与验收](docs/features/t1257-installed-local-signed-installer.md)|用户明确只做本地签名、不提交Apple；冻结当前安装1.2.0 arm64副本，保运行时字节，签名封DMG与挂载核验，不重建未提交源码。|
|T-1255|加密日志直传Growth、异常采集与运行指标观测|🔨 待办|PASS[REV:7e54d5d28829]|待验|[原直传合同](docs/features/t1255-reporting-full-delivery.md) · [观测方案候选](docs/features/t1255-observability-research.md)|10/21公开get原观察超600秒未取回执、仅停自有CLI，今日上传状态未知；保10/18真回执、10/20所见422及T1378/Growth T248本地39PASS候选，owner/完整解密/指标待核，不催传或签完成，见desktop-agent-live/RESULT.md。 |
|T-1256|修复Doocs静态原适配三处无用绑定编译失败|🔨 待办|PASS[REV:b3d116e19a48]|待验|[真实类型红与精确范围](docs/features/t1256-doocs-static-unused-bindings-build-closure.md)|T1254 V13两根24/slow/types及nativebuild已过，static完整原build三TS6133真失败；仅核并删三无用声明，保模板/原命令/旧FAIL，独评后续原余步骤。|
|T-1254|闭合内置Doocs两份真实请求30秒默认预算与源码交付一致性|🔨 待办|PASS[REV:1ebe2f90de0b]|待验|[当场两红与待评边界](docs/features/t1254-doocs-request-budget-and-source-closure.md)|完整Gate剩两真实网络abort；先核共享fetch原源/两包/使用路径与重建来源，独评后修，不扩动画豁免或只改产物洗绿。|
|T-1253|闭合原Worker夹具可信回执与未知恢复验收|🔨 待办|PASS[REV:e890e7d4ffac]|待验|[真实8红与精确范围](docs/features/t1253-worker-fixture-receipt-and-unknown-closure.md)|原9文件46例38PASS8FAIL；仅ports/hooks/draft三原测试，核429 superseded、partial与缺usage unknown，先独评不改生产/洗期望。|
|T-1246|整合完成会话并打开发包及浏览器和App逐项验收|🔨 待办|PASS[REV:883f7fe733ba]|待验|[需求与验收标准](docs/features/t1246-integrated-dev-package-acceptance.md)|64ca开发包保留；原浏览器77/170快照71PASS6FAIL，余93UNKNOWN；旧临时根/PID已不存在，不能冒正常关闭，须新隔离复验。缺原素材六项按用户跳过，App未验，不签全绿。|
|T-1252|闭合CLI/MCP HTTP默认300秒早于合法原生RPC的消费者预算|🔨 待办|PASS[REV:5ceaed23e00c]|待验|[真实缺口与待补合同](docs/features/t1252-cli-http-consumer-budget-closure.md)|真实Node25.9/Undici默认300s而Native完整RPC420s；先盘点专用非全局transport、完整串行与取消/unknown，再独评和实际慢公共链，不用父测试预算代签。|
|T-1250|闭合真实短执行预算与静态消费者误判|🔨 待办|PASS[REV:73326e8df3e3]|待验|[精确范围与验收](docs/features/t1250-positive-timeout-consumer-closure.md)|两次完整门真实22FAIL：11正执行/观察、1idle与10vendor误报；先独评，保原deadline/取消/归属/未知与完整库存，再公共链复验。|
|T-1251|保留结构化生成可信失败状态并校准原受控崩溃验收|🔨 待办|PASS[REV:41b45f1c67d4]|待验|[实际9红与精确范围](docs/features/t1251-chat-generation-failure-and-fixture-closure.md)|真实原21中9红；429可信retry_wait丢失为unknown生产缺陷，另串行屏障/跨case污染与continuous入口待窄校准，先独评不洗期望。|
|T-1249|校准持久聊天原八例的当前受控回执合同|🔨 待办|PASS[REV:19cbaf3743b6]|—|[精确合同](docs/features/t1249-durable-chat-current-receipts.md)|真实原8例3PASS5FAIL；只校准五族新读/重放、末失败partial与账本UI投影，不改生产或删除原安全断言。|
|T-1247|修复超时门完整Git库存读取缓冲区溢出|🔨 待办|PASS[REV:b75c6d75921d]|—|[精确范围](docs/features/t1247-timeout-git-inventory-buffer.md)|T1246真实Gate在git ls-files的默认1MiB缓冲ENOBUFS；独評只增有界缓冲与120秒命令预算，保原规则/完整扫描/非零失败。|
|T-1248|恢复已知旧冻结系统候选工具的严格合同兼容|🔨 待办|PASS[REV:2d9887301cb3]|—|[真实失败与精确合同](docs/features/t1248-frozen-system-action-compatibility.md)|真实旧104→当前133原4例1PASS3FAIL，旧preferences action新增引擎字段哈希漂移；只内置可信固定旧schema，完整工具定义/归属/回执保护不降级，先独評。|
|T-1238|本地Codex统一执行文本与生图并免独立模型配置|🔨 待办|PASS[REV:6b70a2a85595]|待验|[用户确认与合同](docs/features/t1238-codex-unified-text-image-engine.md)|用户明确继续实现：Codex承担文本与生图，页面/子任务/后台统一路由，无供应商回退；先独评合同，保旧任务与原失败。 已整合本地源码；独立工作树taskctl严格完成77b939320ddf，共享43项/真实10项通过。他人未提交改动保留，不代签共享HEAD；见GATES。|
|T-1245|修复自动化窄窗口筛选挤出与任务查看不便|🔨 待办|—|待验|[原图与范围](docs/features/t1245-automations-narrow-layout.md)|3938操作PASS但390原图账号下拉挤出、快捷标题逐字；保原结果，oil最小响应式独评后修，不删功能或代签窄屏可达。|
|T-1244|验收自动化立即运行的准入与授权等待|🔨 待办|—|待验|[公开链与验收](docs/features/t1244-automation-run-now-login-wait.md)|现四浏览器case仅禁用列表，runNow UI尚未验；fresh无绑定账号一次真点，核同run/AI/execution和授权等待，先独评，不把缺凭据签成采集成功。|
|T-1243|复验项目稿面视频素材的真实预览|🔨 待办|—|待验|[原失败与精确范围](docs/features/t1243-draft-video-preview-recheck.md)|原视频卡显示点击阅读，旧双击提示断言先失败；先核已确认单击/预览合同和预算，保URL惰性、真实解码、键盘/刷新/视口及原FAIL，不洗产品。|
|T-1239|验证复盘经验采纳与知识库回流并核候选裁决可见性|🔨 待办|—|待验|[范围与验收](docs/features/t1239-review-learning-public-acceptance.md)|旧experience独立页断言已退役；聊天采纳与持久candidate路径不同，先准确候选及独评，再实际UI/公开同ID/知识库只读，保原FAIL，不伪造评论或指标。|
|T-1241|排查复盘页浏览器验收时开发编译器崩溃|🔨 待办|—|待验|[真实日志与处置边界](docs/features/t1241-review-dev-compiler-panic.md)|3931公开创建四次200后review冷编译Turbopack Rust panic；保自然失败，先核锁定版本、缓存及进程归属，独评可逆处置后同源码另验，不改断言或猜业务坏。|
|T-1242|核对复盘刷新后纯组账号镜像的测试断言|🔨 待办|—|待验|[原失败与精确范围](docs/features/t1242-review-pure-group-cookie-assertion.md)|3933已到四张桌面/窄图，刷新后空账号cookie实际被清除，原断言要求空字符串；保FAIL，核真实消费者后独评空或不存在但严格拒绝非空账号，其余断言全留。|
|T-1240|复验素材选择器全库分页与真实照片操作|🔨 待办|—|待验|[原失败与范围](docs/features/t1240-asset-picker-public-recheck.md)|原140图上传PUT失败未到选择器；先准确诊断和预算独评，保140分页/错组/预览/取消/焦点/原FAIL，不改断言造绿。|
|T-1227|实际核验本地执行引擎全功能及免模型配置落地情况|⏸️ 待办|—|—|[验收范围](docs/features/t1227-local-engine-full-capability-verification.md)|用户已明确本地Codex；无文本配置仍有34条文本能力不可用，统一路由和全链实测未完成，保真实失败，不代签可用。|
|T-1228|核对审核和发布物料子任务的父执行partial结果|📋 待办|—|—|[当场失败](docs/features/t1228-chat-child-partial-verification.md)|T1227前端127PASS2FAIL；按索引定位为审核/发布物料empty空稿拒绝族，正常与准备恢复均PASS；核partial合同与旧父成功断言，不猜Codex或洗绿。|
|T-1229|核对内容雷达选题生成持续无效输出及检查点恢复|🔨 待办|—|—|[当场失败](docs/features/t1229-radar-topic-output-recovery-diagnosis.md)|3914原采集25条成功，选题仍OUTPUT_INVALID；保原任务/失败，先核真实账本、恢复与模型替身，未到项目升级。|
|T-1231|核对雷达升级项目后原账号读取404的范围分歧|🔨 待办|—|待验|[当场失败](docs/features/t1231-radar-promoted-project-scope.md)|3918正文生成后已导航新项目，原account header的projects.get却404；保原FAIL/图/trace，先核UI创建与读取真实组，不放宽归属或洗断言。|
|T-1233|校准雷达正文模型替身并验证正文真实贯通|🔨 待办|—|待验|[当场截图](docs/features/t1233-radar-body-fixture-protocol.md)|3919组内立项全程PASS，但实图正文是旧mock分析JSON；保原PASS/图，先核协议与公开正文/种子，再独评窄校准，不代签真实模型或洗产品。|
|T-1232|验证设置对话框分类交互与公开读回持久性|🔨 待办|—|待验|[原失败与范围](docs/features/t1232-settings-dialog-public-verification.md)|原设置整页/八横向tab断言与已确认Dialog冲突；先核获批分类操作、独评窄校准，保T606/原FAIL，不把七项现状当授权或mock当真实上游。|
|T-1235|修复外观密度关闭设置后刷新未恢复|🔨 待办|—|待验|[真实失败与修复](docs/features/t1235-density-reload-persistence.md)|3921外观例自然FAIL：紧凑已保存，accounts刷新html丢data-density；保原图/trace/120秒等待，修全局首帧与挂载恢复，不改原用例洗绿。|
|T-1236|修复模型保存并测试成功后界面结果丢失|🔨 待办|—|待验|[真实失败与诊断](docs/features/t1236-model-probe-visible-result.md)|3921模型put/probe和单次SSE均成功，界面测试结果却消失；先核保存刷新/组件实例与回执生命周期，不重发探针或改原断言洗绿。|
|T-1237|修复设置窄窗口分类栏挤压内容与裁切|🔨 待办|—|待验|[真实截图与范围](docs/features/t1237-settings-narrow-layout.md)|root实际看3921的390px昵称及RedFox图，分类固定宽度挤内容成窄列且裁切；保原操作PASS与原图，沿oil重新适配窄窗口，不用只操作成功代签视觉。|
|T-1234|验证账号组下Skill定制按钮的真实可用性|🔨 待办|—|待验|[静态疑点与验收](docs/features/t1234-group-skill-customize-availability.md)|服务组ctx投影accountId=null/groupId，UI仍按accountId非空允许定制；先核official/用户组覆盖合同并实际UI，不改owner/status或走后台造绿。|
|T-1230|修正素材空态仍宣称按抖音号隔离的旧文案|🔨 待办|—|待验|[实际截图与窄范围](docs/features/t1230-assets-empty-workspace-copy.md)|3915纯组B真实0素材，空态却写抖音号；保原图，窄改账号组文案，等待素材旅程结束后实施。|
|T-1226|补齐浏览器上传验收媒体目录隔离|🔨 待办|—|—|[诊断与范围](docs/features/t1226-playwright-media-root-isolation.md)|现仅隔离DB/auth，缺配置媒体根仍在用户目录；先独评默认env及测试根，不动HOME/迁移/真实库。|
|T-1225|补齐素材中心有数据画廊与选择详情的真实上传夹具|🔨 待办|—|—|[范围与验收](docs/features/t1225-assets-gallery-real-fixtures.md)|原两例空库无夹具；独评后公开上传四PNG，保原断言/失败，验选取详情、刷新、空态及错组。|
|T-1224|校准内容雷达公共旅程的短测试预算与证据输出|🔨 待办|—|—|[范围与验收](docs/features/t1224-radar-e2e-budget-evidence.md)|独评后仅校准测试预算及证据目录，再跑原公共旅程。 [原记录](BACKLOG-details.md#b-331e63446d8d)|
|T-1223|修复截图总览把历史运行记录当用例数及重复锚点|🔨 待办|—|—|[范围与验收](docs/features/t1223-verification-gallery-record-identity.md)|真实历史记录误计及重复锚点已独评，报告生成器正在RED/GREEN验证；保全部旧图/结果。 [原记录](BACKLOG-details.md#b-43efc28c7f95)|
|T-1222|核对文章图文编导的空态与功能指引脱离当前稿件|📋 待办|—|待验|[截图与范围](docs/features/t1222-director-context-guidance.md)|文章图文编导固定全局指引；真实editorTarget会在发送前准备。待核功能目录、独评和候选链。 [原记录](BACKLOG-details.md#b-7cb36965e02b)|
|T-1221|校准双工作区切换端到端旧账号选择器|🔨 待办|—|—|[范围与验收](docs/features/t1221-group-switch-e2e.md)|原两账号与项目、A-B-A刷新/镜像、双错组404实际3913通过；独评PASS，全局收尾待复核。 [原记录](BACKLOG-details.md#b-5c5bdde4c800)|
|T-1217|修复内容雷达来源任务在旧账号和冻结组范围间卡住|🔨 待办|—|—|[诊断与验收](docs/features/t1217-source-sync-workspace.md)|旧回归76及新增41通过；终审发现拒绝分类和删除绑定，负族修复中。 [原记录](BACKLOG-details.md#b-f2fe4887cb75)|
|T-1207|用 Playwright/App 自动化对全功能建立逐项验收并留图|🔨 待办|—|待验|[验收范围与路径](docs/features/t1207-full-feature-acceptance.md)|原全量120例73通过39失败8超时；继续逐功能隔离E2E留图，真人平台/模型及原生App另验。 [原记录](BACKLOG-details.md#b-50cf413f8280)|
|T-1208|复核T-1207暴露的浏览器功能失败并修复确认缺陷|🔨 待办|—|待验|[复核范围与验收标准](docs/features/t1208-t1207-e2e-failure-triage.md)|复现原39失败8超时；剪辑恢复/素材Tab等已有窄回归通过，其余逐例定因，历史失败全部保留。 [原记录](BACKLOG-details.md#b-ba8271fca89d)|
|T-1199|查明并修复账号组内其他已绑定媒体定时任务不可见|🔨 待办|—|待验|[SPEC](docs/features/t1199-bound-platform-scheduled-visibility.md)|用户本轮安装验收：其他已绑定媒体定时任务未显示。先公开只读核真实绑定、任务及页面筛选，再限定修复；保账号归属、原任务ID/排期/历史，不重开暂停研究或自动重复采集。|
|T-1200|整体重设计知识库工作区并统一新旧操作入口|🔨 待办|—|待验|[SPEC](docs/features/t1200-knowledge-workspace-redesign.md)|用户明确拒绝新旧UI拼接、未铺满与当前排版，要求整体重新设计。沿已认可原版品牌及oil-ui-pro，统一资料浏览、检索、阅读、录入、引用与经验入口，真实视觉/操作验证，不迁移或删除现有知识数据。|
|T-1201|核对知识图谱错误提示回归的旧原始异常断言|🔨 待办|—|—|[实际诊断](docs/features/t1201-knowledge-graph-error-contract.md)|T1200实际知识回归19文件148例中147PASS、1FAIL；原图谱测试期望原始无LLM凭据字符串，当前组件显示人话错误。保失败，先核真实错误合同，不削弱断言或改产品洗绿。|
|T-1202|核对自动化复杂排期编辑的旧术语断言|🔨 待办|—|—|[实际诊断](docs/features/t1202-automation-cadence-error-contract.md)|T1199自动化原回归113PASS6FAIL，五例为本任务多平台文案已授权变化，另复杂cron旧期待无法反解而实际已有用户友好说明。保失败，先核合同，不改时间或删除保存保护。|
|T-1203|消除自动化既有React编译与effect静态检查欠债|📋 待办|—|待验|[实际诊断](docs/features/t1203-automation-react-lint-debt.md)|T1199实lint触发旧effects/ref等错误，HEAD stdin基线也失败。保真实结果，新增依赖/声明先修，既有静态债单列；不得关闭规则或删切组/轮询保护洗绿。|
|T-1204|核对本轮全局对账29项失败及新增触发项|🔨 待办|—|—|[实际诊断](docs/features/t1204-current-reconcile-failures.md)|多次全局对账失败原日志保留；已机械归档完成行，稳定树仍需完整非concise逐根因核对。 [原记录](BACKLOG-details.md#b-577cb0da68f4) T-1238收尾实测保留22条范围外静态短超时、T-1026 write_set进度生成失败；完整全量对账原回执见docs/verification/t1238/reconcile-final.txt，禁止把本任务通过扩写为全局全绿。 本轮完整非concise55检查实完成29ERROR/自然1且资源全闭，25逐字旧债；新报LED046/048/054/061四门、innercause UNKNOWN，LED053实持守，见docs/verification/t1204/current-20261013-actual-full-29。 独占原四门诊断780通过/5失败/5原skip，4短预算及1握手前置；完整关闭/1694源不变，原全局29仍保，见current-four-original-diagnostic。|
|T-1197|核对旧外部MCP窄权限配对来源与当前账号组兼容|📋 待办|—|待验|[SPEC](docs/features/t1197-external-agent-pairing-source-convergence.md)|T1080独立分支审计实发现71d2cc77未投用配对源码缺口；原来源与27文件保留，先核授权/账号组/凭据及0101同号迁移，不恢复已淘汰ACP、不假称全CLI等价窄grant。|
|T-1196|排查新安装版启动配置同步502与运行摘要拒绝|📋 待办|—|—|[实际诊断](docs/features/t1196-installed-config-sync-502.md)|完整范围、失败与待验条件见 [原记录](BACKLOG-details.md#b-bc11f0a7b5b2)。|
|T-1193|核对结果待确认时的重复发送暗示与恢复状态可读性|📋 待办|—|—|[实际诊断](docs/features/t1193-copilot-unknown-request-presentation.md)|fresh视觉及独立receipt确认等待回执时同原话预填、生成disabled=false；POST仍1，未签重复请求。另核真实字号与短高分段阅读，先精确独评，不清新草稿或阻断合法创作。|
|T-1192|核对作品精调公共链的消息结果断言|📋 待办|—|—|[实际诊断](docs/features/t1192-work-editor-message-outcome-diagnosis.md)|当场公共链11PASS4FAIL；联合两例归T1092，另Pi/Codex精调完整output相等失败。先核可信回执投影与长候选正文，不删除回执/schema/完整性保护洗绿。|
|T-1191|核对编导发送前准备失败与恢复入口|🔨 待办|PASS[REV:ad518ff0cf03]|—|[实际诊断](docs/features/t1191-pre-submit-copilot-recovery-diagnosis.md)|T1187接口校准后原20例14PASS6FAIL；首条消息未发时准备错误提示自动恢复，effect却要求已有消息。核可信准备/提交状态及原任务恢复，不改名宽松化断言。|
|T-1189|核对聊天子进程状态与取消的七项当前失败|📋 待办|—|—|[实际诊断](docs/features/t1189-chat-worker-entry-current-state-diagnosis.md)|原LED054前25PASS5条件跳过、Worker30PASS、后66PASS7FAIL；核denied/unknown/revoked/login/pause真实状态和调用次数，不猜单一根因或放宽终态/取消。|
|T-1188|核对雷达活动任务期间的采纳保护断言|📋 待办|—|—|[实际诊断](docs/features/t1188-radar-active-task-adoption-test-diagnosis.md)|原LED042合同3/后端4PASS、雷达58PASS3FAIL；旧用例要隐藏采纳按钮，DOM实际disabled。先核已确认呈现与真实活动保护，不宽松断言、不改产品或guard。|
|T-1182|区分隐藏文件注入与真实上传按钮的刷新等待|🔨 待办|PASS[REV:456a0d53bb41]|—|[实验SPEC](docs/features/t1182-real-upload-button-control.md) · [研究卡](docs/research/t1182-upload-ui-refresh.md)|完整范围、失败与待验条件见 [原记录](BACKLOG-details.md#b-4b6be3609803)。|
|T-1181|核对真实素材上传成功后视频列表不可见|⏸️ 待办|PASS[REV:f8b0038f725b]|—|[实际诊断](docs/features/t1181-uploaded-video-list-visibility.md)|T1180新隔离随包浏览器当场139.349秒exit1；MP4已显示上传完成，精确文件名在素材列表等待120秒仍不可见。保原日志/驱动，先核真实页面、公开列表与刷新，不猜丢失或删除可见性保护。|
|T-1180|核对真实上传探针的File请求体字节测量失败|🔨 待办|PASS[REV:36946ee35804]|—|[实际诊断](docs/features/t1180-upload-probe-file-bytes.md)|T1179真实随包浏览器首轮21.852秒exit1；PNG创建/PUT/完成均200后请求体SHA断言失败，未写最终结果。保原驱动/日志，核SDK是否拿到body与公开下载SHA，不猜文件损坏或删保护。|
|T-1179|核对素材上传回归未触发完成接口的实际原因|🔨 待办|PASS[REV:13d0145a7fcd]|—|[实际诊断](docs/features/t1179-asset-upload-regression-diagnosis.md)|原LED022当场18PASS/1FAIL；旧E2完成接口0调用，当前上传已走workspace.capture而旧mock只拦全局client；先核真实scope/HTTP/上传与取消，不猜产品缺陷或绕过组权限。|
|T-1171|无损压缩当前超限任务看板|🔨 待办|—|—|[实际失败](docs/features/t1171-current-backlog-compaction.md)|当前健康门RUNAWAY；只用原受支持归档/详情外置，任务状态、原文和失败责任保留，原健康复验，不凭归档销审核债。|
|T-1159|在当前main整合微信原生报表、绑定归属与调度闭包|🔨 待办|PASS[REV:914cad514a19]|待验|[SPEC](docs/features/t1159-current-wechat-native-report-integration.md) · [验收合同](docs/verification/t1159/PAGE_SPEC.md)|T1124剩余56路径，来源293d统计页导航UNKNOWN/0报告/两实验用尽；独评后冻结语义移植、当前隔离公共链验收，保纯组/保存/调度与原研究暂停，不代签真人微信或安装。|
|T-1155|核对浏览器导航时本地服务连接中断日志|⏸️ 待办|—|—|[实际诊断](docs/features/t1155-browser-navigation-connection-abort.md)|当前三轮原日志aborted/ECONNRESET及uncaughtException，主要断言失败另有原因；保原日志，核请求/进程与后续公开操作，不猜根因或屏蔽错误。|
|T-1149|在当前main整合封面用途与图片页组统一画幅|🔨 待办|PASS[REV:0a91f954eb8f]|待验|[SPEC](docs/features/t1149-current-cover-group-aspect.md)|T1124独评确认来源四路径仍缺；保T1141旧任务/有效比例及T1117引用保存，逐段移植用途、用户统一选择和能力交集；单页不支持不阻断其它合法生成，当前独评后RED/GREEN与公开回读。|
|T-1144|核对素材旅程完成后测试进程未退出|🔨 待办|—|—|[实际诊断](docs/features/t1144-picker-worker-cleanup.md)|T1140两例PASS但worker停后300秒不退出，整轮371.938秒exit1；保原失败和归属快照，定位实际清理等待，不缩超时/force退出/忽略全局错误。|
|T-1135|核对安装版粗剪成片解码画面比原素材偏暗|⏸️ 待办|—|—|[实际诊断](docs/features/t1135-installed-render-color-fidelity.md)|已批准r7中性成片正式exact-file下载/245帧解码通过，但源+6.76秒三处背景RGB17/36/57变为0/19/44；先核原工程与编码色彩/公共渲染路径，根因未知，不重提渲染或改原稿/媒体；修产品前精确SPEC独评。|
|T-1118|核对本机验收原始日志目录消失|📋 待办|—|—|[实际诊断](docs/features/t1118-verification-directory-disappearance.md)|T1117实际RED/GREEN后，原验收父目录突然不存在；七次包装命令exit2未执行内层验证。保工具实际结果与已提交工件，原因UNKNOWN；新隔离目录继续验证，不重造旧日志或触用户数据。|
|T-1116|核对稿件并发保存回归在本轮完整对账中的再次失败|🔨 待办|—|—|[实际诊断](docs/features/t1116-artifact-cas-global-regression.md)|完整范围、失败与待验条件见 [原记录](BACKLOG-details.md#b-26577d4c923f)。|
|T-1101|修复画布素材选择、生成防重复与连线透传，整合三平台扫码绑定及错峰采集|🔨|PASS[REV:146ff2046c2c]|待验|[SPEC](docs/features/t1101-canvas-binding-collection.md)|来源改动已在main；当前组合验收待完成，原PASS不代签。不发布、不改真实Cookie。 [原记录](BACKLOG-details.md#b-2a871e9f9f38)|
|T-1101-global-gates|核对独立main工作树全局对账失败及历史收据漂移|📋 待办|—|—|[根因记录](docs/verification/t1101/global-gates.md)|前置对账76项失败含未装依赖阶段环境、历史审核收据和教训检查；本轮安装依赖后重跑真实Gate。范围外旧类型/契约/短预算仍关联T-1018/T-1081；不得补拍历史PASS。|
|T-1109|修复超时验证入口默认10秒初始化导致原测试未执行|🔨|PASS[REV:a85dda74b249]|待验|[SPEC](docs/features/t1109-timeout-verification-default-budget.md)|实际timeout-policy额外backend beforeAll10秒超时，25例skip；原静态27保留。仅明确真实Vitest test/hook至少120秒，保原断言/退出码/更长局部预算，不删除Gate或改构建。先独评再修公共入口。|
|T-1110|核对浏览器验收开发资源ChunkLoadError与测试状态准备竞态|📋 待办|—|—|[实际缺陷](docs/features/t1110-browser-development-resource-diagnosis.md)|完整范围、失败与待验条件见 [原记录](BACKLOG-details.md#b-da2102ce12ea)。|
|T-1107|核对平台公共接口新增操作与发布归属回归失败|🔨|PASS[REV:9c9181db2c1c]|待验|[实际缺陷](docs/features/t1107-platform-public-regression.md)|完整范围、失败与待验条件见 [原记录](BACKLOG-details.md#b-bc5cecd384c8)。|
|T-1105|修复共享资源面板失效读取后持续加载|🔨|PASS[REV:675552d2d02f]|待验|[SPEC](docs/features/t1105-shared-resource-loading.md) · [实际缺陷](docs/features/t1105-shared-resource-loading-diagnosis.md)|T1101额外Chrome走查展开共享资源停在加载，console出现组上下文拒绝；原失败保留。先在main复现epoch/单在途/重开，再独评修，不放宽跨组权限或把扫码PASS代签该面板。|
|T-1103|排查Pi联合提案反复遗漏完整图文参数|🔨|—|—|[实际缺陷](docs/features/t1103-pi-joint-argument-diagnosis.md) [详情](BACKLOG-details.md#t-1103)|见详情。|
|T-1102|排查并恢复本地安装首次运行时展开失败|🔨|—|—|[诊断与边界](docs/features/t1102-installed-runtime-extraction.md) [详情](BACKLOG-details.md#t-1102)|见详情。|
|T-1094|修复部分完成AI任务公开查询状态合同缺口|🔨|PASS[REV:5d2c91b81b45]|—|[SPEC](docs/features/t1094-public-partial-task-status.md) · [当场诊断](docs/verification/t1093/FOLLOWUP_DIAGNOSIS.md) [详情](BACKLOG-details.md#t-1094)|见详情。|
|T-1096|核对文章工作流与任务父归属旧回归断言的实际漂移|📋|—|—|[当场基线](docs/verification/t1094/RELATED_BASELINE_DIAGNOSIS.md)|完整范围、失败与待验条件见 [原记录](BACKLOG-details.md#b-19048143f3aa)。|
|T-1099|修复工具明确业务拒绝回执缺失与末次失败被算成功|⏸️|PASS[REV:b5aa667d8485]|—|[SPEC](docs/features/t1099-tool-domain-recovery.md) · [实际缺陷](docs/features/t1099-tool-domain-recovery-diagnosis.md) [详情](BACKLOG-details.md#t-1099)|见详情。|
|T-1098|核对安装重启后的定期同步失败与采集未启动|📋|—|—|[缺陷登记](docs/features/t1098-installed-scheduled-failure-diagnosis.md)|完整范围、失败与待验条件见 [原记录](BACKLOG-details.md#b-32f22df52b82)。|
|T-1097|修复文章编导参考资料与候选审读保护缺口|🔨|PASS[REV:3f5ea43b69f5]|—|[缺陷诊断](docs/features/t1097-article-director-options-diagnosis.md)|完整范围、失败与待验条件见 [原记录](BACKLOG-details.md#b-e634c6a1c42a)。|
|T-1095|验证Pi联合创作必填nullable字段遵循与原任务恢复方法|⏸️|PASS[REV:b3b9dda4753e]|—|[SPEC](docs/features/t1095-tool-parameter-recovery.md) · [当场诊断](docs/verification/t1093/FOLLOWUP_DIAGNOSIS.md) [详情](BACKLOG-details.md#t-1095)|见详情。|
|T-1093|校准编导数字参数、联合首次读取与真实候选失败恢复|🔨|PASS[REV:267bf399a6b1]|—|[SPEC](docs/features/t1093-director-method-recovery.md)|完整范围、失败与待验条件见 [原记录](BACKLOG-details.md#b-3158c3fcebbd)。|
|T-1091|补齐公开编导消息的Codex选择与文章图文视频目标定位并安装验收|🔨|PASS[REV:dcd0b932fca7]|—|[SPEC](docs/features/t1091-public-director-context.md) [详情](BACKLOG-details.md#t-1091)|见详情。|
|T-1092|核对联合创作旧集成测试未解包可信回执的契约漂移|📋|—|—|[当场基线证据](docs/verification/t1091/CREATION_BASELINE_DIAGNOSIS.md)|完整范围、失败与待验条件见 [原记录](BACKLOG-details.md#b-024c8af10ce0)。|
|T-1072-owned-devices|配合 Growth 轻量手机号账号与正式双设备，补齐新电脑连接与已激活账号入口|🔨 待办|PASS[REV:eb8de221287b]|待验|[SPEC](docs/features/t1072-owned-devices.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-aed1560bebc24ab1)。|
|T-1066-timeout-policy|全系统统一两分钟超时下限、嵌套预算与Skill防复发|⏸️ 待办|PASS[REV:13310516269c]|待验|[SPEC](docs/features/t1066-timeout-policy.md) [详情](BACKLOG-details.md#t-1066-timeout-policy)|见详情。|
|T-1067-skill-verification|清理通用产品流程Skill既有公开分发校验债务|📋 待办|—|待验|[根因证据](docs/verification/t1066/SKILL_VERIFICATION.md) [详情](BACKLOG-details.md#t-1067-skill-verification)|见详情。|
|T-1018|清理本轮测试暴露的全局类型与边界欠债|📋 待办|—|待验|[实测证据](docs/verification/t1017-rewrite-first.md) [详情](BACKLOG-details.md#t-1018) [完整历史](BACKLOG-details.md#t1173-t1018-global-debt-history)|见详情。|
|T-1083|复核流程升级后的旧任务写集通配符兼容缺口|📋 待办|—|—|[根因证据](docs/verification/t1080/post-package-progress-block-failure.json)|完整范围、失败与待验条件见 [原记录](BACKLOG-details.md#b-609973ed4950)。|
|T-1082|复核合并来源任务的当前评审与UI验收记录归属|📋 待办|—|—|[SPEC](docs/features/t1082-source-receipt-revalidation.md)|本地main真实出包后对账新增7项：5个source/alias缺当前review链event、2个agent-recovery alias缺completion；原来源链/报告保留不代签当前验收，按真实独立审核和UI旅程闭环，不重哈希旧链、不复制PASS。|
|T-1081|核对整合后原主线的14处短执行预算与超时扫描误报|📋 待办|—|待验|[根因证据](docs/verification/t1080/timeout-static-dispositions-corrected.json)|完整范围、失败与待验条件见 [原记录](BACKLOG-details.md#b-2d26eed11574)。|
|T-1026|补齐新增 Agent 功能的公开 CLI 并逐项验收安装版|🔨|—|—|[SPEC](docs/features/t1026-agent-cli-acceptance.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-67204c9b2c9efc87)。|
|T-1027|修复评论采集完成统计与失败诊断|🔨|—|—|[SPEC](docs/features/t1027-comment-collection-evidence.md)|T1026真实评论回归failed却提示全量完成；统一完成统计并补公开未完成原因，不把零新增冒充成功。|
|T-1025|重新核验 constitution 变更后的历史评审与前端验收回执|📋|—|—|[SPEC](docs/features/t1025-receipt-drift-revalidation.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-fbe6a3f4e58bcafa)。|
|T-1077|修复采纳与作品素材读取的项目返回值|🔨 待办|PASS[REV:a36209c19783]|待验|[SPEC](docs/features/t1077-material-parent-port.md) [详情](BACKLOG-details.md#t-1077)|见详情。|
|T-1075|修复安装验收发现的素材标签观察与纯组生图证明|🔨 待办|PASS[REV:73a6052db08f]|—|[SPEC](docs/features/t1075-installed-ai-observation-gaps.md) [详情](BACKLOG-details.md#t-1075)|见详情。|
|T-1074|全面验收与补齐AI助手系统操作、工具开放性和功能提示词|🔨 待办|PASS[REV:b19144c34cab]|待验|[SPEC](docs/features/t1074-ai-system-operations.md) [详情](BACKLOG-details.md#t-1074)|见详情。|
|T-1071|修复账号绑定和页面Tab切换卡顿|🔨 待办|PASS[REV:a53e25bf48df]|待验|[SPEC](docs/features/t1071-navigation-latency.md) [详情](BACKLOG-details.md#t-1071)|见详情。|
|T-1070|打通Codex执行与编导精调，脚本一键生成文章和图文|🔨 待办|PASS[REV:b195ac203ec0]|待验|[SPEC](docs/features/t1070-director-script-workflow.md) [详情](BACKLOG-details.md#t-1070)|见详情。|
|T-1069|修复安装版素材导入慢与跨Tab丢失，重设计素材选择并补多平台绑定入口|🔨 待办|PASS[REV:19bad8ef6f93]|待验|[SPEC](docs/features/t1069-installed-media-and-binding.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-e350e6053e05749b)。|
|T-1066|落实本地客户端优先出包并移除人为构建超时|⏸️ 待办|PASS[REV:0d40d8466937]|—|[SPEC](docs/features/t1066-local-package-build-only.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-d6ce9166621c4243)。|
| T-1062 | 汇总各会话改动统一提交并打包本地客户端，逐项验收含Skill粗剪 | 🔨 待办 | PASS[REV:5912ba60da16] | 待验 | [SPEC](docs/features/t1062-consolidated-local-client-acceptance.md) · [完整范围](BACKLOG-details.md#t-1062) | 见详情。 |
|T-1063|修正流程工具误拒合法字面方括号文件路径|🔨 待办|PASS[REV:4d99824da112]|待验|[SPEC](docs/features/t1063-orchestrator-literal-path-boundary.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-ef8386b2a0a060cc)。|
|T-1024|紧急排查充值50元后Growth受管Omni模型仍报余额不足|🔨 待办|—|待验|[排查范围](docs/verification/t1024-managed-credit-diagnosis.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-c9ebcc41ffd59f36)。|
|T-1022|按账号组统一多平台工作区、绑定管理、首页与复盘|⏸️ 待办|PASS[REV:2f179f8d9380]|待验|[SPEC](docs/features/t1022-account-group-workspace.md) [详情](BACKLOG-details.md#t-1022)|见详情。|
|T-1023|修正既有任务绑定glob导致的progress生成阻断|📋 待办|—|—|[证据](docs/features/t1022-account-group-workspace/VERIFICATION.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-3eba29be37ce0174)。|
|T-1021|CreatorOS封面与小红书图文双模板库、行业分类及私人收藏|🔨 待办|PASS[REV:f0f3fa0ff91b]|待验|[SPEC](docs/features/t1021-cover-template-library.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-d0c6d059440fcd70)。|
|T-1019|按观众具体任务与双九宫格持续生成可实测选题|⏸️ 待办|PASS[REV:3a0362412b23]|待验|[SPEC](docs/features/audience-task-topics/README.md)|用户委派；复用定位/雷达/候选/反馈，观众入口与作者实测分流，保留 T-1017 首稿；不发布或 push。|
|T-1020|统一可视化推荐、作品承接与科学运营观测|📋 待办|待审|待验|[SPEC](docs/features/creator-operations/README.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-e6765fb61ec296f6)。|
|T-1017|简化内容雷达：按账号定位一键生成可编辑改写稿|🔨 待办|PASS[REV:d2fb4541c82d]|待验|[SPEC](docs/features/t1017-content-radar-rewrite-first.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-00c1555a12c0e894)。|

|T-1015|核实剩余教训失败并校准过期回归断言|🔨 待办|—|—|[实测清单](docs/verification/t1014-reconcile-triage.md) [详情](BACKLOG-details.md#t-1015) [状态与原审核历史](BACKLOG-details.md#t1173-t-1015-same-identity-history)|见详情。|
|T-1004|冻结共享能力协议与 NomiFun 迁移依赖|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md) [状态与原审核历史](BACKLOG-details.md#t1173-t-1004-same-identity-history)|T-1003 评审；固定依赖闭包、宿主端口、协议与架构门卫。|
|T-1005|实现多步计划、连续执行与原任务续跑|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1004；模型规划与重规划，保留回执和成本，停止恢复可核验。|
|T-1006|接入统一工具网关与长结果回读|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md) [状态与原审核历史](BACKLOG-details.md#t1173-t-1006-same-identity-history)|依赖 T-1004；工具发现、进度、取消、错误和费用共用原执行链。|
|T-1007|补齐任务文件空间与受控命令执行|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1004；文件读写编辑、版本冲突、跨平台运行和进程树取消。|
|T-1008|迁移 NomiFun 浏览器能力并协调既有采集|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1004/1006；唯一profile所有者、多任务并发、跨账号隔离和原采集回归。|
|T-1009|实现产物版本、隔离预览与原生导出|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md) [状态与原审核历史](BACKLOG-details.md#t1173-t-1009-same-identity-history)|依赖 T-1006/1007；真实文件交付、HTML/图表预览、图片/PDF及选址导出。|
|T-1010|装配研究创作报告 Skill 与兼容扩展|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1005/1006/1007/1008/1009；按需方法包、锁定版本，自主选工具完成目标。|
|T-1011|实现对话内计划进度与文件交付交互|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1005/1006/1009；同对话查看修改导出，停止/恢复与性能防复发。|
|T-1012|验收完整多步 Agent 与旧功能兼容|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1008/1010/1011；真实模型工具文件全链路、故障恢复、采集及性能。|
|T-1013|验证双端安装包多步 Agent 与升级兼容|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1012；Mac/Windows安装实测，无NomiFun前置，数据升级保留。|
|T-998|收敛业务代码硬编码模型名|📋 待办|—|—|[T-914 审计](docs/research/2026-09-04-architecture-agent-audit.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-b9b5a6896b2aaf0b)。|
|T-997|修复 ai→ai-runtime 反向依赖边界违反|📋 待办|—|—|[T-914 审计](docs/research/2026-09-04-architecture-agent-audit.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-2eb38b106511cdb8)。|
|T-996|消除 review/reviews 双模块命名混淆|📋 待办|—|—|[T-914 审计](docs/research/2026-09-04-architecture-agent-audit.md)|review/(review-gate 审核门)与 reviews/(复盘评论领域)职责不同但命名极易混；重命名对齐并更新跨模块引用。|
|T-993|同步 main 分支到最新(落后 origin/main 573 提交)|📋 待办|—|—|—|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-6f28905ece9e4a7b)。|
|T-992|修复 Windows 升级启动运行环境切换拒绝访问|🔨 待办|—|—|[SPEC](docs/features/t992-windows-runtime-upgrade.md)|用户启动日志os error5；检查旧运行目录、安装指针与升级迁移，保留数据，补既有安装升级验证。|
|T-989|校正知识图谱错误提示的既有回归断言|📋 待办|—|—|[SPEC](docs/features/t989-knowledge-error-test.md)|T988扩展验证发现原af62ddda及当前均1/9失败；核对错误提示契约后修正，未改该行为。|
|T-984|本地打包并实测拆分采集修复|⏸️ 待办|—|—|[SPEC](docs/verification/t984-local-collection.md)|用户明确冻结改动范围；以66264111本地打包、安装、真实采集验证，不扩展恢复架构、不公开发布。|
|T-986|修复新绑定账号默认采集任务系统标记透传|📋 待办|—|—|[SPEC](docs/features/t986-bind-collection-flag.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-5172365e85a2cee2)。|
|T-980|纳入助手修复重新运行 V1.2 双端流水线|🔨 待办|—|—|[SPEC](docs/features/t980-release-rerun.md)|冻结已提交 T-976至T-978 修复，合并发布分支，预检后运行 Mac/Windows 正式构建并核验产物。|
|T-979|自动化页面慢轮询与切换对象回写防护|⬜ 待办|—|—|[SPEC](docs/features/t979-automation-polling.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-9f66fc6ba1d2a7e1)。|
|T-976|修复安装版 AI 助手 RedFox 再次失败与脱离对话的任务交互|🔨 待办|—|—|[SPEC](docs/features/t976-chat-inline-redfox.md)|定位本次原始错误；当前对话持续执行返回结果，不让用户刷新核对；真实链路验收。|
|T-957|排查 AI 失败、全场景验收并优化 Agent 提示词|🔨 待办|—|—|[SPEC](docs/features/t957-ai-real-acceptance.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-d8c8c522ea52c213)。|
|T-956|修复安装版点击采集一直抓取中|🔨 待办|—|—|[SPEC](docs/features/t956-installed-collection-stuck.md)|对照真实任务、日志与调度恢复定位阻断，修复后沿实际入口验证终态和结果，保护旧数据。|
|T-954|接入抖音流量来源并以专家方法改进编导交互|🔨 待办|—|—|[SPEC](docs/features/t954-director-content-loop.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-6ad5b71dceb239e1)。|
|T-951|修复自动化采集缺 jobRunId 与千条作品采集失败|⏸️ 待办|—|—|[SPEC](docs/features/t951-collection-reliability.md)|查明原调度绑定、分页和超时恢复，验证公共链路与千条规模，不以吞错冒充成功。|
|T-950|排查并恢复当前产品缺失历史数据|⏸️ 待办|—|—|[记录](docs/verification/t950-data-recovery.md)|先核对账号、数据路径和备份；保留现状后恢复可验证的数据，不覆盖新内容。|
|T-945|排查并修复当前视频渲染再次失败|⏸️ 待办|—|—|[诊断](docs/verification/t945-render-failure.md)|对齐最新原任务与安装版日志，定位真实失败点并验证修复，不凭历史错误猜测。|
|T-943|拉取并跑通 JY_IPAgent，调研数字人 API 与 CreatorOS 接入|⏸️ 待办|—|—|[SPEC](docs/features/t943-jy-ipagent-research.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-6da40b9d211687ae)。|
|T-940|补齐应用内签名远程更新闭环|📋 待办|—|—|[缺口与范围](docs/features/t939-positioning-release.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-0e3dd393b702a707)。|
|T-935|修复整稿子任务长时间排队无执行|🔨 待办|—|—|[排查记录](docs/verification/t935-script-queue.md)|查真实任务排队与唤醒，恢复原任务，不用新任务掩盖卡住；并完成 T-934 聊天复验。|
|T-934|统一 CLI 与页面的持久聊天工具入口|🔨 待办|—|—|[实现与验收](docs/verification/t934-cli-chat-unification.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-9b2048cb81450808)。|
|T-933|安装并验收本轮Agent Runtime桌面版|🔨 待办|—|—|[T-932交付](docs/verification/t932-runtime-alignment.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-e3d09dce7e422bbe)。|
|T-919|定位并修复本地包主导航卡顿、助手通知刷屏与搜索停滞|🔨 待办|—|—|复用 T-912/T-909 导航契约与 [T-915 SPEC](docs/superpowers/specs/2026-09-04-agent-runtime-refactor.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-125af640cc5d45f9)。|
|T-915|根治 AI 卡慢、失败不重试与搜索/浏览器缺少自主循环，收敛架构与执行能力|🔨 待办|PASS[REV:692283b8bace]|—|[SPEC](docs/superpowers/specs/2026-09-04-agent-runtime-refactor.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-e93a45cb55075893)。|
|T-916|修复工程对账与历史任务证据漂移，恢复可信重构基线|🔨 待办|—|—|[审计 A-13](docs/research/2026-09-04-architecture-agent-audit.md) [详情](BACKLOG-details.md#t-916) [状态与原审核历史](BACKLOG-details.md#t1173-t-916-same-identity-history)|见详情。|
|T-917|记录 T-915 媒体测试事故并防止测试再次访问真实媒体根|📋 待办|—|—|[事故记录](docs/research/evidence/t915/2026-09-06-media-test-incident.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-20ca3c0dceb6f8f4)。|
|T-908|真实复测 douyin-transcribe Skill，并对照 CreatorOS 当前抖音抓取链路判断是否需要兼容修复|📋 待办|—|—|—|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-0d6e5afae67dc6b3)。|
|T-906|放大 AI 助手默认窗口并支持拖拽缩放与跨启动尺寸记忆|⏸️ 待办|—|待验|—|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-43eab6d6e3e39443)。|
|T-905|调研独立的极简手机口播创作产品，以人设选稿、灵感写稿、实拍与“123321”真人换口型为核心|📋 待办|—|—|—|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-916d71382f9f6b24)。|
|T-884|只读诊断用户加密日志中的 ASR 转写失败|⏸️ 待办|—|—|复用 T-768 ASR 通用回退、T-639 MiMo ASR 与 T-676 逐字稿队列契约|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-15d0c7dabac4150e)。|
|T-883|提交并推送 T-881/T-882 候选，触发 GitHub macOS 与 Windows 官方安装包流水线|⏸️ 待办|—|—|复用 [T-881 验收](orchestrator/T881-FRONTEND-VALIDATION.md)、[T-882 本地包验收](orchestrator/T882-BUILD-VALIDATION.md) [详情](BACKLOG-details.md#t-883)|见详情。|
|T-878|让生图模型连接测试正确识别并提示 401/403 鉴权失败|📋 待办|—|—|[T-877 脱敏诊断](docs/research/2026-08-17-dudu-image-auth-failure-diagnosis.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-ab507299fb3fcd91)。|
|T-867|恢复 AI 对项目素材与分镜场景的自动语义匹配|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-867)|详情见外置记录。|
|T-860|修复竖屏素材底边与左下人物框边界重合|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-860)|详情见外置记录。|
|T-859|竖屏素材段人物收进左下角，并消除切换白闪|🔨 待办|PASS[REV:9895a91a63a8]|待验|[详情](BACKLOG-details.md#t-859)  [SPEC](docs/superpowers/specs/2026-08-16-portrait-material-pip-smooth-transition.md)|详情见外置记录。|
|T-858|把剪辑方法真正落到 CreatorOS，根治竖屏统一舞台、字幕重点词与动态 PPT|🔨 待办|PASS[REV:2521be715a0a]|待验|[详情](BACKLOG-details.md#t-858)  [SPEC](docs/superpowers/specs/2026-08-16-video-direction-stage-and-caption-emphasis.md)|详情见外置记录。|
|T-857|构建当前已提交候选的 CreatorOS 1.1.0 Windows 安装包|⏸️ 待办|—|待验|[详情](BACKLOG-details.md#t-857)|详情见外置记录。|
|T-856|重做竖屏成片的统一舞台、字幕可读性与重点词强调|⏸️ 待办|—|待验|[详情](BACKLOG-details.md#t-856)|详情见外置记录。|
|T-855|构建包含 T-854 与当前已提交修复的 CreatorOS macOS 本地安装包|⏸️ 待办|—|—|[详情](BACKLOG-details.md#t-855)|详情见外置记录。|
|T-851|支持录制“123”短视频生成本人授权的 AI 数字人口播|📋 待办|待审|待验|[详情](BACKLOG-details.md#t-851)|详情见外置记录。|
|T-850|支持只上传未粗剪口播录像，由 AI 理解实拍语义并生成可确认粗剪|📋 待办|待审|待验|[详情](BACKLOG-details.md#t-850)|详情见外置记录。|
|T-847|补齐 Windows 正式包的 CreatorOS CLI runtime 并重跑 1.1.0 双端流水线|⏸️ 待办|—|—|[详情](BACKLOG-details.md#t-847)|详情见外置记录。|
|T-846|提交当前批准候选并运行 CreatorOS 1.1.0 macOS/Windows 官方双端构建|⏸️ 待办|—|—|[详情](BACKLOG-details.md#t-846)|详情见外置记录。|
|T-845|根治 Windows 用户机成片在 HyperFrames 启动阶段缺失分层模块解析器|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-845)|详情见外置记录。|
|T-843|为 CreatorOS 建立可由 Codex 完整操作的官方 CLI，并复用现有全部业务能力|🔨 待办|PASS[REV:ea17774db868]|—|[详情](BACKLOG-details.md#t-843)  [SPEC](docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md)|详情见外置记录。|
|T-835|取消制作分镜逐字保真失败对整稿候选的阻断，并给出可诊断恢复|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-835)|详情见外置记录。|
|T-833|根治结构化节点 schema 兼容报错与多张局部改稿卡无法连续采纳|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-833)|详情见外置记录。|
|T-831|重排官方渠道模型配置并复核上游图生图能力|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-831)|详情见外置记录。|
|T-829|建立并执行上游模型全能力真实兼容矩阵，覆盖渠道托管与用户中转站|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-829)|详情见外置记录。|
|T-828|诊断行业热点出题不可用、Windows 滚动条异常与 DeepMind/Max 模型报错|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-828)|详情见外置记录。|
|T-827|根治选题中心来源筛选失效与候选操作按钮无法点击|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-827)|详情见外置记录。|
|T-826|根治 CreatorOS v1.1 Windows 新安装包安装后无法启动|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-826)|详情见外置记录。|
|T-824|根治昨日文稿 Skill 与内容动效卡片迭代在标准版成品中无明显效果|🔨 待办|PASS[REV:18361dc8c3c3]|待验|[详情](BACKLOG-details.md#t-824)  [SPEC](docs/superpowers/specs/2026-08-13-continuous-voiceover-storyboard-pipeline.md)|详情见外置记录。|
|T-823|根治架构图等主视觉被信息卡遮挡并修正跨段画面切换滞后|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-823)|详情见外置记录。|
|T-821|网站内容因未登录或权限不足读取失败时引导用户前往登录保管库|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-821)|详情见外置记录。|
|T-819|让编导在普通对话中按自然语言定位并改写当前稿单段|🔨 待办|PASS[REV:0425ab7b87b8]|待验|[详情](BACKLOG-details.md#t-819)  [SPEC](docs/superpowers/specs/2026-08-13-natural-language-current-script-section-editing.md)|详情见外置记录。|
|T-820|修复选题补卡到项目与文案的数据丢失并保存生成消费血缘|📋 待办|—|—|[详情](BACKLOG-details.md#t-820)|详情见外置记录。|
|T-816|让当前确认稿成为配图与封面生成的第一内容真相|🔨 待办|PASS[REV:fb03de3a57d7]|待验|[详情](BACKLOG-details.md#t-816)  [SPEC](docs/superpowers/specs/2026-08-13-current-script-truth-and-natural-language-section-editing.md)|详情见外置记录。|
|T-814|统一 CreatorOS 多页面 AI 对话体验并保留场景上下文与自由讨论能力|📋 待办|—|—|[详情](BACKLOG-details.md#t-814)|详情见外置记录。|
|T-779|根治参考历史作品生成封面时误探本机工具并中断生图|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-779)|详情见外置记录。|
|T-773|更新 CreatorOS 1.0 最新使用教程、匿名化截图并新建成交型测试版教程|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-773)|详情见外置记录。|
|T-768|任何云端 ASR 故障都必须自动回退本地 Whisper|🔨 待办|PASS[REV:3eb18966ea59]|待验|[详情](BACKLOG-details.md#t-768)  [SPEC](docs/superpowers/specs/2026-08-11-asr-universal-local-fallback.md)|详情见外置记录。|
|T-762|根因复盘并设计渠道 ASR 密钥的短时租约闭环|🔨 待办|—|—|[详情](BACKLOG-details.md#t-762)|详情见外置记录。|
|T-759|根治已绑定 B-roll 因 inventory 失配显示空白|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-759)|详情见外置记录。|
|T-754|根治 CreatorOS v1.0 官方包启动无限转圈|🔨 待办|—|—|[详情](BACKLOG-details.md#t-754)|详情见外置记录。|
|T-748|补齐“重新输入激活码”原生命令 ACL 并重打官方包|🔨 待办|—|—|[详情](BACKLOG-details.md#t-748)|详情见外置记录。|
|T-741|下移知识库“记一条经验”入口到录入操作行|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-741)|详情见外置记录。|
|T-739|根治制作视频跨项目灌入 B-roll、无证据改稿偏好与超长复盘卡|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-739)|详情见外置记录。|
|T-738|根治发布物料生成成功后无处查看并恢复卡内查看闭环|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-738)|详情见外置记录。|
|T-735|根治渠道受管模型成功产物被误判失败并建立 C 端稳定性闭环|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-735)|详情见外置记录。|
|T-734|根治 Windows 扫码绑定在启动前误依赖缺失 Playwright CLI|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-734)|详情见外置记录。|
|T-733|本地模型可用时收起渠道配置误报警并纠正票据不适用状态|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-733)|详情见外置记录。|
|T-732|根治局部改稿锚点失效后阻断全部 Copilot 对话|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-732)|详情见外置记录。|
|T-730|恢复可选“立论点”UI并增加适用场景引导，不重新变成写稿门槛|🔨 待办|PASS[REV:aeda30778cf2]|待验|[详情](BACKLOG-details.md#t-730)  [SPEC](docs/superpowers/specs/2026-08-09-optional-thesis-guidance.md)|详情见外置记录。|
|T-731|支持按电商等创作场景生成并自定义创作框架|📋 待办|—|待验|[详情](BACKLOG-details.md#t-731)|详情见外置记录。|
|T-729|根治渠道专属包仍跳官方入口并拆分官网、下载、人工反馈与反馈 API|📋 待办|—|待验|[详情](BACKLOG-details.md#t-729)|详情见外置记录。|
|T-726|退役项目“论点骨架”并让写稿直接消费 Brief 与素材|🔨 待办|PASS[REV:2809820bf64a]|待验|[详情](BACKLOG-details.md#t-726)  [SPEC](docs/superpowers/specs/2026-08-08-thesis-skeleton-retirement.md)|详情见外置记录。|
|T-721|根治素材包导出回流造成递归嵌套并恢复大素材库完整可见性|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-721)|详情见外置记录。|
|T-720|根治特定 Windows 设备抖音内置浏览器页面崩溃导致内容雷达主页验证失败|📋 待办|—|待验|[详情](BACKLOG-details.md#t-720)|详情见外置记录。|
|T-719|根治桌面端启动后二次白屏闪烁与首页排期提醒不可用|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-719)|详情见外置记录。|
|T-718|补齐智溯AI包内品牌并交付完整 Growth 配置后重打本地包|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-718)|详情见外置记录。|
|T-716|完善 Copilot 局部改稿、脚本版本回退、附件上下文与素材中心稳定排序|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-716)|详情见外置记录。|
|T-715|在 CreatorOS 增加 Growth AI 额度账户连接、查看与充值入口|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-715)|详情见外置记录。|
|T-714|接入工程教训闭环并迁移旧账本，确保真实踩坑可被后续任务自动复用|📋 待办|—|待验|[详情](BACKLOG-details.md#t-714)|详情见外置记录。|
|T-713|构建包含通用智能体语义边界与当前制作修复的 macOS 0.3.0 本地测试包|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-713)|详情见外置记录。|
|T-712|优先采用用户上传素材进入 B-roll 时间线、恢复成片预览并收回渠道同步常驻提示|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-712)|详情见外置记录。|
|T-709|将 macOS Developer ID 签名与 Apple 公证凭据接入 GitHub 正式发布流水线|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-709)|详情见外置记录。|
|T-708|全局审计并软化 AI 工具中不合理的创作完整度门禁|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-708)|详情见外置记录。|
|T-707|将定位前采收敛为 Copilot 主导的自适应编导访谈并直接闭环定位中心|🔨 待办|PASS[REV:06867c4bf60c]|待验|[详情](BACKLOG-details.md#t-707)  [SPEC](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md)|详情见外置记录。|
|T-705|根治 macOS 本地包启动后落入 Page Not Found|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-705)|详情见外置记录。|
|T-703|根治视频制作从分镜到预览、对话调剪、采纳与再制作的多处断裂并重打本地包|🔨 待办|PASS[REV:c1a3920aea71]|待验|[详情](BACKLOG-details.md#t-703)  [SPEC](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md)|详情见外置记录。|
|T-702|根治审核“应用改写”后分镜稿格式坍缩为 Markdown 表格源码|📋 待办|—|待验|[详情](BACKLOG-details.md#t-702)|详情见外置记录。|
|T-695|清理应用内硬编码品牌并让白标用户表面保持中性|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-695)|详情见外置记录。|
|T-691|补齐 Copilot 单项目全生命周期、跨项目历史与审核改稿工具闭环|🔨 待办|PASS[REV:9444ca5b32a9]|待验|[详情](BACKLOG-details.md#t-691)  [SPEC](docs/superpowers/specs/2026-08-04-copilot-project-lifecycle-tool-closure.md)|详情见外置记录。|
|T-694|建立多渠道专属包工厂、项目级出包 Skill 与安全增量更新闭环|🔨 待办|PASS[REV:2c7be136aea0]|待验|[详情](BACKLOG-details.md#t-694)  [SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md)|详情见外置记录。|
|T-686|根治定位前采联网补充直接报错并恢复国内中文公开检索|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-686)|详情见外置记录。|
|T-687|建立口播联想画面 Skill 并打通图序号引用、项目 B-roll 与成片渲染|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-687)|详情见外置记录。|
|T-685|排查并根治全流程写稿长度失控及审核不识别已采纳文案卡|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-685)|详情见外置记录。|
|T-684|根治 Copilot 联网搜素材失败后回退模型记忆并误导配置搜索模型|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-684)|详情见外置记录。|
|T-683|修复 Copilot 在 Windows 无法读取盘符绝对路径与目录授权失效|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-683)|详情见外置记录。|
|T-679|接入 Growth 按激活权益签发的受管模型凭据、真实模型白名单与用户选择|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-679)|详情见外置记录。|
|T-678|根治内容雷达生成选题继续读取旧定位|📋 待办|—|待验|[详情](BACKLOG-details.md#t-678)|详情见外置记录。|
|T-677|优化首页与定位中心切换时整页骨架卡顿 1–2 秒|📋 待办|—|待验|[详情](BACKLOG-details.md#t-677)|详情见外置记录。|
|T-676|根治云端 ASR 测试假阳性并接通 StepFun，同时修复 Windows 本地 Whisper 回退|📋 待办|—|待验|[详情](BACKLOG-details.md#t-676)|详情见外置记录。|
|T-671|确定 CreatorOS 代理商业模式与官网价格边界|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-671)|详情见外置记录。|
|T-670|恢复 CreatorOS 部署前真实官网并收口公开商业信息|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-670)|详情见外置记录。|
|T-666|根治定位前采误清空既有定位并改为非破坏草稿切换|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-666)|详情见外置记录。|
|T-665|支持彻底删除内容雷达信源及其全部归属数据|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-665)|详情见外置记录。|
|T-662|根治成片把内部结构标签当正文并优化卡片文字重合|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-662)|详情见外置记录。|
|T-661|根治项目素材未进入制作、采纳后仍转圈及素材包图片无扩展名|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-661)|详情见外置记录。|
|T-660|根治雷达预填逐字稿未解锁下一步及已采纳封面仍被判缺失|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-660)|详情见外置记录。|
|T-656|收紧桌面授权本地信任链，移除生产冒烟旁路并消除 verdict 私钥明文靶点|🔨 待办|PASS[REV:5f6970ac76f2]|待验|[详情](BACKLOG-details.md#t-656)  [SPEC](docs/superpowers/specs/2026-08-02-desktop-verdict-basic-hardening.md)|详情见外置记录。|
|T-655|接通 Seedance 文生视频适配器并修复 `seeddance` 配置报未知 provider|🔨 待办|—|—|[详情](BACKLOG-details.md#t-655)|详情见外置记录。|
|T-654|新增 Qwen 方言 ASR 适配器并接入设置预设|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-654)|详情见外置记录。|
|T-653|支持本地自配与渠道子 Key 托管双模式模型供给|📋 待办|待审|待验|[详情](BACKLOG-details.md#t-653)|详情见外置记录。|
|T-652|重构定位前采为必经的编导式访谈与证据辅助工作流|🔨 待办|待审|待验|[详情](BACKLOG-details.md#t-652)|详情见外置记录。|
|T-650|知识倾倒输入框支持拖拽文件直接导入|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-650)|详情见外置记录。|
|T-651|内容雷达默认按作品真实发布时间倒序|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-651)|详情见外置记录。|
|T-649|调研并设计激活后渠道白标：品牌名、应用内 Logo 与系统级图标边界|📋 待办|—|待验|[详情](BACKLOG-details.md#t-649)|详情见外置记录。|
|T-646|统一优化结构化 AI 工具为结果优先、分段生成与局部修复|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-646)|详情见外置记录。|
|T-645|收敛模型配置项并同步精简 Growth 渠道模板|🔨 待办|PASS[REV:5dfe24b42eb7]|待验|[详情](BACKLOG-details.md#t-645)  [SPEC](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md)|详情见外置记录。|
|T-644|根治 CreatorOS macOS 客户端持续闪屏|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-644)|详情见外置记录。|
|T-643|收口 CreatorOS 为输入 Activity 激活码后直接授权，隐藏当前权益领取入口|📋 待办|—|待验|[详情](BACKLOG-details.md#t-643)|详情见外置记录。|
|T-642|打通内容雷达对标文案→改写策略→选题卡→项目写稿的编导证据链|🔨 待办|CONCERNS[REV:7728c9ed44bd]|待验|[详情](BACKLOG-details.md#t-642)|详情见外置记录。|
|T-641|根治发布中心“登录多日仍只有一个采集日、发布趋势不出曲线”|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-641)|详情见外置记录。|
|T-640|配置 Apple Developer ID 签名与公证，并在前序修复全部闭环后统一产出本地安装包|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-640)|详情见外置记录。|
|T-635|把 CreatorOS 正式构建绑定到 Growth 商品的统一 `projectKey`，禁止运行时覆盖产品身份或关闭严格验签|🔨 本地实现待验|PASS[REV:b8add273a494]|待验|[详情](BACKLOG-details.md#t-635)  [SPEC](docs/superpowers/specs/2026-07-30-growth-product-identity-binding.md)|详情见外置记录。|
|T-633|恢复创作者中心自动扫码登录|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-633)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-f9f6ea5f8246191a)。|
|T-632|根治“新建定位母版”无效、历史母版无法恢复与逐字稿提取长时间无结果|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-632)|详情见外置记录。|
|T-631|根治大视频上传被 10MB 截断并误报 ffmpeg 缺失|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-631)|详情见外置记录。|
|T-621|补齐渠道模型 authority snapshot 生产链路回归|📋 待办|—|—|[详情](BACKLOG-details.md#t-621)|详情见外置记录。|
|T-576|统一跟进尚未关闭的飞书线上用户反馈|🔨 免审|—|—|[详情](BACKLOG-details.md#t-576)|详情见外置记录。|
|T-575|接通 CreatorOS 权益领取、渠道配置与问题反馈|🔨 本地PASS·待生产E2E|—|待验|[详情](BACKLOG-details.md#t-575)|详情见外置记录。|
|T-562|根治 CreatorOS 0.2.0 Windows 安装后持续白屏|🔨 免审|—|待验|[详情](BACKLOG-details.md#t-562)|详情见外置记录。|
|T-548|根治视频渲染重试后成片脱离项目且制作页实时预览消失|🔨 待安装版真机|—|待验|[详情](BACKLOG-details.md#t-548)|详情见外置记录。|
|T-538|接通渠道签名上下文的产品问题反馈|🔨 本地PASS·待生产E2E|—|待验|[详情](BACKLOG-details.md#t-538)|详情见外置记录。|
|T-536|根治“我的收藏”同步错误分类与浏览器档案锁恢复|🔨 待真实账号只读验收|—|待验|[详情](BACKLOG-details.md#t-536)|详情见外置记录。|
## ⏸️ 暂停池（不自动派发）

> 只保留任务索引；暂停原因与恢复条件见 `orchestrator/events.ndjson` 和详情文档。恢复必须使用 `taskctl start`。

|ID|状态|审核|验收|文档|
|---|---|---|---|---|
|T-626|⏸️|—|待验|[详情](BACKLOG-details.md#t-626)|
|T-577|⏸️|—|待验|[详情](BACKLOG-details.md#t-577)|
|T-565|⏸️|—|待验|[详情](BACKLOG-details.md#t-565)|
|T-524|⏸️|—|待验|[详情](BACKLOG-details.md#t-524)|
|T-519|⏸️|—|待验|[详情](BACKLOG-details.md#t-519)|
|T-525|⏸️|—|待验|[详情](BACKLOG-details.md#t-525)|
|T-517|⏸️|—|待验|[详情](BACKLOG-details.md#t-517)|
|T-516|⏸️|—|待验|[详情](BACKLOG-details.md#t-516)|
|T-510|⏸️|—|待验|[详情](BACKLOG-details.md#t-510)|
|T-506|⏸️|—|待验|[详情](BACKLOG-details.md#t-506)|
|T-502|⏸️|—|待验|[详情](BACKLOG-details.md#t-502)|
|T-497|⏸️|—|待验|[详情](BACKLOG-details.md#t-497)|
|T-451|⏸️|—|待验|[详情](BACKLOG-details.md#t-451)|
|T-449|⏸️|—|待验|[详情](BACKLOG-details.md#t-449)|
|T-448|⏸️|—|待验|[详情](BACKLOG-details.md#t-448)|
|T-433 S2|⏸️|—|待验|[详情](BACKLOG-details.md#t-433-s2)|
|T-433 S4|⏸️|—|待验|[详情](BACKLOG-details.md#t-433-s4)|
|T-433 S5|⏸️|—|待验|[详情](BACKLOG-details.md#t-433-s5)|
|T-426|⏸️|—|待验|[详情](BACKLOG-details.md#t-426)|
|T-425W|⏸️|—|待验|[详情](BACKLOG-details.md#t-425w)|
|T-413|⏸️|—|待验|[详情](BACKLOG-details.md#t-413)|
|T-417|⏸️|—|待验|[详情](BACKLOG-details.md#t-417)|
|T-418|⏸️|—|待验|[详情](BACKLOG-details.md#t-418)|
|T-420|⏸️|—|待验|[详情](BACKLOG-details.md#t-420)|
|T-399|⏸️|—|待验|[详情](BACKLOG-details.md#t-399)|
|T-399c|⏸️|—|待验|[详情](BACKLOG-details.md#t-399c)|
|T-409|⏸️|—|待验|[详情](BACKLOG-details.md#t-409)|
|T-372 W-spike|⏸️|—|待验|[详情](BACKLOG-details.md#t-372-w-spike)|
|T-372 W-ci|⏸️|—|待验|[详情](BACKLOG-details.md#t-372-w-ci)|
|T-391 H-econ|⏸️|—|待验|[详情](BACKLOG-details.md#t-391-h-econ)|
|T-393|⏸️|—|待验|[详情](BACKLOG-details.md#t-393)|
|T-401|⏸️|—|待验|[详情](BACKLOG-details.md#t-401)|
|T-406|⏸️|—|待验|[详情](BACKLOG-details.md#t-406)|
|T-407|⏸️|—|待验|[详情](BACKLOG-details.md#t-407)|
|T-396|⏸️|—|待验|[详情](BACKLOG-details.md#t-396)|
|T-398|⏸️|—|待验|[详情](BACKLOG-details.md#t-398)|
|T-366c|⏸️|—|待验|[详情](BACKLOG-details.md#t-366c)|
|T-361|⏸️|—|待验|[详情](BACKLOG-details.md#t-361)|
|T-352|⏸️|—|待验|[详情](BACKLOG-details.md#t-352)|
|T-320c|⏸️|—|待验|[详情](BACKLOG-details.md#t-320c)|
|T-350c|⏸️|—|待验|[详情](BACKLOG-details.md#t-350c)|
|T-351|⏸️|—|待验|[详情](BACKLOG-details.md#t-351)|
|T-349d|⏸️|—|待验|[详情](BACKLOG-details.md#t-349d)|
|T-339|⏸️|—|待验|[详情](BACKLOG-details.md#t-339)|
|T-328|⏸️|—|待验|[详情](BACKLOG-details.md#t-328)|
|T-332R|⏸️|—|待验|[详情](BACKLOG-details.md#t-332r)|
|T-336|⏸️|—|待验|[详情](BACKLOG-details.md#t-336)|
|T-335|⏸️|—|待验|[详情](BACKLOG-details.md#t-335)|
|T-337|⏸️|—|待验|[详情](BACKLOG-details.md#t-337)|
|T-337a|⏸️|—|待验|[详情](BACKLOG-details.md#t-337a)|
|T-337b|⏸️|—|待验|[详情](BACKLOG-details.md#t-337b)|
|T-337c|⏸️|—|待验|[详情](BACKLOG-details.md#t-337c)|
|T-337d|⏸️|—|待验|[详情](BACKLOG-details.md#t-337d)|
|T-337e|⏸️|—|待验|[详情](BACKLOG-details.md#t-337e)|
|T-337f|⏸️|—|待验|[详情](BACKLOG-details.md#t-337f)|
|T-337g|⏸️|—|待验|[详情](BACKLOG-details.md#t-337g)|
|T-334|⏸️|—|待验|[详情](BACKLOG-details.md#t-334)|
|T-324|⏸️|—|待验|[详情](BACKLOG-details.md#t-324)|
|T-340|⏸️|—|待验|[详情](BACKLOG-details.md#t-340)|
|T-315|⏸️|—|待验|[详情](BACKLOG-details.md#t-315)|
|T-316|⏸️|—|待验|[详情](BACKLOG-details.md#t-316)|
|T-317|⏸️|—|待验|[详情](BACKLOG-details.md#t-317)|
|T-318|⏸️|—|待验|[详情](BACKLOG-details.md#t-318)|
|T-319|⏸️|—|待验|[详情](BACKLOG-details.md#t-319)|
|T-312|⏸️|—|待验|[详情](BACKLOG-details.md#t-312)|
|T-307|⏸️|—|待验|[详情](BACKLOG-details.md#t-307)|
|T-306|⏸️|—|待验|[详情](BACKLOG-details.md#t-306)|
|T-301|⏸️|—|待验|[详情](BACKLOG-details.md#t-301)|
|T-302|⏸️|—|待验|[详情](BACKLOG-details.md#t-302)|
|T-261|⏸️|—|待验|[详情](BACKLOG-details.md#t-261)|
|T-249|⏸️|—|待验|[详情](BACKLOG-details.md#t-249)|
|T-250|⏸️|—|待验|[详情](BACKLOG-details.md#t-250)|
|T-255b|⏸️|—|待验|[详情](BACKLOG-details.md#t-255b)|
|T-185R|⏸️|—|待验|[详情](BACKLOG-details.md#t-185r)|
|T-136R|⏸️|—|待验|[详情](BACKLOG-details.md#t-136r)|
|T-100|⏸️|—|待验|[详情](BACKLOG-details.md#t-100)|
|T-087|⏸️|—|待验|[详情](BACKLOG-details.md#t-087)|
|T-045|⏸️|—|待验|[详情](BACKLOG-details.md#t-045)|

## ✅ 已完成

> ✅ 已完成任务全文已归档到 [BACKLOG-archive.md](BACKLOG-archive.md)(减小本看板体积;单一执行真相仍是本文件)。
