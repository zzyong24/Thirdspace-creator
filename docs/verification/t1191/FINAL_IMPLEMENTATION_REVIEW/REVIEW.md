# T1187 / T1191 最终精确实施独立复核

结论：**当前精确源码与已完成的原测试局部 PASS**。不签任务完成、完整 Gate、完整 UI、原生 App、新包、安装、模型或研究恢复。仅只读源码/Git/文件与收据；未执行测试、服务、浏览器、产品CLI、数据库或研究，未写仓库。

当前HEAD：b34447aaf7836e7798d4bd37c262eff2357aaf7d。
产品路径：frontend/src/features/copilot/ai-copilot-content.tsx；SHA 60fe11f9b68530fbe22a0e282e1eca182659c5e917dba281a04d0eaaa9adc1da。
测试路径：frontend/src/features/copilot/ai-copilot-content.test.tsx；SHA e6163928151eb6cb23b364571131b709d680337c06a510b69047cc72b1d301f8。
SPEC SHA：38bfa86de9ab922f6058bf7d66fd56ca14c4fe8a947268641e36930b0a63e8f9。
[逐路径实际读集](READ_SET.json) SHA：da2d9326eed3111a6f52f73fc1f92d9dc4b51cd78a97c11f1f2963a5ee1a72e3。

## 源码及前置时序

第7条正式recheck原receipt/log exit0，03:24:40.785644–03:24:40.943958 UTC，REV:ad518ff0cf03，原log SHA 2e3ef49108d84b316641a478815addfbdb7d968a7f5bf19336153dc2e6e3bb07。工具所有review.md未改。当前文件时间03:24:44.475267 UTC及后续原回归时间支持正式记录→class→回归，不以mtime替代原审计。

最终源仅content根新增overflow-y-auto。去掉该唯一token，完整SHA精确回到前轮346cf00843c6f2283ba244c85d8dd41e5e9118645e856df12e9100ce1eda21d0。因此前轮第1–6项逻辑按相同字节继承：attempt/ref/session/epoch归属、晚prepare提交/业务回写保护、原附件快照、可信preparationFailure才重prepare、普通SDK/source恢复、同session中性pending刷新、原三次1/2/4秒预算均未再改。T1187四处currentTaskId空回执及acquire隔离替身仍是既定测试边界，不代签真实生命周期。测试/Provider/OverlayController/Dialog SHA保持；消息下限、composer、字体间距及宿主不变。未发现该单class增量新增的产品阻断缺陷。

## 最终源实际测试

N原receipt/log与W docs/verification/t1191归档收据/解压日志逐字一致，实际log SHA与receipt.logSha256一致。四条完整argv、原收据与日志SHA、时间在读集逐项绑定。

| 原命令 | 当场结果 | 秒 / exit |
| --- | --- | --- |
| LED020 | 后端实际3文件274 PASS；前端95 PASS | 19.2175345 / 0 |
| LED047 | 原8文件174 PASS | 13.475259792 / 0 |
| LED059 | 后端20 PASS；前端67 PASS | 10.669285667 / 0 |
| frontend tsc | 真实类型检查 | 9.740720875 / 0 |

前轮31例、真实control/session/server consumer/interactions四文件83 PASS与严格准备七文件46 PASS属于前轮逻辑快照，不冒称class后全部重跑。原RED、firstcandidate28及LED047/059失败保留。

## 界面及证据发现

maker最终normal/global manifest的243项不同源路径与当前字节匹配，冻结静态输入/实际驱动/入口无候选CSS注入。100%四组0→0→1、原text/full target及200%真实Chrome=2、正常focus后标准滚轮使textarea完整可见/五点命中，均只作maker真实组件证据。200%仅Tab仍未使全部边框入视，不签Tab-only PASS。

fresh独立任务原报告/收据/驱动已实读；四组原收据索引独立重算均一次原话、全target相同。两种准备恢复在两视口完成到真实SDK的**私有fetch固定503边界**，不是实际后端或模型成功。原请求核对未执行：raw log55核对按钮disabled=true，普通submit disabled=false且textarea仍原话；log56仍仅1 POST。不据此判重复请求，保T1193已登记诊断。200%关键键盘入口可达；prepare两视口及creation宽窗原生滚轮可达，fresh creation窄窗wheel-only完整底部未证实，实际47图仍裁切；maker不同focus+wheel路径不洗掉该未验。环境连接拒绝/browser closed根因UNKNOWN，执行者Tab误计已纠正，不归因产品或root清理。

fresh独立视觉18图报告保留原话/发送外观歧义、估算字号待CSS核及短高分段阅读建议；未证任务阻断，也非零问题或完整UI PASS。T1193诊断待验，不清用户新稿、不扩大字体/状态写集。

maker原70项元数据只有69项匹配：自身final-source-report.log原报0字节/空SHA，实际2225字节，SHA190455fd7629c0b5fc516b3f631c83d422a7bcc02426b9610252b343e08b76e2。**原清单闭包FAIL保留**。append-only补充b1dc94551270466aa80132a7e3c7ddf456dabbd7e7e8974a9234e94ee148502b已独立核70/70字节与46/46 PNG IHDR尺寸匹配；仅签最终测量，不倒签原报告，不由尺寸签看图。

## 保留失败与待验

扩大owner/worker链仍11 PASS/4 FAIL、exit1（T1092/T1192）；完整timeout-policy仍27 static FAIL、公共166 PASS、overall1。后端/schema/outcome/预算未改，不签公共链全绿或完整输出无损。旧canonical27 ERROR/1 WARN、19审核欠债和T1181/T1182研究2/2用尽暂停保留；当前新canonical结果未签，新包尚未构建。

真实保存页、实际设置页、会话回执/核对、任务恢复、附件操作、native/安装/模型及新包均无本报告PASS。该源及已发生测试可作clean main包前输入核对；提交或构建后新字节须另绑实际SHA。
