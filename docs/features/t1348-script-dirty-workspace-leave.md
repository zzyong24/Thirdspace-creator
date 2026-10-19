# T1348：核心脚本未保存时的切组离开确认

## 用户目标与新发现

本轮用户要求切账号组后界面真正切换，同时原资料与合法任务保留。T1346获准切scope后卸载旧page/overlay是防旧autosave串新scope的最小安全策略；但公共实测发现普通核心脚本dirty/saving未接既有foreground registry。关闭自动保存后编辑marker、切另组，dialog=false、scope已换、原稿可见UI丢失。证据由account_switch取得：/tmp/creatoros-t1346/dirty-current-red/三件原图JSON与log，实际脚本script-dirty-public.mjs预期断言FAIL；将复制docs/verification/t1348/red，不改原结果。原版对照尚待隔离HEAD88945/private3958实测，不能先称原版无损。

## 精确范围与方案

FR-1348-1：ScriptRichEditor现saveStatus、ScriptStructureEditor现status为dirty或saving时，使用已有useForegroundActivity注册人话「脚本有未保存的修改」或对应保存状态；saved解除，卸载释放。两现状态仅saved/saving/dirty，无新增数据字段/保存队列/自动保存策略。代码不替用户决定保存/丢弃。

FR-1348-2：AccountSwitcher保现有前台离开确认，dirty时选另组先弹确认且scope/路由/编辑器内容不变；取消保原稿原scope且无额外自动保存请求；明确「仍然切换」才沿既有T1346屏障卸载旧树并显示目标组，后台持久任务继续。原video requestVideoLeave保存/备份与模型任务保护不改。

精确生产写集：frontend/src/features/script/script-rich-editor.tsx、frontend/src/features/script/script-structure-view.tsx，仅import/useForegroundActivity两既有状态接线。测试对应script-rich-editor.test.tsx、script-structure-view.test.tsx；必要公共e2e放docs/verification/t1348/**或现T1346 e2e脚本的dirty动作，由account_switch执行，保持串行锁。既有registry/AccountSwitcher生产源码不为本任务再改。流程文书唯一account_control负责，Root独审，account_switch执行。

## 验收与Gate

独立SPEC PASS及taskctl start后先两编辑器组合RED（原dirty/saving hasForegroundActivity=false）与上述实际公共RED，之后最小接线。GREEN两种编辑器dirty/saving注册、saved/卸载释放、其它活动token不被误清；关闭自动保存的公开rich/structure真实文本编辑→切组确认→取消，原稿逐字/scope不变、0意外保存；再明确仍切目标组正确、回原组只显示已保存真值，不能冒已丢草稿自动恢复。保存进行中同理提示且不串scope。

复用原功能/保存/脚本scope保护回归、LED047及必要类型/boundary/orphan。真实浏览器正常与最小视口、键盘/焦点/取消，实际看图，Root独立核用户提示。原版与当前RED、环境错误保；不改保存协议/不扩大其它编辑器、不以本任务重置T1346评审轮次、不签发布或真实模型。最终pmem/reconcile按任务真实门据完成，未完成诚实保留。
