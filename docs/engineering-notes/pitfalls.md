# 工程坑册(踩过的坑,按主题沉淀)

> 从实战提炼,新会话/新人排障先查这里。每条:坑 → 正解。持续追加。

## 桌面打包(Tauri + Next sidecar)

- **Tauri resource 丢 symlink** → 打包改用 tar 方案整体封存再解压。
- **同版本 rebuild 陈旧缓存**:同版本号重打包,旧解压产物不更新 → size 指纹变化强制重解压。
- **未签名 app 的 keychain 不持久** → 文件兜底存储。
- **playwright 走 .pnpm 的模块解析**:Next tracing 漏动态 import → 实拷完整包(含 browsers.json)。
- **混淆 turbopack chunk 会崩** → chunks 目录 rename-only;混淆后必跑运行时冒烟。
- **打包版必须隔离验证**:dev 跑通/单测过 ≠ 分发包能跑(ESM/路径/资源差异)。

## 验证纪律(最重要的一册)

- **改服务端/skill 代码必须重启+真机复测**:persistence/registry 单例持旧模块;**单测过≠live 生效**,声称「修好」前必须重启后复测那条行为本身,AI 行为尤甚。
- **验证走真实调用路径**:旁路脚本假通过害人——打包器模块解析(serverExternalPackages/.pnpm)≠手写 import;必须 curl 真 dispatch 触发真代码路径。
- **写侧落库≠读侧可见**:changeReason 写进 DB 但 resource/DTO 投影漏字段,前端永远读不回(T-234)。契约改动三查:表列/写路径/读投影。
- **Monitor/轮询脚本必须锁任务身份**:按状态匹配会把旧任务当「本轮完成」误报(时间过滤 requestedAt>CUTOFF)。
- **开工前反证「是否已存在」**:子代理 map/SPEC gate 高估缺口,三次差点重造已有能力(search-factory/planning.thesis/SEAM);动手前 codegraph/grep 反证。

## 并行 subagent 协作

- **`git add -A` 会扫进并行 agent 的半成品**(伤过 3+ 次)→ 精确文件列表提交;领地重叠时等全线返回再合并提交。
- **架构边界锚用正则扫源码文本会误伤注释**(G5 案例:注释里写「object-storage」被当违规)→ 边界测试写正则时想清楚匹配面;写注释避开锚定词。
- 任务边界 checkpoint:BACKLOG 更新+提交+`codegraph index --force` 重建(禁 `sync`,增量检测会谎报最新)。

## PGlite / 迁移

- **迁移文件多语句必须 `--> statement-breakpoint`**(0037 踩过,pglite 单语句执行)。
- PGlite/PG 双栈避免方言分歧:jsonb 复杂匹配放 JS 侧过滤。

## AI 行为工程(MiniMax/弱模型)

- 自由文本 parse 节点会崩(cancelled)→ 全部 runStructuredNode 结构化输出。
- 编造病治法:枚举收窄+「只从原文提取」硬约束+可溯校验(关键词须在原文出现)+伪引用模式剔除(arXiv/DOI/小数精度%/榜单名)。
- 插点/边界类输出跨模型不稳 → zod refine+后处理吸附合法值集合(SRT 行 start)。
- 降级路径(model_memory)必须显式声明来源与局限,绝不填看似真实的出处。

## Tauri webview 细节

- webview 吞 target=_blank;tauri-plugin-opener 自带注入脚本(拦 _blank 链接);自己再拦截会双输(stopPropagation 废掉官方脚本)→ 只把缺 target 的跨域链接补成 _blank,让官方脚本接管(T-252)。
