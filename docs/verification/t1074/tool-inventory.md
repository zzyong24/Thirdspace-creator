# T-1074 真实工具与功能盘点

2026-10-08只读盘点，MAIN源基点4eedd433；当前安装版独立记录。源码存在不等于真实模型或安装版验收通过。

## 公共目录实测

公开creatoros status实际exit0：installed、connected=true、access=full。operations list实际exit0，耗时0.543秒，stderr为空。405项：read179/write168/destructive26/external32，50域。完整UTF-8 JSON为9,549,765字节、9,532,447字符；sha256=c5e06d1ca9d0b07d6811d1270ec84b4086007d34af0b3823a7bf31ba6f60c4fa。私有原始文件在本地验收根t1074-public-inventory/operations-list.json，不复制真实账号数据或凭据到仓库。

应用内Codex实际使用任务级窄工具，不是这405项全目录。公共CLI已有单项describe，当前list无摘要/筛选/分页。

## 功能覆盖与缺口

| 功能 | 现有助手链 | 需补/需验证 |
| --- | --- | --- |
| 项目 | context.projects/search/detail/lifecycle，brief.fill候选 | 新建及管理没有宿主adapter |
| 选题 | Pi topic.generate/enrich候选 | Codex目录排除；状态/筛选管理未映射 |
| 脚本 | Pi hooks/draft/patch/review；Codex patch | 当前目标冻结；Codex生稿工具与提示词不一致 |
| 文章/图文 | 两引擎work.creation/read/propose与editor/read/propose | 目标缺失时需引导进入真实作品；保存读回待全面实测 |
| 素材 | context.materials；Pi获取/生图 | Codex排除获取；上传及管理未映射；生图未接画布 |
| 知识 | read/text；Pi distill；learning候选 | Codex排除distill；组织管理缺adapter |
| 雷达/情报 | 有限分享导入、研究与读取 | workspace/source/item/run缺管理adapter |
| 定位 | 详情读取、Pi候选 | Codex排除生成；管理/问答未完整映射 |
| 账号组/绑定 | 正式组/绑定start/status/capabilities存在 | 聊天无实时能力/绑定入口；available不能当已登录 |
| 发布准备 | Pi持久publish.package与确认卡 | Codex排除；真实发布不能与准备混称 |
| 首页/概览/分析/复盘 | metrics/publications/comments；Pi review | 聚合与刷新未映射；读取失败被当空值 |
| 日历/自动化 | 正式calendar/scheduling原owner存在 | 聊天无读取及有限确认操作 |
| 设置 | 冻结Skill读取、产品指南 | 缺非敏感能力摘要；local.tools不是模型配置 |
| 画布 | 当前单画布read/propose，正式节点生成/结果证明 | 无AI新建；Codex过滤；generic material.generate不绑定节点 |
| 视频 | 原生typed patch、预览、采纳、撤销、保存、MP4 | 原生目标仍开放旧video.edit.render；语义粗剪需真实转写；字幕/变速/替换真模型待验 |

## 代码因果

- chat-turn-submission.service先通用assemble后附executionEngine；chat-assembly skillsBrief仍来自surface whitelist；external-task-tool.service随后以safeNames/host/none或proposal再次过滤。external-chat-worker-run原样使用旧input.system，构成能力与提示词漂移。
- canvas工具宿主要求已有受信canvasId，Codex safeNames未包含canvas.read/propose。material.generate走host.task-submit且committed，不能仅加safeNames；其结果卡仅入素材库，未绑定画布。
- 原canvas.node.generate已冻结revision/node/reference file/checksum/groupVersion/inputDigest，沿原asset.generate预约和结果证明。应复用，不能按文件名猜生成归属。
- 原生视频work.editor已绑定真实output/production/scene/revision、120000 ticks/sec与选区；旧video.edit.render读取renderProps而非原生轨道。明确native目标时过滤旧工具，保留合法旧入口。
- chat-receipt-projection把普通error/blocked投影成output-available并丢外层outcome；context-card-registry按缺字段显示[]/0；ChatToolTrace统一绿色已调用；ACP MCP bridge缺settled error的isError。

## 边界

公共operation目录和正式service不能直接变成任意写RPC。新增发现不授权执行，read只走受审的固定端口，write只给有限严格typed候选，经用户确认和原owner执行。候选沿用executionCall原回执；adopt须验证真实来源及幂等，未知查询原请求。禁止AI直写数据库、伪造ID、越组、输出配置密钥或另建调度引擎。

本轮源码两位独立只读代理报告CONCERNS/盘点完成，均未运行产品测试、模型、UI或业务写入。完整实现范围尚待SPEC独评；本文件不是实现准入或验收PASS。
