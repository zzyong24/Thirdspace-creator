# 本轮本地合并、清理、重新打包与安装

2026-10-10 本轮当前三个注册来源的最新代码已普通合并至本地 `main`。主目录 `/Users/zyongzhu/Workbase/Thirdspace-creator` 已从原快照分支切回 `main`，切换前后均实查干净；没有 force、push、tag、Release 或 App/数据库备份。

## 源码与工作区

原主目录 `45ff5ff5e6676d32be38c834660bab88c238a2ba`、微信来源 `a3bc947d4bcb70be5c14f11ff56639a54b184b31`、完成来源 `db769ddc2968e373bb92e253f13fad9d0927ee08` 均为本轮包源码 `300c6faaf792e50725e6bbf4d3c14af49b709151` 的祖先。产品独审头 `b5d256c8287807f5a8d2115030b3672b54ba9c2b` 至包源码头只有文档与审计控制，产品 scope 没有漂移；75 项绑定、2 项删除及真实首次失败均保留。旧外部 MCP 窄权限配对原型未进入当前产品，27 份源码原字节保留，仍属 T1197，不能宣称所有历史功能已经落地。

本轮普通移除已保留全部来源且未占用的 `t188-completion-creator` 工作区；此前先将 8125 份原诊断/来源文件原地迁至私有证据域，455693176 字节，没有把诊断日志或真实数据当作垃圾。另移除 10 个空 wrapper、2 个已逐字落 main 的非注册源码壳及其空父目录。来源分支和 Git 历史保留。

当前保留三个有明确用途的注册目录：主目录 `main`；固定在包源码头的 detached 构建目录（保本轮制品与构建证据）；仍由微信研究服务占用的目录。切主目录前全局 lsof 的 89 项引用只有目录本身，没有源码文件引用，忽略文件与新 tracked 文件无冲突；进程没有被终止。微信真人研究/上传实验仍守原暂停与实验上限，没有重启实验。

## 当场出包和安装结果

| 项目 | 当场结果 |
| --- | --- |
| 四处版本 | `1.2.0`，一致 |
| 源码冻结 | `main`、干净、18 项负控制拒绝未知/修改 fixture，exit 0 |
| 固定本地入口 | `env CREATOROS_LOCAL_SKIP_INSTALL=1 pnpm -C frontend desktop:package-local`，exit 0，378.84 秒 |
| 唯一下载包 | `/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg`，841500148 字节 |
| DMG SHA-256 | `12a1fca915ebde0d6a264b144dbb17e069a5ee1b6d7d8549e4a66ab4857b9058` |
| 镜像及 App | hdiutil verify、只读挂载、完整 App 树/运行时/七个关键节点一致、codesign deep strict 均 exit 0 |
| 签名 | 本地 ad-hoc；未 Apple 公证 |
| 安装 | 温和退出旧 App，唯一暂存验证后替换 `/Applications/CreatorOS.app`，exit 0；无备份、无 force kill |
| 当前原生主进程 | PID `25661` |
| 直属服务 | PID `25986`、PPID `25661`，实际 runtime executable，监听 `52753` |
| 实际首页 | `MAIN_PAGE_LOAD_FINISHED http://127.0.0.1:52753/`，公开 CLI connected/installed 均正常，探针 exit 0 |
| 当前运行时 | stamp `sha256:c829253723973d57ce58e4f699f12374d31cc397b6d9b6b8894014649d18898b` 与本轮 tar 相等 |

旧 d910 同版本 DMG 在 Downloads 与 build bundle 两处均被固定入口新包替换；旧安装 App 已替换。再次扩展盘点 Downloads、Desktop、主目录、全部 worktrees、Applications，仅剩两份相同新 DMG（下载包与构建产物）和两份相同新 App（安装 App 与构建产物）。6 份连接器/CLI Skill ZIP 是可用项目资源，保留。只读挂载已卸载，空挂载目录已 rmdir，没有残留安装暂存 App。

```mermaid
flowchart LR
  A[三个当前来源普通合并] --> B[干净源码冻结与本地构建]
  B --> C[新 DMG 和完整运行时核验]
  C --> D[替换安装并验证真实首页]
  D --> E[主目录 main 与新制品保留]
```

## 验证边界和继续处理的事项

本轮验证支持源码汇总、闲置目录清理、新包一致性及真实安装启动；不能代签屏幕眼验、全功能测试或用户最终验收。安装与探针没有主动提交模型生成、采集、上传或业务写入；App 正常启动会自行运行升级与状态初始化，不把这一事实写成“用户数据绝无变化”。原账号、项目、媒体和激活目录没有作为清理对象。

新安装启动仍实际记录配置同步 502 与 `CHANNEL_RUNTIME_DIGEST_MISMATCH`，继续归 T1196；首页和本地服务真实正常，失败日志未隐藏。完整 reconcile 原次 exit 1、24 ERROR/1 WARN（原日志 SHA `8b430033c5e16249829392e53c6b4751a3c603527a37dcc7925fff905702d1a3`）保留；没有将它改签为全绿。本轮新增 LED052 隔离环境缺口已以 T1198 修复，原三套 59 项在显式隔离 PG 环境实际通过，无 skip。其余历史审核、超时、雷达、聊天取消、编导恢复及作品精调欠债仍保原任务；详情见 [构建前原始结果](prebuild-current.md)。

构建、离线核验、安装、启动、清理和主目录切换的精确收据/日志 SHA 见 [证据清单](packaged-evidence-manifest.json)。原激活访问状态、原生日志和完整启动报告只留私有证据目录，不提交真实激活信息。打包和全部制品/启动探针完成后才写本交付记录；本记录不修改产品或原检查，也不作为旧成功证明新包。
