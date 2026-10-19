# 正式 script.review 当前稿消费者补漏结果

本轮受控公共链两族 RED→同链 GREEN 均已当场发生。唯一产品变化由 C 写入 persistence-client 的 reviewScriptSource 薄组合：从已审确认稿reader拿精确 artifact/currentVersionId/fullText，再查该具体不可变版本号；只有null才沿原seed。原prepare版本/空稿门、canonical与素材包legacy投影、旧历史digest均未改。此是本地受控证据，不是最终新包或真实Codex/U18验收；U18仍NOT_RUN。

用户专门允许额外一次评审周期，cycle2/round1/REV8f4b55338fc3；SPEC95d83原件及C控制回执位于 review-consumer-supplement。R只写新publictest与本目录，C单写生产。原c077/289ae/315项索引、全部旧原件及本轮两RED不覆写。

| 当场输入/消费者 | RED原事实 | GREEN原事实 |
|---|---|---|
| 正式公开保存master v2/v3→restore非最高v2→scriptReviews.trigger | 24.1304s exit1，原task ai-task-df57338c-24冻结artifact17/version2；真实prepare读最高v3，原“稿件已更新”门拒绝；0execution/call/report。两个成功预期自然失败 | 51.8248s exit0/1PASS，ai-task-28a0ef0f-24实际冻结master17/version2/完整v2正文；1settled review call→正式report版本2，真实HTTP正文一致，刷新报告/母稿/版本全等 |
| 有正文master＋真实creativeResults.generate自动预留 | 真实draft29两阶段2settled→awaiting_confirmation，target27:v28预留为真且未采纳；原review33冻结master17/version2，但prepare优先空target报“暂无可审脚本”；33.9995s exit1，review无执行/调用/报告 | 54.8785s exit0/1PASS；真实前置候选仍未采纳，review ai-task-a473477b-33实际读master17/version2/完整正文，1settled review call→正式report版本2并刷新一致 |

新source锁18a664…（RED）与eafdaa…（GREEN）各2837文件+1实际v6m依赖链接。机械GREEN_SOURCE_DELTA仅persistence原9ecc→95514；测试、配置、helper、旧7790/3851 worker字节相同。Root已独立核装配和RED；实施薄差分亦获独审，最终GREEN独审以Root控制回执为准。RED_PAIR_RESULT和GREEN_PAIR_RESULT逐例保存原ID、原prepare异常、实际frozen正文、模型call/resultRef、HTTP协议、报告和清理。

本轮GREEN共4次真实ledger结算/loopback响应（restore review1；reserved原voiceover/storyboard2＋review1），外部付费0。真实业务宿主/准备/worker/报告服务均未stub成功；只有模型外部HTTP返回合成中性JSON。dispatcher手动drain明确属于受控环境，不冒自然后台调度。两RED的review调用均0，不能把reserved前置2call写成总0模型。

原版本保护最小回归位于 regression/run-green-guards-v1：2文件/7PASS/0FAIL/30.8269s/exit0，涵盖原冻结正文/规则、版本或artifact不符拒绝、无稿拒绝、null/0种子、重建后复用原冻结快照不再次读稿、过期输入准备失败不创建执行。最高current原六入口成功证据、正式空/损坏/跨组和确认稿正文族继承原未改reader/已通过受控主链，不重造历史或给未跑输入族签新PASS。完整frontend tsc本轮exit0，原空log和FRONTEND_TYPECHECK_GREEN保存；未单独计时不补时长。boundary/统一timeout由C独占运行，不重复签。

每case独立8h测试/global8h30/执行31800s/outer9h/600s清理，两case总外层上限18h；不继承上一root期限、不续原任务deadline、不重发。四个case均自然退出，各5项资源清理COMPLETED、剩余PGID[]、afterInputDrift[]；有实际worker的3个run均登记原PID/start identity且清理后identity=null，restore RED确无worker。原保护Gate亦自然退出/无残余/无漂移。每个新application key仅进程内随机，未复制认证/旧业务库，保留DB原件不意味着可凭新key恢复执行。

本补漏不改变T1333结构表历史来源欠账，不重跑已通过ZIP/图文/视频或扩母40/56矩阵。最终新包仍须正常稿面对话→review.script唯一root，v2/v3后restore v2，实际child/报告/卡片/刷新及可获得的冻结证据；未发生前保持NOT_RUN，不taskcomplete。
