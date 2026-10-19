# 原分类静止副本取证结果

原candidate source为2168294fef3f62bc8e0b4ca3254652b935daeb0d；原业务ai-task-e2aea52e-55、execution exec_12266621-afc5-43bf-bf8e-8dcb2438d5e0、asset-e2aea52e-49、afile-e2aea52e-53和group grp-e2aea52e-6均严格绑定。未重发、恢复或修改原任务。

公共最后四任务均succeeded。原controller stdin已关闭，stop输入未送达；经owned身份核对后调用其既有SIGTERM handler。真实退出143，无flush完成标记，不证明原root优雅关闭。父/子进程、原端口、全部数据库文件句柄均消失后，两次完整文件观测相等才复制至新owned临时目录。只在副本让PGlite自然恢复，再BEGIN READ ONLY白名单SELECT、ROLLBACK、close，reader退出0。原库2229文件的SHA/大小/mtime在复制前后及读副本后全相等；未打开原库、未import应用/createDb/迁移、未读用户库/凭据/settings/users。

READ_ONLY_RESULT.json直接记录：唯一原call_fce1d4de-ba71-4758-a916-6bb8a94be711为settled，原vision:asset.classify route和pin均Codex app-server/0.159.3/gpt-6.1-sol；同call的实际modelFacts为openai/gpt-6.1-sol，含原thread/turn锚。total_tokens为20705，不能写零模型或零成本。原asset.description仍空，原file.media_metadata.aiDescription为“浅色背景上蓝色圆形与橙色方形，可用于形状或色彩对比讲解”，标签B-roll，原PNG838字节及SHA28e3ba6c…匹配公共下载。T1302本来需要的work.creation.read已有同文description投影，来自原asset.description与file.aiDescription合并后截断4000字；该投影与这里直接注解相符。

这是**静止完整副本恢复后的一致性直接记录补证**，不把143改0，也不证明关闭时flush。公共DTO非chat summary409、DOM通知[]与steps[]仍保留，不能说公开账本已直接返回call全文。原T1301受控完整组合前置RED历史缺项不由本结果补回，用户accepted-risk尚无真实答复；任务及最后Gate继续待验。原库和副本保留本地，不提交数据库或私有session。
