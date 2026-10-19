# T-1053 原生编辑器与 CreatorOS 风格兼容

## 已落地的行为

NoteRelay、Doocs、快图与 OpenCut classic 使用固定开源源码的真实组件，直接挂载在 CreatorOS 当前工作台。应用背景、字体、品牌色、边框、控件、密度和弹层走当前主题；作品的纸张、文字、图片、尺寸和配色仍是原作品设置。视频直接在制作页面显示；图片细调使用 CreatorOS 的全屏 Dialog；公众号与图文继续原文章/图文服务保存。

编辑入口已移除 iframe、独立 index.html 和 postMessage 桥。开源来源/许可的下载链接只放在折叠说明，不是编辑入口。可信组件使用 ShadowRoot 隔离 CSS，弹层仍在同一文档的实例容器；既有不可信成片 HTML 的安全预览不在本轮放开范围。

```mermaid
flowchart LR
 A[CreatorOS 当前作品] --> B[统一主题与实例弹层]
 B --> C[原开源编辑组件与引擎]
 C --> D[同次冻结稿与导出文件]
 D --> E[原版本与精确素材服务]
 E --> F[核对当前稿，保留后续修改]
```

## 生命周期、保存与素材

每次挂载绑定账号、作品和源版本；切换时 AbortSignal 与实例序列守卫取消旧操作。OpenCut/Doocs 原模块单例通过同文档 lease 等待旧实例停止写入后交接；NoteRelay/快图拥有独立实例。异步上传、Image 解码、原引擎加载回调、队列、DOM与Blob URL按原生生命周期清理。

素材先由宿主经原上传和归属服务得到真实 assetId/assetFileId/mediaId，再进入原组件。未知图片保结构与缺失提示，其它合法图层可继续编辑。Fabric画笔按原库实际 source 输入处理；Doocs按真实DOM属性解析 img、picture/source和SVG图片，未知外链局部占位，已注册素材和合法矢量层保留。

保存回执未知时仍沿原冻结稿、同一请求ID和已上传文件重试。已知409保本地图层，提供真实备份及读回当前版本入口。成功回执之后再次比较当前原生snapshot；在途导入新增的内容继续显示未保存，不能把冻结稿的保存成功当成后来改动也已落库。

Doocs支持同段正文、标题和排版的外部同步，原生自己的变化回声不重载撤销栈。保存和正式导出先取当前CodeMirror snapshot，覆盖300ms通知窗口；导出仍核对正式保存稿和精确素材，避免旧缓存覆盖新正文。NoteRelay继续原平台adapter、主题、分页与真实富文本/文件交付。OpenCut继续原轨道、Core、Undo与NativePatchReplay。

## 当场发生的检查

| 检查 | 结果与证据边界 | 证据 |
| --- | --- | --- |
| 独立实现复核 | PASS，所有当场finding已修复；实际public ESM与源码字节配对、无process DOM启动通过 | [独立报告](t1053/independent-review/report.md) |
| 规格前置独立评审 | PASS[REV:41cab75052c6]，只确认可进入实施 | [回执](t1053/spec-round-1.json) |
| 原生宿主回归 | 8文件43项通过，retry=0；宿主与明确handle/DOM夹具，NoteRelay调用实际ESM | [最终回归](t1053/all-native-host-tests.log) |
| 保存竞态TDD | 当场3失败/15通过，修复后18通过；两host迟到导入、快图409恢复 | [红测](t1053/save-races-red.log)、[绿测](t1053/save-races-green.log) |
| 衍生工作台旧链 | 3文件26项通过，原正文/布局投影与保存 | [回归](t1053/derived-workbench-tests.log) |
| 原后端服务 | 2文件45项通过，保存/当前/历史/幂等/CAS；没有新保存服务 | [原服务](t1053/service-tests.log) |
| 既有版式合同 | 13项通过，旧Doocs与NoteRelay分支保留 | [合同](t1053/contract-tests.log) |
| 前端类型与聚焦lint | tsc exit0；11生产文件0错误0警告 | [类型](t1053/final-typecheck.log)、[lint](t1053/final-host-lint.json) |
| LED-047 | 8文件158项通过；保留弹层、路由与刷新回归 | [LED-047](t1053/led047.log) |
| 公共HTTP保存读回 | 26次公共RPC，原文章/图文布局、精确素材上传/下载、当前/历史/幂等/旧CAS409通过；1像素图片是服务夹具 | [公共HTTP](t1053/http-smoke.json) |
| 页面与静态资源HTTP | 13个页面/入口响应200；413个静态文件与4源码归档逐字节符合冻结清单，另1个空.gitkeep保持400保护，不是运行资源 | [HTTP字节](t1053/native-http-resources.json) |
| 原生包与构建 | 全414文件/4归档摘要通过、JS生产宏AST与共享合同通过；构建脚本lint0错误0警告 | [包核验](t1053/native-package-verify.json)、[脚本lint](t1053/build-scripts-lint.json) |
| 任务范围治理 | 授权原组件/构建产物与真实证据按精确SHA登记，最终0错误 | [治理](t1053/governance-final.json) |
| diff / orphan | diff exit0；orphan 0error/100warning | [diff](t1053/diff-check.log)、[orphan](t1053/orphan.log) |
| 收尾对账 | pmem sync完成；reconcile仍35error/1warning，与T-1052错误文本一致，没有新增错误；LED-053通过 | [对账](t1053/reconcile.log)、[差异](t1053/reconcile-comparison.json)、[sync](t1053/pmem-sync.log) |
| boundary | 7条对基线5；两项是已登记T-1026的Copilot SDK违规，未放宽基线 | [边界](t1053/boundary.log) |

