# T1285 原 CAS 请求只读恢复复验

2026-10-14，共享工作区、私有3919服务。独立操作代理，与修复作者分离，同模型继承。生产修复5c8ea3cf8，本目录只有真实公共链路与UI证据，不修改生产或控制面。

恢复同一个临时Chrome profile及原tab/sessionStorage，无手工注入状态。仍为 output-5e3e4e95-61、production-5e3e4e95-68、原request `79622981-9257-4545-a849-e0230a081b4a`、候选base4，正式current6。没有新候选、新业务请求ID、apply或save。

原profile首次恢复点击核对后，等待丢弃可用断言耗尽node工具120秒外层，内核清理了浏览器；该次仅保留操作前截图与缓存，没有完整dispatch，不能推断旧JS或确切请求序列。原缓存自然存续。随后重新恢复原profile，按授权普通刷新原tab加载修复，再点击一次“核对原采纳结果”。本次真实序列为receipt.get（200/null）→editor.get（同production rev6）→receipt.get（200/null），详见responses.json。

界面提示“工程已有新版本，已核实原采纳未保存。文字稿已保留，可丢弃旧候选后继续编辑。”旧候选1项调整仍可见，textarea逐字符等于原输入，丢弃按钮可用。实际点击丢弃后，textarea可用且全文仍相同；普通fill新增换行成功，再还原原文，不生成候选。恢复后sessionStorage只保base/draft，不能据此声称候选跨后续刷新仍在；本轮确认当前UI候选保留至手工丢弃。

完整before/after正式DTO相同，output61仍revision6；source201完整DTO相同且revision6。dispatch里save/apply/propose均0。截图recovered-discard-enabled.png和after-discard-editable.png实际查看，前者可见解锁提示/候选，后者可见可编辑文本焦点。Chrome沿用原生200%设置，截图仅以CDP captureScreenshot读取表面，未改变scale。

原T1274 CAS409和只读恢复FAIL仍在原目录，未覆盖成PASS。此轮仅关闭已前进版本且双回执空的原请求恢复缺口，不签全产品或所有竞争族。最终浏览器正常关闭，已通知root可停3919做build。
