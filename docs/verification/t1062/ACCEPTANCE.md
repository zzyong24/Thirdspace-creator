# 本地客户端逐项验收表

2026-10-06 更新：当前安装源为228dd08a，六根离线备份、实际安装与CLI公开功能验证已发生；两个真实安装缺陷仍待新包复验。原生页面操作和用户功能验收未签通过。本表保留下面全部历史出包、失败、隔离修复记录；早期浏览器和夹具证据不能代签当前安装包。

当前已安装候选 SHA：`228dd08ad78e03fd8dba90d13cf1920474d5c872`。DMG：`/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg`，SHA256 `6792ae80255cdbeab26bfdf00efd2618bcba311041a3c586a4aebd9ab2d4f898`，662,090,421字节。固定入口实际exit0、四基本检查44项通过、四处1.2.0；构建前后干净。镜像、严格签名与277迁移资源字节校验实际通过，本地ad-hoc未Apple公证。实际安装App68492、server68831、127.0.0.1:56703。当前仅功能部分有证据，不能宣布整包通过。
用户最新确认：没有专用 macOS 测试用户，使用当前登录用户与当前安装的 CreatorOS App 进行安装版验收。安装前先完整备份应用和现用数据；不再依赖专用用户前置条件。此确认不代表功能已通过。

