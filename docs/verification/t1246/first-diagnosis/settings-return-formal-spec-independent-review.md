# 设置可信返回：正式窄合同独评

结论：**现 capture 即记录“接受来源”的合同仍有一项阻断；父线程提出的实际 route commit 方案可在现 4 产品文件内可靠落实，应据此修订后窄复评。** 本评审不是该提案作者，不改 SPEC/产品/测试，不运行浏览器、PG、模型或 App，不签父任务最终控制面 PASS，不解除冻结。

绑定本次读到的 T1246 SPEC `8b2dee08aee0e07b856efb185715eb3cf639e04636955b8662946e8be4fb1ad2`（settings 部分同父线程原交付 `0e805eb72a922422663f5918aabcf1b9cb132e82987613792128cc04b7995a05`），独立他人提案 `126e0aa304dbf90b66285e3f2d49041cc7ffbf9bad521984ff4c0c193ecae0bc`。23 个现有源逐字同冻结533；新context及3测试均尚缺席。证据 `settings-return-formal-spec-source-recheck.json` SHA `f96086e76e94b3c9dfe42fdd9fb2cfa325034a61c09dfe20724bd1f2e3c706c6`。

## SR1246-01：捕获时 defaultPrevented 不能证明导航接受

`AppShell.tsx:104` 的 capture 先于子节点最终取消。原 `sidebar.tsx:437–444` 的 Next Link.onNavigate 实际主动 preventDefault，再调用 usePrimaryNavigation；Next普通Link本身也对合法SPA点击 preventDefault。`workspace-initialization.tsx:75`、`daily-report-page.tsx:37` 等真实settings Link未走primary hook。因此捕获即pending会把取消点击留成未来错误来源；微任务看到defaultPrevented即否决，则又丢合法原返回。不能事件monkeypatch、改Next或扩大所有Link写集。

推荐采纳父线程的**实际 route commit 授予来源**：稳定AppShell context记录上一真实已提交非settings的完整URL及scope epoch，仅观察到本宿主从该snapshot实际提交/settings时激活返回；capture仅可选focus候选，不授予来源。取消/没有route commit不会产生返回授权。初次直达/settings或完整重载没有snapshot，安全replace首页。所有现存站内Link/程序入口均继续原导航，通过同一提交观察保持原返回，不缩成“只primary”覆盖。

## 原消费者证明与需要写清的最小状态规则

方案无需扩大4产品写集：ShellRouter:396已有usePathname，:436已有useSearchParams提交；新context可自己使用这两个原hook，在稳定AppShell内挂载，不改ShellRouter。实际Next app-router同步canonicalURL到这两个hook；提交时还须核window.location与hook信号一致，避免旧pathname混新URL。**存原window.location.pathname+search+hash字节**，不通过URLSearchParams重编码；hashchange/popstate仅通知URL变化，不扫描history/私有Next state或Navigation API。hash-only及copilot本地query同属来源snapshot更新，不导航、重建业务参数或授权draft。

状态应固定：首次非settings commit建立snapshot；连续settings/query/highlight提交不覆盖原来源；新非settings commit使旧active失效并更新snapshot；close消费一次；返回地址真正提交后才恢复焦点并清记录。direct/full page.reload清空内存，**原settings保存的router.refresh（use-settings-mutation.ts:20）不是完整重载**，同宿主同设置entry应保来源，不能保存设置后突然回首页。原usePrimaryNavigation可只传focus候选/token与失败失效，不对来源授予资格。

scope失效须使用原accounts-changed/storage事件当场推进私有epoch并取消迟到记录，不仅比较最终渲染的creationScopeKey：原useCreationScope:85返回的是key snapshot，批处理A→B→A可能只渲染最终A。不得调用creationWorkspace.assertCurrent要求有效组；无组用户设置仍可返回。scope变化不恢复cookie/选择，不扩当前成员授权，不把平台筛选变化误作另一组业务owner。

Next Activity可保留旧SettingsDialog组件状态。每次新的实际settings entry generation必须只重置一次open/closing ref；同一entry的highlight/query/router.refresh不重开或解除关闭防重。否则前次setOpen(false)和同步closingRef可能令再次打开没有弹窗/不能关闭。只在原settings-interactive-region.tsx内接context，不重挂AppShell或video宿主。

focus候选须匹配原sourceURL、entry generation、scope epoch；取消/新事件/失败/不同提交后的旧候选不授予焦点。缺可信节点只聚焦实际返回页可访问heading/main；隐藏Activity、inert/不connected元素不能算返回页。DialogContent原props已透传onCloseAutoFocus，新settings局部preventDefault即可，无需修改全局Dialog。真实返回route未提交前不聚焦，不靠sleep或先back试探。

## 保持范围与准入

单次router.replace原完整URL或首页的具体关闭决定必要且可实施。原fresh完整两例2PASS/3次back/accounts只作补充，原170两红和长suite因果UNKNOWN保留；direct blank事实与它们分开。

原ProjectVideoSessionHost:59在隐藏路由下仍保session/key/owner，同项目/output/scope恢复visible；新context不能条件包裹导致重挂、不dispose/存稿/新任务或改deadline。实际dirty/在途同task/call回归仍必需；文章/图文无通用稳定session不代签。4产品、3新增测试及2现有测试的精确集合足够；全部23只读源不顺手改。

新增测试须真实宿主覆盖route commit来源、普通Next Link取消与primary受控preventDefault、同URL不同query/hash原字节、无commit/失败/刷新/两次entry、scope ABA、close/Escape/遮罩只一次replace、无组、焦点与dirty稳定宿主；公共1366/390、原settings两完整body、LED047/timeout依旧实际执行。SR1246-01修订为上述commit合同后可作设置窄合同准入；V3工具交付/源码实现/真实测试与父任务其他缺口另评，不提前签通过。
