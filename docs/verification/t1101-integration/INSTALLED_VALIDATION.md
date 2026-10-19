# 当前 main 本地安装验证

2026-10-09 当场构建、核包、替换和首次启动；冻结源码 `87964675c83fd0267717a405f77c26f8594f6c33`。这里只记录实际运行，不声明全功能完成或公证发布。

| 检查 | 实际结果 |
| --- | --- |
| 冻结预检 | main 干净；四项版本均 1.2.0；87 个复核文件逐字节一致；退出 0 |
| 打包基本测试 | 4 文件、45 PASS；退出 0；2.246 秒 |
| 固定出包入口 | `env CREATOROS_LOCAL_SKIP_INSTALL=1 pnpm -C frontend desktop:package-local`；退出 0；409.344 秒 |
| DMG 与签名 | hdiutil verify、只读挂载/卸载、源 App 与包内 App 的 codesign deep/strict 均退出 0；四个包内文件 SHA 一致 |
| 包内业务运行时 | 0130 迁移实际 1 项、领域错误恢复运行时实际 9 项；保护后的字节与归档一致 |
| 安装 | `/Applications/CreatorOS.app`；旧进程温和退出后替换并启动；退出 0；无 App/数据库备份、无强杀、无数据重置 |
| 首次启动 | PID 5537；实际 SIDECAR_STARTUP_VERIFIED 与 HTTP MAIN_PAGE_LOAD_FINISHED；公开 CLI status/access 成功；四个安装成员与新包一致 |
| 原内容读取 | 12 原任务（11 项列表加 T1099 原任务）、4 稿件/工程对象、3 原会话及结果与安装前逐字相同；退出 0；18.649 秒；未提交或采纳新候选 |

规范产物 `/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg`，838209861 字节，SHA-256 `18a1cf5333162b7527af0c6e3ec83eeb9b8c467b5047d0eae8cd2b70412b6bb9`。本地 ad-hoc 签名，未公证；未 push、tag、创建 Release 或公开分发。macOS 最低版本 13.5。

```mermaid
flowchart LR
 A[干净 main 与已审文件] --> B[固定入口生成 DMG]
 B --> C[核包与签名字节]
 C --> D[温和退出后替换 App]
 D --> E[首次 HTTP 首页与 CLI 成功]
 E --> F[原任务 原稿 会话逐字对照通过]
 F --> G[继续逐功能验收与缺陷修复]
```

原始命令、时间、退出码和日志保存在本机私有验收目录 `main-installed-20261008/t1101-package`；真实原稿与会话正文未纳入仓库。

| 当场收据 | 日志 SHA-256 |
| --- | --- |
| freeze-final.json | 4fa6131dcc0a7ec860f95a470c557d1da62cdbb5b67b05ffe527cd5e322b4f28 |
| basic-tests.json | 518f5802c9090c60d90264e2fc9d9466efca5cfe8bdbc77b0fcd3aa6c0d39963 |
| build-fixed.json | 698927900d86c06e5f7e560c682a4f0bfed86118b60af0b36ac445e53bf1d63c |
| package-verification.json | 46b35d312dd22693e9de4ccec638a7c914d240b6e4d7fbda6d8fb10a347a6473 |
| app-installation.json | 75a4840eee34b0440f376d3ad0dd919079d07e406d274cca3270461a68e49324 |
| startup-verification.json | 6cc0e1dc57af15d8fdf242d96faf93cda3a0628aa47d1d6e5c5fa480cdba59cc |
| before-baseline-latest-read.json | 0633ea6ee54074b20d4f287de1fff464a89bde51286e66f05545c46b9862818e |
| after-baseline-read.json | a2bf8e534c7fb8a90e3030f1ce0b5f45eb16bb1e4793ac9dcf84af7fd8762386 |

里程碑为外部观察开始后的时间，不冒充精确冷启动耗时。这里只核真实原生加载日志，没有目视原生窗口或逐项原生操作；新包未重启复验。真实本人扫码、供应商生成及 Windows 安装不由这些记录代签。T1102 旧首次失败根因、T1110 旧浏览器网络变化原因仍 UNKNOWN；T1103 的 Pi 联合提案仍遗漏图文，原任务保持 partial、零候选。当前完整 reconcile 待运行，旧全局 42 与静态超时 27 的历史失败保留。

2026-10-09 后续 T1112 修复包替换为源码 525ce054852167d06bebb357ea6f639b6e12fafc；当前唯一 DMG SHA256 cf18308a857d37824103724d4d4f942fa936663db05ce59ea12e0228e5930098，bytes 838292320。固定入口构建自动安装之后，18项正式读取18PASS，纯组工具目录21项实际能力/4个内置组件；12原任务/4业务对象/3会话在自动安装后及受控同包重启后均与安装前一致。受控重启真实首页HTTP加载/CLI与四包成员通过；当前PID41856，originhttp://127.0.0.1:64332/。本地ad-hoc未公证；没有备份或新模型/采纳。第一轮原生窗口未目视，受控日志也不代签逐个原生UI操作或全功能。详见T1112 VALIDATION与current-evidence。

2026-10-09后续：T1112源码525ce新包安装/受控重启及正式18读取均通过，原12任务/4对象/3会话保持。修改后完整对账实际1167.991秒exit1、41旧项，输出与修改前逐字相同。额外AI表面源码回归五文件157PASS；不代签T1103真实图文候选及全功能。
