# T1214 导出被平台弹窗遮挡

用户要求所有自动化可运行且及时修复。T1212观察的月明原run-4f1bbadf-5506-4090-ae34-12a727fb60ac于2026-10-11T03:01:15.875Z真实failed，公开jobRuns.listByJob报投稿作品点击locator.click120000ms超时，实际日志明确可见且稳定的投稿作品tab被 douyin-creator-pc-modal-wrap / portal 截获pointer事件。未见投稿列表是遮挡后结果，不能称网络断开或采集消费未进入。原定时系统随后自动新建run-65c331df-6c9f-4429-bc44-20d59ec1766c；人工未调用runNow或重发。

现有runExportOnce只按我知道了文字关首屏弹窗，找不到即忽略，之后三轮点击+轮询会长时间等同一遮挡。真人弹窗内部正文和关闭按钮尚无直接观测，不能编造其文案或证明新selector在真人页面必存在。

BUILD产品写集仅frontend/src/server/ingestion/douyin-cdp.ts，测试新增frontend/src/server/ingestion/douyin-export-modal.test.ts。先用真实隔离Chromium的静态平台类名/aria结构重现pointer拦截，不访问平台、用户Cookie、私有CDP或账号文件。既有无modal/我知道了导出成功回归保留。

修复：在既有导出modal阶段通过DOM定位当前可见平台modal/dialog中的明确关闭控件（专用modal-close类、aria-label Close/关闭的button、明确关闭data属性）；只有这样的关闭控件可点击。不要从任意文本猜体验/同意/授权按钮，也不使用force-click、隐藏遮罩或DOM删除绕过。移除上次机械标记后单一标记当前可见关闭控件，原locator可信点击和原至少120秒预算；旧我知道了路径保留作为原明确选择的已接入引导。点击后核可见modal消失；如仍有下一层只重新定位显式关闭，不无限点击/扩大重试次数。没有安全关闭控件时保原页面与错误，不猜补，不吞真实导出失败。

验收：真实Chromium在投稿作品tab前上层可见modal截pointer时，旧入口在该真实控件上发生阻挡（记录受控actionability诊断，测试不缩产品timeout）；新入口关闭该显式控件后一次tab/子tab/导出成功，先监听再导出、不重复点击、正常关闭资源。多个层/已隐藏modal/同意按钮不可点击/通知失败/取消/旧无modal/旧我知道了回归。原待执行任务新包实际导出结果单列；隔离页面不能代签真人弹窗结构或外部成功。

不改身份校验、采集可见性、下载格式、任务ID/预算/归属/调度、网关/默认超时；与T1212/T1213同包。先独评、当场RED再实现；本任务不证明既有raw错误文案已全部脱敏。

安装见证采用T1212已明确的一次公共验收规则：仅确认同job无running后，当前已授权账号的正常runNow；保所有旧ID/失败/结果，不重复pending。隔离弹窗结构与真人实际是否出现分别报告。