| 编号 | 功能 | 必须观察到的结果 | 安装版实测/证据 | 用户验收 |
| --- | --- | --- | --- | --- |
| A01 | 安装与首次启动 | 从本次DMG安装并启动包内应用；显示正确版本，未连接8788开发服务；用户原资料与激活保留 | 部分：228源/6792包真实安装启动，账号与组公开列表成功，404操作/full访问。六根备份封闭校验ed336a6保留。原生首页仍待人工观察 | 待用户操作 |
| A02 | 导航与弹层 | 主导航、项目详情、任务详情、素材弹层真实可用；本地弹层立即打开，返回位置保留 | 待验 | 待用户操作 |
| A03 | 账号组管理 | 新建/重命名/切换/归档、空组手工创作；组切换刷新共享资料且旧请求不回写 | 部分：自己的中性组302真实创建/改名/归档/恢复；版本1→4，旧版本改名409且最终值保持。未操作真实组或保存默认选择；切换UI待验 | 待用户操作 |
| A04 | 多平台绑定与切换 | 抖音/快手/视频号/公众号/小红书的现有绑定入口；组总览及单平台筛选，共享内容保持可见 | 待验 | 待用户操作 |
| A05 | 账号转组隔离 | A账号转B后A旧项目/画布/模板/工程仍归A；B拒绝旧ID/回执/采纳；归档组读历史、拒新写 | 部分：中性组302读组101项目104实际404；归档组新项目404且列表仍空。真实账号转组/闭包与旧回执仍待验 | 待用户操作 |
| A06 | 资料迁移 | 预览闭包/资源授权/冲突/幂等和撤回；原ID/文件路径保留，不自动搬真实用户资料 | 待验 | 待用户操作 |
| A07 | 首页 | 五指标、创作/待办/选题/最近发布、可读坐标趋势图；空数据真实0/空 | 部分：中性组101公开dashboard回读指标/趋势/待办真实空，继续创作返回自己的项目104。安装页面/图表待验 | 待用户操作 |
| A08 | 创作者总览/分析/复盘 | 时间范围、组总览与平台切换；播放/阅读口径分别明确，图有坐标单位/提示/空状态 | 部分：中性项目公开analytics/reviews.list回读空；时间轴与平台筛选/图表的原生页面待验 | 待用户操作 |
| A09 | 项目与主脚本 | 创建/编辑/保存/刷新主脚本；切平台仍可读同组项目；候选不直接落最终内容 | 部分：中性项目104主脚本artifact286保存version290/第2版，全文及历史回读一致；旧基线409、零覆盖。UI/候选采用待验 | 待用户操作 |
| A10 | 文章工作台 | 真实编辑/候选采用/撤销/保存刷新/交付；历史版本与所属项目保持 | 部分：中性article输出221保存version233并回读；同意图幂等、不同新意图旧基线409、版本数保持2。候选/UI撤销/交付待验 | 待用户操作 |
| A11 | 图文/朋友圈 | 作品编辑、页面/素材顺序、版本/交付；真实缺配置限制相应动作，不造成功 | 部分：中性graphic输出242保存version258并回读真实标题/正文/标签。未图像生成或发布；页面排序/朋友圈/交付待验 | 待用户操作 |
| A12 | 案例和资产 | 案例读取、资产预览/引用/精确文件下载；跨组资源按真实grant授权 | 部分：自己的asset125/file134公开fileDownloadUrl实际HTTP200下载232847字节，SHAe6c0f4e与原文件全等；案例/原生预览待验 | 待用户操作 |
| A13 | 无限画布 | 空组新建/拖拽/缩放/节点编辑/保存刷新；关联项目同组；生成/采纳/恢复使用冻结范围 | 部分：自己的画布2e8949f9保存revision2，文本/真实视频exact文件节点/模板节点回读一致。拖拽缩放/生成采用待验 | 待用户操作 |
| A14 | 模板 | 内置库/私人收藏分开可用，检索筛选/预览/选择/存取；收藏和回执不能随账号转组外泄 | 部分：内置封面模板公开列表17项、封面5项，真实模板ID回读；私人收藏/原生预览存取待验 | 待用户操作 |
| A15 | 封面/图文模板采用 | 真实页序/文件版本/视觉摘要；发布目标账号明确，CAS冲突可恢复，不覆盖新版草稿 | 待验 | 待用户操作 |
| A16 | Codex/WorkBuddy接入 | Skill与工具能读真实上下文、产候选；采用/取消/恢复、执行记录和错误反馈；不直接写库 | 部分：安装CLI404操作/full访问；真实Skill调用生成粗剪候选。失败幂等回放误报成功已复现，修复/新包及Codex/WorkBuddy交互待验 | 待用户操作 |
| A17 | 视频导入/原片 | 包内选择实际视频，probe/预览/音频可用；保存刷新源引用不变，原片字节不被覆盖 | 部分：中性H264/AAC原片真实upload→关联→probe/adopt进入production169，来源引用/时长14.924854s可读，原字节e6c0f4e保持。原生选择器/回放待验 | 待用户操作 |
| A18 | 真实转写 | 从导入文件实际ASR得到文本/时间码；校验时长和词句范围，缺有效时间码明确降级 | 部分：真实SenseVoiceSmall ASR任务176成功全文，明确无可靠词句时间码；原转录adopt revision2回读。未以手填时间冒充词级转写 | 待用户操作 |
| A19 | Skill粗剪语义 | 真实内容中完整重录、口误重复、长停顿分别产删留理由/不确定性；强调/自然停顿保留 | 未通过自动粗剪：真实MiniMaxM3/Skill任务199成功，只产生整段keep/review_only；时间码缺失，未覆盖完整重录/口误/停顿可执行删留 | 待用户操作 |
| A20 | 粗剪对照与采用 | 可对照每项候选及影响清单，明确采用一次进入同一原生时间轴；逐词/整段能力分别记录 | 待验：未采用review_only粗剪候选；源与全文转录已有公开采用，不能代签粗剪采用和影响对照 | 待用户操作 |
| A21 | 原生编辑与撤销 | 手工增删/修剪/移动后Ctrl-Z/Ctrl-Shift-Z恢复；模型候选与手动编辑共用真实工程 | 待验 | 待用户操作 |
| A22 | 字幕与叠层 | 粗剪影响字幕/音频/叠层的关系采用前可见；不静默错位，不把缺联动称完整等效 | 待验 | 待用户操作 |
| A23 | 速度/音高 | 检查用户选择变速与保音高的真实预览/导出结果；不硬编码1.13为默认 | 部分：原片实际H264/AAC/音频48k，原速字节保持。变速/保音高预览和导出未发生 | 待用户操作 |
| A24 | 保存刷新与导出 | 原生工程保存、关闭重开、预览一致；实际MP4 probe H264/AAC/时长与回放正确 | 功能失败：人工已知夹具边界修剪后save/get revision3成功；纯组公开preview/render均428，未预约渲染、无MP4。旧单账号叠层路径已定位；修复和新包待验 | 待用户操作 |
| A25 | 设置/模型配置 | 配置保存/读回/取消/错误分层和脱敏；缺模型保留手工编辑，不打印密钥 | 部分：公开模型与偏好读取成功，供应商/配置仅脱敏检查；没有改真实模型配置，保存/取消/原生错误反馈待验 | 待用户操作 |
| A26 | 采集/发布兼容 | 原有五平台登录/采集/草稿入口按真实能力核验；未经授权不实际对外发布 | 待验 | 待用户操作 |
| A27 | 升级与重启 | fresh/root/diagnostic/canvas四种隔离旧库升级两次；表/约束/行数/ID/storageKey保持 | 部分：实际21迁移回归/旧备份副本公共升级双启保原132表、105旧ledger+1新迁移；228新包277资源逐字节核验。升级原生功能仍待验 | 待用户操作 |

