# T-1438 存储清理完成

2026-11-04。用户要求清理编译产物与worktree。实际可用空间从1.73 GiB升至14.52 GiB，净释放12.79 GiB（以FINAL.json当时磁盘实际值为准，后台进程可能继续占用或释放空间）。

## 实际清理

- `/Users/zyongzhu/Workbase/Thirdspace-creator/frontend/src-tauri/target/debug`：清理前分配5.00 GiB；已删除。
- `/Users/zyongzhu/Workbase/Thirdspace-creator/frontend/.next`：清理前分配0.00 GiB；已删除。
- `/Users/zyongzhu/Downloads/CreatorOS-builds/41454572792`：清理前分配0.83 GiB；已删除。
- `/Users/zyongzhu/Downloads/CreatorOS-builds/41473263553`：清理前分配0.83 GiB；已删除。
- `/Users/zyongzhu/Downloads/CreatorOS-builds/41484713756`：清理前分配2.71 GiB；已删除。

- npm下载缓存：npm cache clean成功。
- pnpm未引用缓存：原生命令成功，清除156567个文件、2410个包；项目Next依赖入口实际仍存在。
- CreatorOS旧worktree：干净、无运行进程。先将源码、验证记录及非缓存文件备份到外置盘，rsync checksum差异为空，再删除工作目录；没有删除分支、提交或其原Git对象。

归档：`/Volumes/T7-MacData/CodexArchives/2026-11-04/legacy-license-upgrade/checkout`。分支`codex/cos-ux-closure`仍指向`568a3091e3960fbaef578cb1c022897101fe1aff`，已实际核对。当前CreatorOS git worktree list仅剩主目录。其它仓库的工作树与未提交内容未删除。

## 保留及未执行

- 最新run41508284903的Mac与Windows安装包原路径及字节数不变。
- 主项目tracked文件没有删除；未清理数据库、素材、激活、登录或模型缓存。应用正在运行于/Applications/CreatorOS.app，不在被删除的debug目录。
- uv缓存被正在运行的uvx工具占用。原生clean提示锁等待后，仅终止本次清理命令（exit143）；不加force、不终止既有工具，也不冒称该5.8GiB已释放。
- 外置T7仍有大量可用空间，保留既有构建验收备份，不将它们一并当作可删缓存。

## 验收

FINAL.json记录实际空间、安装包、依赖入口、worktree列表及保留提交；build-cleanup.json及原生命令日志保留操作结果。git diff --check通过；pmem sync成功；quick reconcile 0错误、2项既有范围外看板警告（大小和T-1420长行）。本任务不改产品代码，不重新编译或跑产品测试来回填刚删除的缓存。
