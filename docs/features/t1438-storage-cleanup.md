# T-1438 清理编译产物与闲置worktree

2026-11-04用户明确要求释放本机存储，清理编译和worktree。系统盘初始可用约1.9GiB，外置T7可用约823GiB。

## 范围
删除可重建、未被运行进程占用的编译缓存及旧重复打包下载；保留最新41508284903已验收双端安装包。回收干净且无使用进程的CreatorOS旧worktree，保留分支和所有提交；有未提交内容的worktree不强删。其它仓库只做占用盘点，必要时仅清其明确可再生构建目录，不删除源码与用户资料。应用托管worktree优先archive工具，本会话list_artifacts为空。

## 验收
逐项记录实际删除路径与磁盘占用，清理后df核实可用空间；git worktree list核实、分支提交仍存在；最新安装包存在，主工作区源码无丢失。不得清理正在使用目录、私钥、数据库、素材、最终安装包或未提交文件。

## 写集
本SPEC、docs/verification/t1438/**及本任务控制面BACKLOG/PROJECT/modules/progress/context/events；仅经盘点的ignored编译目录与干净旧worktree。无产品代码变更。
