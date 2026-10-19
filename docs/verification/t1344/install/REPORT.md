# T-1344 本机安装与旧产物清理结果

已将74b03effa508e793712de3be738c0b518ed7117b交付的CreatorOS 1.2.0安装到`/Applications/CreatorOS.app`并正常打开。旧App经AppleEvent正常退出，命令返回0，其正式Next子树也已退出；未强杀，未发生退出阻断。五个真实账号组的公开`execution.tasks.list`检查均为running=0。

新正式App PID65175、Next PID65560；本次启动观察124.91秒，真实出现`MAIN_PAGE_LOAD_FINISHED`、Next Ready与冷解包完成标记。主程序SHA256为`83ac284a283a0c0cc0677983bb1148925c643af8739b3cc06354c2d5455c22a9`，正式codesign严格校验通过；签名为ad-hoc，本次未声称Apple公证或UI点击/全功能验收。

当前runtime的`.tarball-stamp`准确对应`f5ffca8f9b6496f9d3443517f5005b19b5be5c0b08d83fc7cf62b2ee5bb1ba18`。包内31871个文件与746个符号链接逐项对应当前runtime，0缺失/0不匹配，双方聚合清单SHA256均`1c6cd3258005ecdba21d3c5710361ef4babac0753d19089683edf11cd3ff9275`。lsof证明正式Next实际映射该runtime的server，SHA256为`5ed0e129e708e36048981aed983f7302b0c18139f5a174e4b8d5fabbacb6d59d`；没有仅凭同为1.2.0判断新旧。

已删除核准清单全部35项，0错误，包括四个旧构建中的指定可再生产物、四个精确BEFORE旧DMG、旧T1255 App备份、旧e315下载包和本次替换回退App。删除前逐项lstat/所有祖先无符号链接逃逸，全lsof检查0占用；没有删整个构建根、target或candidate。清理后35路径均不存在；28个指定源码/验收/trace/构建时间证据路径、新74b整根、05a失败现场、最新下载包及用户核心数据路径均仍存在。正常启动可能产生数据库/日志变化，本次只核路径元信息，不宣称内容完全未变。

| 清理窗口df实际可用空间 | 清理前KiB | 清理后KiB | 增加GiB |
|---|---:|---:|---:|
| T7数据卷 | 869977584 | 922343220 | 49.94 |
| 内部Data卷 | 39154540 | 41652904 | 2.38 |

以上为实际清理窗口df变化，可能包含同期磁盘活动；35项du归属量62303256KiB不等于实际释放。原始df分别见`cleanup-plan.json`、`cleanup-execution.json`及清理后的`final-postcheck.json`。

最新源DMG和`~/Downloads/CreatorOS-1.2.0.dmg`均保留且SHA256为`ef1b6c590076db387f5055e168e7d96de1a5b2adf0a996054c2278d6a4a6225f`，本轮`hdiutil verify`为VALID；本次只读挂载盘已正常detach。账号/激活/模型设置/项目/素材/数据库/Library runtime及日志证据未列入删除范围，未读取凭据或库内容，也未改模型设置、启用自动化或调用模型/充值/外部业务。

本次纯运维沿T1293处理，技能及vendor均3.29.0，不重建或修改产品代码，也不把旧全局对账问题改成通过。foreign七个业务文件及.lessons-stats哈希原样；去除本任务行后的BACKLOG与开始时摘要相同。原始启动输出仅留`~/.codex/private-evidence/t1344-install`，未提交或打印用户内容。正常退出记录器首轮把空ps的exit1误作异常，保留说明后只读复核，并未重发quit。

独立只读复核由`/root/cleanup_74b_inventory`完成：批准清单/执行集合35项全等、0重复/遗漏/扩项，35路径均不存在，51个保护路径均在；新下载DMG字节与SHA再次核对通过。复核消息记录见`independent-cleanup-review.json`。

具体证据：`staged-verification.json`、`formal-runtime-identity.json`、`full-runtime-identity.json`、`startup-observation.json`、`installed-process-data-metadata.json`、`cleanup-plan.json`、`cleanup-execution.json`、`final-postcheck.json`、`dmg-detach.json`和`foreign-preservation.json`。

```mermaid
flowchart LR
 A[74b新包核对通过] --> B[旧版正常退出]
 B --> C[正式安装并启动通过]
 C --> D[35项旧产物清理完成]
 D --> E[最新包与用户数据路径保留]
```
