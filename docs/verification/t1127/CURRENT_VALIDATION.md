# T1127 当前主分支验证

本轮实测修复了五个产品路径：同口径有效样本不被另一格式遮掉、缺日保留真实空值、错过简单计划只补最近一份、老作品指标按北京时间自然日判断，以及图表孤立点不随窗口拉成椭圆。原任务归属、幂等和数据完整性规则保持。安装中的d712包尚不包含这次源码改动。

```mermaid
flowchart LR
 A[保留同口径实测] --> B[相邻日比较 缺日留空]
 B --> C[有坐标的图表 正圆孤立点]
 D[错过最近计划] --> E[核原尝试 防重复]
 E --> A
```

## 当场发生的验证

- 独立SPEC先CONCERNS，补上正式图表视觉入口后Round2 PASS；真实taskctl start后先只移植七条测试。原产品未改时后端20FAIL/37PASS、图表3FAIL/7PASS均命中目标缺口，不用工具依赖失败充作RED。
- 整合五条产品后后端六文件57PASS；包含正式self collector、持久sync/analytics与ingestion service/DB。数据库是隔离PGlite，外部平台、对象存储和导出端口有明确替身；不签真人采集。
- 图表10PASS、原调度公开装配两文件6PASS、LED047八文件174PASS。前后端类型exit0。静态组合原exit1来自根会话写错orphan入口；boundary/semantic/diff分别exit0，纠正后的原orphan-scan为exit0/0error/100既有warnings。
- 当前Chrome组件回放1366×900、900×900：孤立点彩色核心由17×7、9×7变为两处5×5，SVG strokeWidth仍6。主会话实际查看四张前后图片，坐标、日期、空档和原摘要保留。数据是合成五日单点，不冒充真实账号或原生App页面；ROOT_VISUAL_CHECK记录眼验。
- timeout-policy真实exit1，静态27条；全部后续公开消费者回归通过。27条涉及的13个文件与整合前6c35033e逐字相同，未移植路径没有新增短预算。旧原始27行已不在本机，未重造其逐行比对。关联T1081。
- 当前独立复核PASS_SCOPED_T1127_SOURCE_AND_FOCUSED_GATES_PENDING_GLOBAL_RECONCILE，无未解决发现。完整canonical reconcile已结束：exit1/1612.7785秒，43ERROR/0warning；原41逐字保留，新增LED031/LED061。已分别登记T1131/T1132并start，尚不认作范围外债务；未签全局通过或任务完成。

详细命令、真实时间、退出码、耗时及日志SHA256见actual-command-receipts.json。原始日志保留于私有验收目录t1117-20261009，不提交业务正文、URL或凭据。完整对账原stdignore没有保留内层断言。T1131分段复验原backend两文件30PASS、原RAT67PASS；T1132原完整资源生命周期五组26文件352PASS。产品12路径均未改，原完整43失败仍保留，不能用分段PASS代签全局或原首因。后续按原lesson同序采集内层日志，当前任务保持进行中。父T1124其它来源整合与T1062下一包仍未完成。

T1130已独立核验适用性登记：本任务无formal journey contract，只有组件回放；验收列校正为—并保留全部原要求，不把合成数据冒作non-fixture或补拍refresh/back。DEC-T1130-01、实际单格前后SHA/控制审计及真实taskctl completion均保留。T1129孤儿命令校正也已独立复核和真实taskctl完成。

## 后续当前主线完整对账

70366979仅修T1133两测试协议漂移，T1127十二条源SHA未改；原规则完整canonical实际1693.530284959秒/exit1/39ERROR/0warning，日志SHA7015fc99b4232a35b42ea959a7bc1f2de90c613267ea47330f34b47d6ad96498。原41中的LED032/040在当前已修，原43新增031/061本轮未复现，新增0。其余39全局失败原字节保留，不签全绿；新T1135旧安装成片色差是独立渲染范围，不能代签本组图表或本任务完成。当前有限功能闭合准入待独评。


## 当前限定收尾

2026-10-09独立收尾复核绑定当前70366979与真实canonical终态，详见 `../t1133/CURRENT_CLOSURE_REVIEW.md/json`。taskctl实际完成收据 `limited-completion-command.json`；原失败、39项全局ERROR及安装/模型/全功能未完成边界保留。