每个结果附当前候选SHA、包hash、实际步骤、服务回执/截图/导出文件及错误日志。无法实际完成的项目写明确原因及保留状态，不使用空泛“通过”。安装后按A01→A02→组与共享创作→视频完整链顺序执行；逐个功能可反复验证，但用户没有确认的项不代签。

粗剪使用隔离测试媒体和本次包的真实公开调用链。测试素材中记录原片字节/时长、转写时间范围、候选删留、采用前后工程、撤销/重做、关闭重开及导出字节/回放；时间码缺失不能用手填时间码冒充ASR。真实语义模型和ASR回执、浏览器测试、单测与安装运行分别记录，不混用。

```mermaid
flowchart LR
  A[原片与真实转写] --> B[Skill提出粗剪候选]
  B --> C[逐项对照及明确采用]
  C --> D[原生时间轴与手工修改]
  D --> E[撤销和保存重开]
  E --> F[真实导出与用户验收]
```

## 2026-10-06 本地出包和安装前状态

原 18 项实际全部通过，22 个检查点无意外、跳过或重试。该结果覆盖浏览器及隔离调用链，原生整体 Gate、安装版及真实语义模型仍未执行，不能代替下表验收。特性整合 commit 为 `67b4a27f8550f52dc99654c443efa59b8e6e0900`；随后独立 T-1067 的 8 路径 commit 为 `83ca67b43619500b0ba9a303a7aa30d249012b80`，缺失 statSync import 的单行修正 commit 为上述最终冻结 SHA。

正式包装相关 15 文件共 150 测试，149 通过、1 失败；失败的 T-734 旧源码字符串断言在特性基点 67b4a27 同样实际失败，6 个输入和测试字节一致，未删断言。单行 import 修正后相关测试与四项基本检查共 63 项通过。第一次打包真实失败于 statSync 缺失，第二次被用户中断、没有完成退出码，第三次于 2026-10-06 15:55 实际生成本包；旧日志与旧下载包均保留。

sync 实际 exit 0；reconcile 实际 exit 1，共 36 错误/1 告警，未写全绿。完整失败记录在私有 `t1067-closure-reconcile-resumed-20261006`；此前 35 错误报告没有完整原始条目，不能声称逐项无变化。后续 boundary 复查定位 live-chat-session.ts 的两处 AI SDK 引入，不属于 T-1067 固定 8 路径；全局回执、LED-052 隔离 PG 配置及其他教训失败沿 T-1015/T-1018 保留核因，不更新基线或补造旧 PASS。T-1062 不以此记录宣布整体 SHIP 通过。

当前旧 App 与其运行服务已正常停止。首份实际备份因 macOS 自动生成 provenance、重写 quarantine 出现属性差异而失败，部分副本和日志保留；不能作为完整备份。源前后内容未漂移，实际内容、权限、ACL 等一致。修订备份只对不可原样恢复的系统 provenance 单独保存源原值与副本观察值；其他属性仍精确验证，全部源 before/after 仍严格比较。修订辅助脚本须独立复核并实际完成六个精确根和最后封闭检查后才允许替换 App。本条不代表备份或安装已完成。

完整日志、测试原始回执、实际包和校验结果保存在用户私有目录 `/Users/zyongzhu/CreatorOS-local-acceptance/t1062-20261005-wm9zxxwl`，不将用户数据或备份写入 Git。


## 2026-10-06 安装后真实失败与隔离核因

