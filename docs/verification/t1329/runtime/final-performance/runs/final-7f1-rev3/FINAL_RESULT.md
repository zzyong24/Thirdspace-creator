# 7f1 普通聊天与工作面单次性能实测

唯一普通对话实际成功，0工具、0重发；原wrapper自然exit0/28.821秒，浏览器与仪器正常关闭，登记子PID实际消失。来源`7f1d4ec9ec9f5dcb7f898e12408206ef41bac3c9`、DMG SHA `0aee74b08c36defcd731a00bf6d72b1be1bc1239b992a7609431c958fce111dd`，恢复后的原六槽revision3。原始结果/计时/任务ID均在本目录。

| 测量（点击提交起，同document performance时钟） | 单次实际值 |
|---|---:|
| 首个SSE非空文字delta | 18154.800 ms |
| 首个实际可见正文 | 18171.400 ms |
| 原流结束后的完整正文可见 | 18171.600 ms |
| 首delta到首可见字 | 16.600 ms |

完整正文以原累计SSE text-delta与可见DOM仅空白归一后严格相等，实际命中，未填null或拿task终态冒完整正文时点。实际Codex0.159.3/gpt-6.1-sol已读回。这里只能说明本次等待主要在首个流式文字之前，不能据此拆分queue/startup/precheck/model思考；后续仅原ID只读时间证据，不新发模型。

| 正常工作面点击→真实内容/主操作可用 | 单次实际值 |
|---|---:|
| 公众号 | 356.5 ms |
| 图文 | 183.6 ms |
| 视频制作 | 597.2 ms |
| 复盘 | 136.6 ms |
| 脚本 | 92.0 ms |

每目标仅1个正式样本；不是TTI/p95，不推全部互动性能。公众号与图文按真实native open shadow两段原稿逐字可见及重新组织按钮命中；图文不是loader。公众号专属AI侧栏足120秒仍generic/7chips属于独立T1340功能FAIL，本次正文计时不覆盖它或宣称全页功能ready。视频为无素材的人工空工程，ready控件/工作台实际可用，不冒render性能；复盘无真实发布指标。

新纯组48在原chat前AI/会话均0，人工项目940/master/三个平台输出只为正常Tab前置，0模型。普通chat唯一原intent `t1300-final-ordinary-ttft-8f26d716-a4af-4908-bb62-916e192ea79c`，AI `ai-task-93b9f3a8-921b-4e40-9b1e-eaf25089b44d`、execution `execution-task-4a9e3424-c9b8-405d-ac8b-faea0a11faf0`，conversation1130/source1131；未触旧UNKNOWN或其他组任务。

候选/sidecar位于T7外盘；浏览器headless1440×1000。此前readiness预检已暖相同服务/人工页面，因此不是冷启动耗时；其它用户服务未停止，不能称整机绝对空闲。没有同条件旧基线，不计算提速百分比。当前只签这次有界功能/测量，T1300整体仍未通过。
