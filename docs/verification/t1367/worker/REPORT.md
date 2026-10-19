# T1367 Worker 受控实现与验证

受控实现及公共链验证已完成，源码/测试已冻结。真实平台 owner 结构与视频号采集恢复仍 UNKNOWN；site-safety 边界有效，没有读取被拒页面、调用真实 collect/diagnostic/CDP、复制正式 profile、读取用户库、打包或安装。原281/1499/1502/1726等历史失败未修改，本报告不签 T1367 任务完成。

基底为 managed tree `00b7b21ae0bb505aabed3edeb6b4f71ded3f3f94`，产品原基线仍2d；冻结 SPEC SHA aef632c5dc25ded3dbd020e4bf22b612959ab3f9f8dafd4fe6a2940cfd5e9971，独审R2 c7a98f074848 后实际 start、Root放行才写源。

## 实际变化

- 完整保留原 initial 菜单观察；仅其真实 REPORT_LINK_MISSING 且未点击 centre、原signal/deadline/origin仍有效后进入独立恢复。原直接/中心/晚到/点击前晚到与后续报表路径不加新门。
- 使用真实 Playwright 精确可访问名 button/menuitem/link 语义定位固定目标；按真实 DOM identity去重。hover前唯一、visible、enabled、命中并重核，不从div/title/cursor/图标/宽祖先升级候选。
- 每prepare最多一次hover；入口仅允许原owner自身/后代或其明确aria-controls关联面板，tooltip/无关同名浮层不点，关联内两actionable不任选。aria-controls目标ID须唯一，panel/owner替换、脱离、名称或关联变化停止。
- IMPL001独审修正：hover后只复核原owner connected DOM身份及精确语义、controls和panel关联；关联面板盖住旧owner中心不能反杀真正可点击entry。真正entry的visible/enabled/hit与点击前节点复核保持严格。
- 每report显式增加owner观察/一次hover/关联entry观察各120000ms；三report默认source聚合7370000→8450000ms，仍由原collector持久绝对期限裁剪。新阶段end只生成一次，旧observe先读value逻辑未改。新phase只有固定三enum，投影丢弃附加私密字段。

实际tracked写集4文件：witness、source、source.test、channels公共集成test。SPEC允许的dom-witness.test未修改，仍随旧消费者回归与五文件freeze绑定。没有contract/backend/frontend/diagnostic observer/host生命周期算法变更。

## 当场证据与版本

|证据|实际退出与结果|适用字节/边界|
|---|---|---|
|RED_PUBLIC_01|exit1，1真实失败，suite128.35s；执行120319ms，REPORT_LINK_MISSING/EXPORT_FAILED，0hover/0下载/0提交，实停后DB释放|原2d生产；RED_SOURCE_TEST_SHA256与RED_TEST_SNAPSHOT保旧测试，运行中仅补辅助测试造成终端stack当前行偏移，未伪补RED|
|AUX_GREEN_01|exit1，20PASS/5FAIL，80.89s|初版；2项DOM pointerenter/浮层跨report夹具口径，3项取消终态早于DB释放的测试等待口径；原FAIL保留|
|AUX_GREEN_02|exit1，26PASS/1FAIL，85.76s|中版；reportOwner辅助时钟跨prepare计数未reset，属测试校准，非生产缺陷|
|AUX_GREEN_03|exit0，34PASS，106.02s|89d6；新辅助族全部受控时钟分证|
|FINAL_PUBLIC_ALL_01|exit0，60PASS，304.05s；主实际121374ms，首次显式hover120322ms，3下载/3报告/公开同run读回，physical→DB release分别真实确认|witness89d6，source b694，测试259dc；原25 baseline各有hoverActionCount0安全日志|
|IMPL001_RED_01|exit1，128.04s，hover动作自身TimeoutError|同步覆盖影响前置真实hover，不算后置复核缺陷RED|
|IMPL001_RED_02|exit1，7.87s，REPORT_NOT_READY/hover_owner/0下载|89d6；真实hover resolve后有限DOM barrier，owner connected/name/controls不变、中心实际由panel命中、entry真实可行动五proof全true，才确认后置误挡|
|IMPL001_GREEN_01|exit0，8.67s，3报告/3下载/一次hover，五proof仍全true|最终d1c0df98后修|
|FINAL_POST_IMPL001_PUBLIC_01|exit0，60PASS/1SKIP，182.81s|最终d1；实跑覆盖新增IMPL001、其余全部新族及原25 baseline。唯一SKIP是原真实120秒主族，Root明确允许继承89d6未改观察时序；不把89d6完整60PASS冒签d1全61实跑|

所有浏览器来源均本地合成官方origin且其余abort，DNS禁外联；真实Chromium148执行真实DOM/hover/click/frame/下载，createDb无dataDir为内存PGlite，真实collector/parser/backend service保存与公开读回。hostLifecycle在合成身份/目录上使用真实DB租约；context实际close、source physicalStopped和DB releasedAt各自确认，不用release回调代签物理关闭。取消可先有终态，测试等待真实release gate再关合成DB；故意stopUnconfirmed族保held/pending，不直接释放。

后修新源60例包括button/menuitem/link/aria-labelledby、同owner隐藏重复标签、hidden responsive、owner自身/后代、关联唯一且全页无关同名仍存在；也包括无语义/宽容器/名称冲突/disabled/遮挡/两owner、tooltip/无关浮层/两关联entry、重复panel ID、controls/owner/panel变化及各恢复阶段/实际hover与click中的取消和原deadline。原25集合逐例保hover0，按实际test name集合记录，不沿历史口述27数量。

旧source/witness/Wujie/公众号、worker types与timeout门由另一Sol在 `../source-validation/` 分证；最终身份应以其最终SAFE_SUMMARY/REPORT为准，原types六FAIL不删。中央boundary/semantic/orphan与独立实现审由control/reviewer持有，本worker不代签中央结论或global56/T1366、foreign9/T1255旧债。未重复完整reconcile。

## 冻结交接

五文件完整SHA在 `FREEZE_SHA256.txt`，其中两生产分别witness d1c0df986c22e0938e6083324057d27b55bb29f9622810feca8af59229a20f6b、source b694b4145fd7819e659a4a6d204a834827958a5d5e1d951d7dce4e47bfa6ee72。最终public test 66d27f152f05251a74b785c765caf76cb647207dfff2efcc7723e7708419d363；source.test cdf44c6b21d535fb235b0fc7d9658071a44f11c02e3d16d51fee7ff048d16d44；未改witness.test aaa5c61c38eec8aaf75c293cf354c8513c086df48cf4a077b1f0a7f7e888ad6a。

`PROCESS_RECEIPTS.json`记录本会话实际tools.write_stdin完成session/chunk/exit_code与冻结输入；时长引用各runner原Duration，不将末次poll延迟冒作整段墙钟。`SAFE_SUMMARY.json`记录实际attempt退出、日志hash、主墙钟safe事件和最终25条legacy证据；`git diff --check`已exit0。停止重复测试并冻结worker，等待Root整合及独审结论；实际站点恢复不在本阶段已证范围。