六个精确根的离线备份与最终封闭检查实际完成，源前后未漂移；系统 provenance 原值单独封存，未声称副本物理属性全等。原 App 另行保留，本次 DMG App 已替换安装并启动；严格签名校验 exit 0。实际安装 App PID 25410、其 sidecar PID 25662、127.0.0.1:59253；CLI 404 条操作来自新运行时，访问状态 full。以上只证明安装和运行，不能写功能通过。

账号列表、账号组列表均实际 HTTP 500；主页实际 ERROR 3666842164。新加密日志经官方解码器解码，错误是 `CREATIVE_CANVAS_MIGRATION_LINEAGE_UNKNOWN`。数据库已打开，未被判损坏、隔离或重建。A01 功能失败，A02—A27 因启动业务不可用尚未继续；真实 ASR/语义模型及中性业务夹具均未执行。

只将已核验备份的 db 复制到新私有研究目录后打开副本；原库和不可变备份未作为诊断数据库打开。副本账本105条，其中4条在当前三源以外，全部精确匹配 Git 中真实 SQL blob：0068_keyring_only_credentials、0069_asr_usage_intents、0101_workbench_artifact_lineage、0101_external_agent_connections。旧安装 App 的102条资源历史全部已覆盖，不能将问题说成旧包资源不匹配。备份1988项内容与stat前后相同。完整私有记录 `installed-db-ledger-clone-oqk19ypa/receipt.json`、`git-migration-identity-search.json`，观察结果 SHA256 `9d8b3e8c17932f76325d1ab7ed19336ebfdb46f6932fe50641888d5d54152c9e`。不放宽未知身份守卫、不伪造账本、不重放原数据写入。修复及重新打包/安装仍待验。


## 2026-10-06 历史兼容修复的真实隔离验证

修复只落实既有SPEC的旧库可核验升级要求，SPEC原hash cfbaf9保留，没有新规格轮次、typed capability或用户授权记录。实际旧账本对应SQL完整冻结，不把两份非祖先来源声称为原授权HEAD祖先，也不导入其业务功能。实现及边界说明见 installed-history-implementation.md。

原公共createDb在备份副本现场RED，错误与安装版相同。修复后同一副本公共createDb升级和两次启动实际 exit 0：132张原表的行数、原字段行摘要完全相同；105条旧ledger的id/hash/when全部保留，仅新增真实0128一条；二次启动全快照相同。不可变备份1988项的内容/mode/size/mtime/link升级后仍相同，未打开原库或不可变备份作为数据库。

迁移测试1文件21项实际全通过：原fresh/root/diagnostic/canvas四PGlite及四隔离PG基线、4补充subset缓存隔离、fresh现行凭证结构、unknown/future/common-hole/supplemental-hole/schema-drift拒绝、冻结SQL/journal损坏拒绝。274补充SQL及3完整原journal逐字节匹配各Git来源；原三归档、0128、main journal、原18 runner等361项hash/mode保持。源码观察在测试执行中发生，记录为during-execution而非伪造pre-run；最终当前字节逐项匹配，安装功能未重签。

后端typecheck候选实际exit2，仅production-native-public.integration.test.ts(31,260) TS2322；原打包基点0d W也实际exit2同一条，测试文件SHA 9f15d664b5092d79624fc7210976326a0d1279df952231b3d9517ab42a4b03af相同；新兼容路径没有类型错误。既有失败沿T-1018保留，未改断言消错。新包、真实安装及用户功能验收仍待验。机器证据见 installed-migration-compatibility-result.json；原始失败/成功、源码观察、私有库行摘要仅留用户私有目录。


独立implementation/scope评审已现场封存，空findings，不新启SPEC复审。评审独查原SPEC cfbaf9、283精确新scope/integration592、361原hash/mode、281 during-run字节绑定、完整三Gitjournal+274SQL及实际test/clone receipts；未打开DB或签安装/模型/听审。私有报告 installed-history-implementation-independent-final-a0sx5ugu/implementation-scope-review.json，SHA256 69cbc0757d5910df475c5ac3c6a597187f3551be11e6656243634a280e70ae93。


## 2026-10-06 兼容修复新包的实际安装与页面失败

