# T1169 恢复账号转组弹窗关闭后的触发器焦点

用户要求验证有问题建task及时修复。当前T1159独立Cua真实走查在隔离31469服务从两平台账号管理分别打开转组弹窗：视频号1366×900、公众号900×900，打开后焦点在目标账号组选项，Esc可关闭，但关闭后AX焦点在页面根节点，未回原转组按钮。该行为违反账号组UI_RULES“Esc关闭浮层并把焦点还给打开元素”。实际截图/AX记录保留在docs/verification/t1159/independent-task-walk，本任务不把正常路由返回键盘从页顶开始称作违约，不声称绑定弹窗焦点失败（独立走查未点击可能直接开始扫码的入口）。

阶段4-build维护修复。精确产品写集仅frontend/src/features/platform-account/account-group-manager.tsx中的转组弹窗打开/关闭路径：两个现有转组触发器记录event.currentTarget及原所选组，DialogContent关闭时在触发器仍连接且仍同所选组时preventDefault并focus；触发器已消失或上下文变化时不聚焦旧元素。复用项目已经存在的onCloseAutoFocus实践及原Dialog，不改共享组件/默认全局焦点，不改变转组preview/commit、membership版本/归属、busy关闭守卫、管理折叠/隐藏/绑定/路由行为，不创建新转组请求。关闭后仍由原按钮再次打开并留原可用目标。

测试写集仅同目录account-group-manager.test.tsx与frontend/tests/e2e/t1159-wechat-native-report.spec.ts。先独立SPEC审查/start，在未改产品时新增原转组Dialog的Esc/取消聚焦RED；GREEN后原所有账号组管理测试保留，核打开/关闭不会调preview/commit，重复打开仍同成员。当前Chrome原两账号×三视口每次管理展开/转组/Esc后加toBeFocused触发器，全部原真实数据入口/0/refresh/back/repeat/身份400拒绝/零副作用保留；原120秒、0retry与有限外层不缩短。真实scope变化的旧元素保护用现有组件fixture单独核，合成测试不代签真人。

oil-ui-pro0.10.0局部交互修复，原丰富紫色方向、tokens、Button/Dialog和同页本地打开保持。原独立任务走查缺口与前图保留，修后主Agent原浏览器键盘结果/前后截图确认；不为小焦点修复新增审美评分。原管理测试、frontend类型、原Chrome、LED047、boundary/semantic/orphan和diff执行；全局旧超时/审核欠债单列。

控制与证据仅本SPEC/review/当前证据、BACKLOG、modules、DECISION_LOG及真实events/review-events、生成PROJECT。不改原验证器/原来源记录/研究预算，不访问用户DB/真人微信、不扫码/模型/下载安装触发。
