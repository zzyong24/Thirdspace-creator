# T1346：恢复账号组切换后的实际工作区界面

## 已确认用户结果

用户本次报告切换账号组后界面不变。选定新组后，侧栏身份与页面内容必须属于同一组，旧请求不能回写，新空组显示真实空态；后台持久任务继续，前台未保存/生成操作保已有离开保护。保已确认原主题和页面骨架。

## 现状与公共RED

AccountSwitcher performSwitch只router.refresh；WorkspaceInitializationProvider初载ready保持，工作区Boundary不会遮旧内容或等待RSC实际确认。现已用实际公共RED证实切换屏障缺口，证据详见下文；服务端scope读回正确。

## 方案边界

拟仅account-switcher.tsx、workspace-initialization.tsx及各自tests。获准切组时切换明确pending屏障，等真实服务端新scope渲染就绪；不能全页reload或批量改每个页面，不能改变同scope刷新保脏稿合同。既有cookie/localStorage/账号mirror按真实合同，scope generation拒过期ABA，失败可重读，不把catch置ready。不新增权限/存储/后端写入。

## 验收

现役公开组合RED先于生产；隔离真实A→B→A主页/内容主要页，立即不显示旧组内容，待新组真实结果；延迟响应/ABA、空组、刷新往返、前台离开保护、后台任务继续。两视口/真实看图。LED047、定向frontend/类型、boundary/orphan、pmem/reconcile。精确文件与公共消费者见下文；Root已独立审核方案PASS，正式reviewctl/taskctl状态另据程序回执。

## 已发生公共RED与已审最小方案

隔离私有数据/媒体/auth开发服务3956，经公开创建甲乙两组各项目，实际菜单甲→乙后scope/cookie乙、RSC受控延迟期间页面仍显示甲项目，乙项目不可见且无loading；真实RSC200放行后乙正确。原件/tmp/creatoros-t1346/red-observed.json、red-switched-stale.png；复制到docs/verification/t1346后保持SHA。此证明请求ctx能正确，切换期间旧页缺屏障，不能归为后端读错归属。

拟文件：frontend/src/components/shell/account-switcher.tsx、workspace-initialization.tsx及对应tests；frontend/tests/e2e/t1346-account-group-switch.spec.ts与隔离config；docs/verification/t1346/**。AccountGroupManager由T1345单写者独占，切组相关补丁由代理建议单写者落实，当前无需额外生产写。

Provider订阅真实scope变化，仅在已获准换scope时重置ready、直接以loading替换旧page/overlay并卸载旧子树，避免旧autosave绑定新scope；同scope刷新原实例不卸载、保脏稿。切换前AccountSwitcher现leave确认与requestVideoLeave保存/备份仍先行，ProjectVideoSessionHost外置现架构不改。外部manager enter也触同屏障，现routeRefreshScheduled=true不能只load菜单然后永久pending：统一追踪实际RSC scope提交与refresh完成。现120秒预算保，错误显示重读/恢复入口，不置假ready，ABA过期拒绝。

完整scope屏障/Suspense/RSC epoch后置条件由AccountSwitcher现公开切换与Provider组合验证；不是仅加loading状态。绑定页与首页必测，另至少一个有autosave的脚本页确认获准离开才卸载，原未保存取消仍原稿原scope。Root独审此最小方案后taskctl start再生产W。

仅首次初始化恢复页/accounts、/settings可走现recovery例外；后续已获准切组两页也必须受scope屏障，不永久绕过。新增首页RED /tmp/creatoros-t1346/red-home.json、red-home.png：侧栏甲而页面筛选/继续创作乙，RSC200放行后甲正确。

## 已确认增量：实体详情切组返回对应列表

实际隔离乙项目脚本页侧栏切甲，scope更新但保原乙项目URL，服务端正确拒绝并显示「未找到该项目，或它不属于当前账号组」；这属于安全空态，不是整页500。用户目标是切到另组继续使用，Root明确要求当前实体不跨组，获准切组后转对应组列表。精确结构映射仅/projects/[projectId]及其子页→/projects、/canvases/[canvasId]及子页→/canvases；排除/projects/new、/projects/create等静态路径。清除projectId/outputId等旧实体query，保仍合法的非实体tab；不改backend权限、不试读别组实体。router.replace目标与scope同步/RSC确认协议一起完成。现account-switcher.tsx写集内实现并测试，不扩每页。原图/docs记录保留；旧安全空态不洗为越权失败。

### 外部管理动作的唯一刷新所有者

AccountSwitcher统一拥有scope变化后的transition refresh及真实RSC完成协议。manager.enter只writeCurrentGroupId(id,'account-management')和本地current，不再重复notify/router.refresh；首组create读回后写scope、当前组archive写null同样由Switcher接事件同步。mutate尾部若原scope已变不再发caller refresh，同scope rename/绑定读回仍保原刷新。初始化complete不以只有layout新scope就放行Suspense旧page；实际页面完成与scope一致后才ready。此是现有外部manager enter合同的精化，不新增方向/服务契约。覆盖三个scope变入口及同scope保存保护。
