# T1184/T1185 独立实施复核

结论：**PASS_BOUNDED，仅限两项审定的路由测试实施及实际相关回归；本范围 findings=[]。** 本次只读核源、Git 与原收据，没有运行测试、服务、CLI、模型或浏览器，没有修改仓库。

HEAD 为 `b34447aaf7836e7798d4bd37c262eff2357aaf7d`。共同代码写集仅 `frontend/src/app/api/chat/route.test.ts`，现 SHA256 为 `ad75542e6a0f178540ad30d0046cd279fc87f60c9a080fc5c95171fe59ca2ee8`；归档合并 diff 与实际完整 Git diff 逐字相同（解压 SHA256 `95b6b98af9ebc2b4c0c9a7ece1a39e693fd76f60b5fe6a906286a00eae0ad4de`）。独立比较原用例名称为54、现56，原54全部保留，只新增明确 Codex与非法引擎两例；完整diff没有删减其它旧例、skip或预算。

T1184 的公共 durableSubmit mock 按真实提交服务要求传第三参数，使用明确 `pi | codex` 类型，缺省 Pi。原成功例补 Pi 断言；新 Codex 例同时检查实际路由提交参数及本轮装配参数；非法引擎例检查400/CHAT_ENGINE_INVALID及会话、消息、持久提交、装配四项零副作用。真实消费者仍在输入校验阶段拒绝非法引擎，原来源绑定、历史、权限、附件、幂等与恢复断言均保留。

T1185 只校准两个原用例。真实数据库完成例注入实际 workbench-plan.service 两个终态 validator；没有假放行、删除现代任务标记或放宽原子完成合同。原正文、用量、来源、租约、调用账本、checkpoint、任务/结果终态及不重复消息断言保留。断流例遵循真实零预读消费者：先用实际 response reader读取start及已确认文字，再abort；核订阅先未取消、立即aborted、后续reader结束，且没有durable cancel。请求信号进入装配和“不取消原任务”的原断言保留，没有新增后台预读或等待预算。

实际只读比较路由、提交/完成服务、终态validator、stream、dispatcher、附件及相关公共测试，均与基点字节相等；前后端vitest配置、package与reconcile配置也相等。其它工作树控制文档/事件和T1183独立测试改动不属于本写集。当前两份SPEC与constitution的实际SHA及各正式初审/原独评路径见READ_SET.json。record/start原收据均为0，事件绑定各自SPEC且在当场验证之前；根代理记录的编辑顺序与来源快照一致，本复核不补造首个编辑动作的独立时间戳。

已逐份校验所有归档receipt与私有原receipt字节相同、gzip解压与原log字节相同、实际log SHA等于receipt.logSha256：

| 实际命令范围 | 原结果 |
| --- | --- |
| 原完整LED014诊断 | exit1；前端147 PASS/29 FAIL，后段未执行 |
| T1184首轮focused（文件名含green） | **exit1；54 PASS/2 FAIL**，不按名称误签通过 |
| 最终route focused | exit0；56 PASS |
| 真实提交/宿主、完成服务、stream宿主 | 各exit0；31、61、23 PASS |
| 前后端类型、boundary/semantic/orphan/diff | 各exit0；边界原5条基线和orphan原100警告保留 |
| 原完整LED014最终串行 | **exit1；96.762120秒**；前端7文件178 PASS，后端实际3文件264 PASS/2 FAIL |

完整LED014的实际原日志SHA为 `4fffe363cea4e4fa07c03f0f9a27c22a568db1bd7226d754f092748994c583ee`。两项失败均在未改的chat-tools.test.ts：selected/project全工具参数样本遍历对canvas.propose的safeParse拒绝；由T1186独立承接，不在本报告认定其根因或校正。命令虽列四个后端路径，实际只发现三个文件，第四个没有PASS证据。实施叙述、结构汇总与原收据/log一致，没有清零或替换失败。

原b344 canonical仍为exit1、27 ERROR/1 WARN，完整原日志SHA `34e36c225d9ab3429c82470294d13ab8c3b7adb266919d6d1e65c09713c9caee`。本局部PASS不代签完整LED014、canonical、任务完成、原生App、真实模型/Codex进程、平台/安装版或全功能。T1181/T1182仍暂停/researching、实验2/2耗尽、剩余0，素材可见性根因UNKNOWN；本次没有恢复研究。完整实际读路径及各SHA在READ_SET.json。
