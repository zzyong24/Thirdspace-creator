# 任务包回退说明

T1431新绑定未存在于progress.json，context-compile未生成任务包。pmem sync只刷新摘要，不能补绑定；正式progress generate被既有T1408 write_set非法路径拒绝，未改写progress。

未改动旧任务配置，也未伪造任务包。本轮撤回尚未生效的T1431模块定义，按照AGENTS.md开工必读第1条明确允许的回退，使用BACKLOG T1431行、已经独立审核的SPEC及其文档写集执行。所有任务状态仍只经taskctl维护。