## 固定来源、构建与许可

实际模块图、patch、归档与独立重建证据按四个引擎分别记录，不把旧iframe构建当原生验证。库构建显式替换生产NODE_ENV，实际ESM在没有process全局变量时加载/挂载；交付核验还按JS语法检查残留生产宏，文档中的文字示例不算全局依赖。

| 引擎 | 原固定来源与实际复用 | 原生证据 |
| --- | --- | --- |
| NoteRelay | 用户提供0.1.8；原Wechat/Rednote adapter、主题与分页；AGPL-3.0-or-later | [独立归档重建](t1053/noterelay-source-rebuild.json) |
| OpenCut classic | cf5e79e919144200294fb9fed22a222592a0aeea；React布局/EditorCore/时间轴/MediaBunny；MIT | [原生证据](t1053/opencut-classic/) |
| 快图 | b3bdcfb0bd6d8f98e7483cf561ac03ba56c0d889；原Vue Home/Fabric/插件；MIT/core ISC | [原生证据](t1053/kuaitu/) |
| Doocs/md | a7c17fc4cda92e3c13aa7e24f06615cfa4219b31；CodeMirror/Vue PreviewPanel/原主题；WTFPL | [双目录重建](t1053/doocs-md/rebuild-determinism.json)、[源码归档](t1053/doocs-md/source-archive-check.json) |

原源码回归另有快图29项、OpenCut16项/80断言；OpenCut无process的38项DOM检查与Doocs实际原组件/图片族/lease检查均通过。两类runtime在没有process全局变量时直接从public包加载，代码检查不依赖原独立页补丁。

完整对应源和许可证由 [静态许可页面](http://127.0.0.1:4318/reference-editors/NOTICE.html) 下载；原MPL MediaBunny/LGPL SoundTouch对应源继续提供。全应用声明不替代这些开源许可。

## 实际网页验收仍待完成

2026-10-05 [网页恢复与公共接口复查](t1053/resume-20261005/report.md)：三个具体作品入口已恢复 200，413 个运行文件和 4 个源码归档的 HTTP 字节通过；原服务保存/历史/幂等/CAS 通过。只读合同探针同时复现文章保存比较因字段顺序误报不一致，尚未修复；接口通过不代表页面保存提示通过。

当前预览服务沿用隔离PGlite/media目录，不读写用户原数据库。已有测试账号为“网页体验测试账号”，accountId为acct-ef4eab23-41。

- [当前视频工作台](http://127.0.0.1:4318/projects/project-8d660be7-197/production?outputId=output-8d660be7-208)
- [公众号与NoteRelay](http://127.0.0.1:4318/projects/project-8d660be7-54/article?outputId=output-8d660be7-79)
- [图文与快图入口](http://127.0.0.1:4318/projects/project-8d660be7-54/outputs/output-8d660be7-95/image)

此前浏览器策略拒绝及用户亲自验收的约定见DEC-T1049-01、DEC-T1051-01、DEC-T1052-01、DEC-T1053-01。本轮未换CUA/CDP/Playwright绕过。代码、构建、JSDOM和公共HTTP不证明浏览器像素、真实PNG/MP4、系统剪贴板、键盘焦点、屏幕阅读器或实际文件下载。

需亲自核对：亮暗主题与窄窗口布局、实际弹层/快捷键和粘贴；公众号即时改字保存/刷新、富文本复制和资源ZIP；图文原分页与PNG/ZIP、快图图片导入/Undo/同稿PNG；OpenCut素材/选区/剪辑/Undo/MP4/刷新读回；慢任务切作品和冲突恢复。真实模型、平台登录/发布与安装包没有宣称发生。

OpenCut上游opencut-wasm 0.2.10不提供GPU device/compositor销毁API：已清纹理、媒体、音频、定时器、observer及实例DOM，但GPU设备对象可能保持到文档关闭，不能声称全部释放。Doocs开发构建中原Reka曾在ShadowRoot中查不到document级标题而产生诊断；真实焦点与无障碍验证仍待完成。

T-1053的review与implementation步骤已通过，acceptance仍待验；任务保持进行中，没有把缺失的真机证据补写PASS。

首次任务步骤核验遇到开源构建/来源JSON内的既有Bun、语言高亮与通信词汇，按已授权FR-01—FR-10和DEC-T1053-01逐文件绑定精确SHA预算后通过，不新增应用运行时/编译链或独立服务。首次收尾对账因本轮看板摘要变长新增BACKLOG RUNAWAY；已将T-1052/T-1053过程说明留在各自验证文档、压缩看板摘要，任务状态和其余任务保留。

全仓既有失败仍由T-916/T-1015/T-1026/T-1027跟踪，不将本轮局部通过写成全仓绿色。相应校验日志与独立报告保留当场失败和修复记录。许可页面13个本地链接HEAD均200，见[许可链接](t1053/notice-links.json)。