新冻结候选005141ef3d775ab30998ed9a4531825526ebd1ac，固定入口实际exit0、四项基础44测试通过，构建前后源码干净。新DMG `/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg`，SHA25679df24001e931ec833f84088473f096793c5223a1668c4b71723892c92ee8d05，662066662字节；镜像与包内签名exit0，277补充迁移文件全与源码逐字节相同。仍是本地ad-hoc未公证包，不是功能完成版。

另一次六根离线备份grqklp0m及最后source/copy封闭检查实际exit0；安装前再次封闭检查exit0，原App另存、旧失败包另存，未恢复/重置用户库或激活。新包已实际安装启动，App47648、server47826、127.0.0.1:50227。动态CLI404操作、full访问、旧账号/组列表分别3项真实成功，原当前组null保留。旧迁移启动问题已解除。

真实浏览器tab3客户端报creativeCanvasOperations初始化TDZ，页面不可用；A01安装/CLI部分有证据，但整体页面功能失败，A02及后续UI未通过，真实ASR/语义与业务夹具没有执行。退出打包冻结，落实原SPEC启动可用性的内部contract初始化修复；新包再次安装全功能仍待验，不将CLI成功代签页面。

本次最终reconcile实际exit1，36错误/1告警，scope authorization与complexity guard通过；原始stdout SHA d1080ca226870c8aff0c2a574efa34aa3b9ed195b751f8259b59efd2a2ab5b73，私有final-fix-reconcile-receipt.json保留。未改基线或删历史失败。


## 2026-10-06 安装页面初始化的真实源码修复

产品提交f0ada07d7落实既有SPEC：定义提取为叶子、40操作仅换import、原公共导出保持，测试精确准入mjs。提交前EOF分隔告警已实际修正，仅删1LF；最终字节复验真实62文件367通过/3文件49通过，44pre/post相同。独立实现及EOF校正空findings，原全局reconcile36错误/1告警及本次默认全仓audit419项HALT保留；focused task-preflight实际通过。普通progress done只关闭installed-contract-bootstrap，T-1062整体仍进行中，integration及安装功能未完成。重新出包前冻结干净候选，不把源码回归代签安装页面或真实Skill粗剪。

最终独评现绑定产品commit f0ada07d7dbec392578a1f7768ebe434c4307c8e全部44 Git blob，implementation-review.json SHA e2ee527bfb645ec4415d9e9d162f3d14e2aafe9f7fa1d362dbd2b3a4dd781f68，裁决PASS_EXACT44_EOF_NORMALIZED_IMPLEMENTATION_AND_REAL_RED_GREEN_NEW_PACKAGE_PENDING；未签安装功能。

## 2026-10-06 228安装版实际公开功能及两个缺陷

第二轮兼容/合同初始化新包228已经实际安装；six-root备份wms48do_ closure ed336a6保留，原App和前两失败包均未删除。普通浏览器因缺原生应用握手被正确拒绝，不能代签安装版业务UI；原生工具本次不可用。所有手工内容/组/文件均为本次自己的中性夹具；默认组公开回读仍NULL，没有造平台账号、修改真实模型配置或对外发布。

当场证据在私有installed-bootstrap-public-acceptance-20261006：public-functional-checkpoint ae549d86、public-creative-save-checkpoint b6664b64、public-master-script-group-checkpoint e5f8dc0f，以及neutral-exact-download-actual.json。每条记录保留真实stdout、stderr、退出码、请求及hash；source228/package6792绑定，没有用新源重签原801/18。中性原片实际14.924854s/视频14.920s；旧37.3s口述由actual-duration-correction明确纠正，原记录保留。人工7.42s切点来自生成夹具边界，不是ASR/AI推断。

真实源首次prepare因缺materialLink409，真实补关联后同key/同输入被CLI显示成功null，但原invocation确实仍failed、原request139不重执行；新明确合法准备155随后成功。真实纯组video V2 save/get revision3成功，preview及render皆HTTP428，未创建渲染任务、无导出。两项沿原SPEC独立最小实施step修复；本节不预签实现或新包通过。

真实ASR只返回全文，真实Skill仅给保留建议和review_only。自动粗剪/词句时间码、候选采用/撤销、字幕联动、变速保音高、原生页面与用户验收均保持待验。Windows另会话已生成67437998源的流水线整改EXE，但不含此统一Mac候选及后续运行时修复，不当作同版功能验收。


