# T1220 验收进行中

独立前置范围PASS见independent-review.md。沿原oil-ui-pro方向，只在drawer有真实保存离开回调时显示上传link；普通/键盘激活阻止裸导航并使用原leaveCanvas先保存，aria-disabled配真实事件拦截。page不重复入口，共享素材搜索/确认和数据契约无改。

当场聚焦RED3失败（仅T1220，38旧例因-t筛选没有执行）；不是38项本轮通过。修复后完整canvas-editor+asset-picker两文件46/46通过，无跳过/重试。typecheck第一次真实4错误为本轮测试错误使用testing-library不支持exact选项；原log保留，移除这4个冗余字段后typecheck-final.log实际exit0。boundary无新增，5既有基线违规保留。

真实隔离浏览器3903正在跑13项画布+2项新建项目；上传点击、公共canvas.get及1024/1536截图尚待该次完成，不预签GREEN。原生App、真实模型、完整全功能及全局对账不在本报告冒签。


2026-10-11 独立正式 verify driver 第一次实际 exit0：完整组件 46/46，隔离 Chromium 上传旅程 1/1（21.8 秒，整入口 52.1 秒）。原 3903 的错误 heading 断言失败保留，按真实 main/data-page 和上传控件修正后重跑，不覆盖旧失败。

真实公开 canvas.get 保存前 revision=2，离开前保存后 revision=3；同一个画布/组/项目 ID、标题在返回和刷新后保持。证据 run-1791693576382-48272/observation.json，浏览器和组件原始日志同目录。1024×768、1536×1024 抽屉上传动作截图 after-upload-1024.png / after-upload-1536.png 已实际看图；原副作用、错误留稿/重复点击保护由组件真实端口用例证明，不代签服务器 CAS 竞争。严格 frontend-validation validate 已 PASS，完成入口还将按现有 Gate 独立执行一次，不改报告版本或旧截图。

全局 reconcile 仍在执行；此前既有全局失败与超时静态欠债另在 T1204/T1081 登记，不写全绿。T1217 来源归属缺陷、真实模型、原生安装版全功能验收继续待实测。


正式 taskctl complete 按原 required receipt policy 再执行 verify driver，真实 exit0：run-1791693959226-51961，组件46/46、浏览器1/1（25.7秒，整体约1分钟），HEAD仍9fde2af65。taskctl将T1220置完成并记审计，验收PASS:3efcbce4a8c7；严格报告仍指第一次真实图/回读，第二次独立结果另存，旧原失败未覆盖。独立最终复核已签窄链PASS，新增链接独立键盘操作未实测、真实上传/原生/模型/全局不代签。


对账观察说明：本轮reconcile于冻结9fde树启动，但耗时期间T1217在明确Next关闭后进入五产品文件实施；因此该长对账的晚期检查可能观察不同源树。只保实际完整命令/退出/已打印问题，不能用它代签同一冻结commit的全Gate；稳定产品树还需完整非concise日志复验。T1220自身两次严格driver均在产品树未变化时真实通过，报告边界不扩大。


该长对账已实际结束，exit1、28 errors、0 warnings；concise仅打印5项，其余23省略。首项为BACKLOG RUNAWAY，另有旧评审回执缺事件/过期/锚不一致。完整原日志reconcile.log保留；此运行晚期混源且输出不完整，既不能冒签稳定树全Gate，也不能把旧全局问题说成本链全绿。稳定后补完整非concise对账。
