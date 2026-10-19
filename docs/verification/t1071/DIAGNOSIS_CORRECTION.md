# T-1071 管理导航探针纠正

真实键盘Enter进入文章/浏览器后退成功后，点击管理Link进入/accounts。主会话错误地预期“离开前保留剪辑稿”modal，等待120秒实际timeout（exit1）。这个错误的探针预期不等于产品失败；最初快速DOM观察也不能代替完整页面后置读回。

完整实际原生读回：/accounts已呈现；原host connected=true，sameHost=true，sameEngine=true，原生文档positionX=11。shell-router.tsx原源码始终将全部children包在同一个ProjectVideoSessionHost中，因此账号管理只隐藏同窗口剪辑，并没有卸载。该入口不需要拦截保存；新增guard会改变已有可用切换。

临时SPEC追加guard草稿未准入、未写产品、未记录新review receipt；现SPEC恢复原独评b6dc7eb70c7768e989b452865b0abad8d9ec42ebc33882b0f41294ede300ce36。原四路径实现范围不变。原错误等待日志在本次tool输出，私有account-dirty-navigation-failure.json保留且另加纠正说明，完整真实回执account-hidden-native-readback.json保留。主会话已向用户纠正误判。

临时草稿保留如下，仅作为被证据否定的诊断历史，不是当前产品指令：


四路径修复后的真实浏览器已确认同项目脚本/文章/图文切换保留同ShadowRoot和同原生句柄，位置X=11及选区不丢，四步没有制作工程重读。另一次键盘进入文章/浏览器后退成功后，点击账号切换菜单的管理Link却直接进入/accounts，常驻宿主随项目工作面卸载；没有“离开前保留剪辑稿”对话。这是真实失败，不把既有切组守卫当成管理导航守卫已生效。当前测试稿在隔离库，正式保存工程未改。

同一个已准入`account-switcher.tsx`管理Link补上现有`requestVideoLeave({href:"/accounts"})`调用：普通当前窗口鼠标/键盘点击先阻止默认当前导航，取消则留原工程，接受后才使用现有router导航；中键、修饰键和新窗口的原Link语义保留。不新增守卫状态、modal、owner、服务契约或存储；复用现有剪辑宿主的保存/恢复原回执/备份/继续编辑路径。切组已有守卫不改。对应同一`account-switcher.test.tsx`先真实RED覆盖取消不push、接受后push、未决点击不绕过以及modified点击不拦截，再GREEN；真实中性工程以X11确认提示/取消后同句柄/X11，保存后管理页面与返回可达。

这是用户要求修复卡顿并保留创作状态的原授权内行为修复；未改变产品方向、架构、IA、服务、数据归属或发布标准。追加原因与授权记录在本SPEC，不要求用户再次批准同一修复。必须先独立评审本次完整SPEC追加后才写此产品行为；原TDD、前四路径与首次真实失败证据保留。其它主导航的不同合同不顺手扩入本任务，发现项留真实范围界限。