### 公开 exact 下载与隔离补验（2026-10-06）

当前安装仍为228dd08a／DMG6792ae80。公开 assets.fileDownloadUrl 取得真实文件授权，实际下载HTTP200、232847字节，SHA256 e6c0f4e72741e8f37b369d9511311569df8ef6c4e07009f3c746c632fb0e2073与未改动原片相同；另一自有中性组的asset读取与exact下载授权均404。私有实际检查点为installed-bootstrap-public-acceptance-20261006/exact-source-download-and-isolation-checkpoint-20261006.json，SHA256 8d4a6436dbc755c8afa62105724f875a0ae2dd5a4392aff0c02207f48933c8fa。此结果不代表预览、导出或原生界面通过。

### CLI失败回放实现闭合（2026-10-06）

真实源码提交d68dfbcf6a77ebd7782e0ee86addea61b38f6c66，ROOT逐文件核对独评六个最终hash、父提交918b0a1c和干净writer后正常FF；progress工具已正常关闭installed-cli-receipt。真实node:http→POST→PGlite→素材关联→DispatchClient→CLI链先复现失败，修复后原26项路由、36项客户端测试及frontend/mcp类型检查均exit0；成功分页meta另先RED2后GREEN。独评回执cli-receipt-independent-implementation-review-kvjnl7ad/independent-review.json SHA256 1fc03d6dd270cea153fa28d3774c790bc362fd85d5ec59e20884fcf11904b958。旧失败不重执、请求编号不变。running/unknown/TTL分支为隔离库状态夹具，非真实worker自然转换。Git提交成功但提示未找到lefthook，未签自动hook通过。新源码尚未打包安装；原801/Original18历史不覆盖本六源新字节。


### 纯组叠层捕获修复闭合与下一包冻结（2026-10-06）

源码3754e07fb3dfa65997ab0d21596fa2e884ab9a2c仅获准3路径，ROOT核最终字节、父4615cd87与干净writer后正常FF及progress done；integration仍待验，T-1062仍进行中。实际公开捕获RED20项12失败8通过（首fixture导入错误单列保留），最终原native/owner/hooks三文件44项及完整组合根1项通过；最终执行两源与pre/post相同。新fixture两处类型错误已仅在追加区域修正，原类型诊断(31,260)、两条既有copilot R2及既有video runtime语义失败全部保留，未改源码/guard/基线洗绿。独评final-implementation-review.json SHA256 2d80d74a26eb9cda1146382d745d52761c4ebca931a0356dea0e9515c686e99b，实施证据final-evidence.json SHA256 30c441699179583adfbc503cffe92be16031d19cbe8635a8bcfff2d0e345c4c4。没有签新包、原生界面、模型或MP4。

当前228 App已精确SIGTERM停妥，其两个子进程自然退出；仅另停两项已核idle runtime占用，未停Codex父或PG、未取消/确认后台任务。新六根离线备份offline-backup-real-provenance-journal-vjy8rndl实际20337 exit0，六lsof无占用、目录/偏好/最终closure均真实通过，closure SHA256 fc0bd0b2c5053a71f00134aaeb975e1f96b29760cf3de30abfd385ea177c971f。系统provenance原值与副本观察值单独封存，没有声称物理属性全等。队列与待确认投影原样保留；五组execution公开列表当场无queued/running，AI历史仅观察前100/4431，已见两scheduled queued/noexecution，不声称所有历史任务终态。原wms备份没有新neutral数据，下一安装只绑定本次新备份并重新验证完整性。

用户随后明确选择“临时使用本地 Whisper 验证自动粗剪”，授权当前ASR临时配置及验证后恢复原设置。尚未执行此设置变更或本地模型调用；必须动态公开描述/回读、完整保留可写字段与opaque密钥引用且绝不发送原secret，验证真实词时间码后再产候选。全文不冒充词级，候选未经用户核对不采纳。研究官方SiliconFlow接口仅承诺全文，不能因上游本地SenseVoice有timestamp功能就声称云合同支持。所有实际ASR/模型、剪辑MP4和原生功能继续待验。
