# CreatorOS 任务看板(BACKLOG)

> **单一执行真相。每个会话必读(SessionStart hook 自动注入)。** 规则见 `CLAUDE.md` 的「任务流程铁律」。
> 状态:📋 待办 · 🔨 进行中 · ✅ 完成 · ⏸️ 搁置 · ⛔ SPEC 审核 FAIL(没过审不准开工)。
> 读取顺序:**本看板 → 任务引用的 SPEC → 代码**。
> 铁律:需求即任务(提了就建);开工从看板顶取;做完改状态+提交;**禁止 P0/P1 分级、禁止多阶段执行**,任务清楚即起 Workflow/并行 subagent 一次做完。

## 🔨 进行中 / 📋 待办(按执行顺序,从上往下取)

| ID | 任务 | 状态 | 文档 | 一句话 |
|---|---|---|---|---|
| T-527 | 统一纠正 T-516/T-517/T-518/T-519 的过度设计，恢复最小完整用户闭环【产品范围重置·用户 2026-07-26】 | ✅ 完成 | [范围重置](docs/superpowers/specs/2026-07-26-overdesign-scope-reset.md) · [独立审计](docs/superpowers/specs/2026-07-26-overdesign-scope-reset.review.md) | 旧 FAIL 工件保留但关闭 BUILD：自动化复用现有调度与 PersistentTaskService，健康检查只做确定性报告，问题反馈复用 supportUrl，知识库先修 Assets 归属/幂等再补文件夹；框架优化不混入本任务。 |
| T-489 | Windows updater `latest.json` 下载 URL 混入 runner 绝对路径【bug·桌面发布·CI 2026-07-23】 | ✅ 待办 | [详情](docs/tasks/T484.md#t-489) | 发布实物审计发现 `D:\a\...setup.exe` 被直接拼入 GitHub Release URL；须跨平台提取纯文件名并用 Windows 路径红测锁定。 |
| T-488 | 抖音已在“网站登录保管库”登录，Copilot 读取视频仍返回 `needLogin`【bug·网页登录态·用户 2026-07-23】 | ✅ 待办（用户已恢复） | [详情](docs/tasks/T484.md#t-488) | 用户已确认内容雷达 UI，要求恢复排查与修复。 |
| T-487 | 合并 T-454 等桌面打包欠债：借鉴 skills-manager/Tauri 官方实践，统一跨… | ⏸️ 阻塞/搁置 | [详情](docs/tasks/T484.md#t-487) | 满足恢复条件后继续。 |
| T-482 | 将现有「信号源」重构为定位→内容雷达(对标监控)→选题的内容情报工作区【产品方向·用户 2026-… | ✅ 进行中 | [详情](docs/tasks/T484.md#t-482) | 验收须覆盖：分享链接单条建档（零自动转写）→手动转写→结构拆解→选题→Project 证据透传。 |
| T-481 | Windows 10「定位规则无法手动修改」【bug·定位·用户 2026-07-23】 | ✅ 已完成 | [详情](docs/tasks/T484.md#t-481) | 规则卡可直达内容规则编辑；两个表单按最新档案合并保存，避免隐藏表单旧快照覆盖。 |
| T-480 | 盲预测建议无法一键修改原稿,且综合分默认 0/无值【bug+体验·校准·用户 2026-07-23】 | ✅ 已完成 | [详情](docs/tasks/T484.md#t-480) | 嵌套 dimensions 正确计算综合分；建议可生成修订候选，预览采纳后才写回原稿。 |
| T-479 | 项目制作页「口播稿(提词用)」无法用 Ctrl+A 只全选稿件【体验·Windows·用户 202… | 🔗 已归并 | [详情](docs/tasks/T484.md#t-479) | 沿合并任务追踪。 |
| T-478 | 选题池丢弃的选题仍留在左侧统计、今日新选题与首页热门选题【bug·读模型·用户 2026-07-23】 | ✅ 已完成 | [详情](docs/tasks/T484.md#t-478) | 当前池统计、今日新选题和首页热门统一排除 dropped；淘汰项只留在历史语义。 |
| T-477 | MiniMax M2.5 发布物料长时间停在后台生成,且结果只有标题/标签没有简介【bug·发布物… | ✅ 已完成 | [详情](docs/tasks/T484.md#t-477) | 简介改为必填；runner/UI 贯通实时步骤与脱敏失败原因。 |
| T-476 | Windows 10「导出诊断日志」显示打开失败【bug·桌面·用户 2026-07-23】 | ✅ 已完成 | [详情](docs/tasks/T484.md#t-476) | 复验 explorer.exe spawn 语义；打开失败时显示 canonical 日志目录供手动前往。 |
| T-473 | MiniMax M2.5 补全选题卡在后续对话轮次重复调用【bug·Copilot·用户 2026… | ✅ 已完成 | [详情](docs/tasks/T484.md#t-473) | 入口 functionKey 已改 one-shot，同回合相同补全调用已去重。 |
| T-472 | MiniMax M2.5 每日自动出题的标题混入 JSON/代码正文【bug·AI 输出·用户 2… | ✅ 已完成 | [详情](docs/tasks/T484.md#t-472) | AI schema 拒绝并重试污染标题，Candidate 落库域同步拦截。 |
| T-470 | 「语音转文字」未配云端模型时,示例地址/模型 ID 像已填值 + 测试连接返回绿色勾,误导用户以为… | ✅ 已完成 | [详情](docs/tasks/T484.md#t-470) | 未配云端改中性本地回退说明，空值保持为空且示例显式标注。 |
| T-469 | 扫码绑定新抖音号首失败:`HttpTransport 400 for ingestion.douy… | ✅ 已完成 | [详情](docs/tasks/T484.md#t-469) | Playwright CLI 改确定性 fs 扫描；零作品/身份暂不可读账号也可独立绑定并后续回填。 |
| T-456 | T-439 尾巴修:system prompt 里的工具名字面量引用也统一 sanitize(用户… | 📋 根因已定位，待实现 | [详情](docs/tasks/T484.md#t-456) | 按详情实现。 |
| T-451 | 【防逆向优化 D-④·战略层·合并 T-447】把 license verdict 判定+启动 m… | ⏸️ 暂时挂起（待确认） | [详情](docs/tasks/T484.md#t-451) | 用户恢复确认后继续。 |
| T-450 | 【防逆向优化 D-③】完整性验证从"单文件入口"扩到"清单 hash 抽样"——现在 Window… | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-450) | 用户已统一验收；保留既有实现证据。 |
| T-449 | ~~【防逆向优化 D-②】Windows 直装 sidecar 目录 ACL 收紧~~ **调研结… | ⏸️ 阻塞/搁置 | [详情](docs/tasks/T484.md#t-449) | 满足恢复条件后继续。 |
| T-448 | 【防逆向优化 D-①-b】sidecar 内父进程/magic 自检 | ⏸️ 阻塞/搁置 | [详情](docs/tasks/T484.md#t-448) | 满足恢复条件后继续。 |
| T-442 | 模型「model not found」被误翻成「要操作的内容已不存在」——人话化缺「模型无效」规则… | 📋 根因已定位，待实现 | [详情](docs/tasks/T484.md#t-442) | 按详情实现。 |
| T-439 | copilot/编导定位在 DeepSeek·OpenAI·Anthropic 下全废——工具名带… | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-439) | 用户已统一验收；保留既有实现证据。 |
| T-438 | 网页截图在 fake-ip 代理环境全废——SSRF 防护把 198.18.0.0/15 当内网保… | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-438) | 用户已统一验收；保留既有实现证据。 |
| T-437 | 新安装包(bytecode 版)另一台 mac 启动很慢 + 弹窗后白屏,回归——同机上个 pla… | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-437) | 用户已统一验收；保留既有实现证据。 |
| T-433 | 多账号采集提速(绑号轻触发+优先级双队列+错峰+排队进度)——**防封已达标不动,优化速度**【性… | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-433) | 用户已统一验收；保留既有实现证据。 |
| T-433 S2 | gate-F5 升两级优先串行闸(并发仍=1):明细类(self.metrics/self.det… | 📋 待办 | [详情](docs/tasks/T484.md#t-433-s2) | 按详情实现。 |
| T-433 S4 | 排队进度可见:job_run 加真 `queued` 态(createRun 落 queued,r… | 📋 待办 | [详情](docs/tasks/T484.md#t-433-s4) | 按详情实现。 |
| T-433 S5 | (可选)benchmark/darkhorse 加已知 awemeId early-stop 增量… | 📋 待办 | [详情](docs/tasks/T484.md#t-433-s5) | 按详情实现。 |
| T-430 | copilot 蒸馏长文(41403 字)卡住+出错 = knowledge.distill 静默… | 📋 根因已定位，待实现 | [详情](docs/tasks/T484.md#t-430) | 按详情实现。 |
| T-429 | ④双语字幕 长视频失败「Invalid JSON response」= 单次要模型译全部字幕行→输… | 📋 根因已定位，待实现 | [详情](docs/tasks/T484.md#t-429) | 按详情实现。 |
| T-426 | Windows 真机装完打开白屏「127.0.0.1 拒绝连接 / ERR_CONNECTION_… | ⏸️ 暂时挂起（待确认） | [详情](docs/tasks/T484.md#t-426) | 用户恢复确认后继续。 |
| T-425 | Windows 安装器 WebView2 离线化:`tauri.windows.conf.json… | 📋 待办 | [详情](docs/tasks/T484.md#t-425) | 按详情实现。 |
| T-413 | 上线前防逆向/防盗版落地(两新方案文档落地 + 现有 T-391/T-399/T-392 对账去重… | 🔨 进行中 | [详情](docs/tasks/T484.md#t-413) | 按详情实现。 |
| T-415 | P0-B:handshake 打包态 fail-closed(**编译期烘焙常量非 env**,类… | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-415) | 用户已统一验收；保留既有实现证据。 |
| T-417 | L1 字符串加密补齐:chunks/ 的 prompt/端点 rc4 stringArray(**… | ⏸️ 暂时挂起（待确认） | [详情](docs/tasks/T484.md#t-417) | 用户恢复确认后继续。 |
| T-418 | L2 sidecar 加密落盘:tar AES-256-GCM(build 时)+ Rust 运行… | 📋 待办 | [详情](docs/tasks/T484.md#t-418) | 按详情实现。 |
| T-419 | L3 V8 字节码:bytenode 编叶子业务 chunk(锁打包 node v25.9.0,t… | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-419) | 用户已统一验收；保留既有实现证据。 |
| T-420 | L4 皇冠函数 napi-rs 原生化(2-3 个;**授权终判已在 Rust 无需重做,半个 L… | 📋 待办 | [详情](docs/tasks/T484.md#t-420) | 按详情实现。 |
| T-399 | 反 AI 破解欺骗层调研+方案【调研·防逆向下一层·用户 2026-07-18 口述】 | ⏸️ 暂时挂起（待确认） | [详情](docs/tasks/T484.md#t-399) | 用户恢复确认后继续。 |
| T-399a | 反破解欺骗片1:R4 真注释断言(源码 AST dev-only 标记→产物层验证不可达,扫 ch… | 📋 待办 | [详情](docs/tasks/T484.md#t-399a) | 按详情实现。 |
| T-399b | 反破解欺骗片2:D1 Class A 静态蜜罐门(ed25519 形态假门,零引用永不加载)+ R… | 📋 待办 | [详情](docs/tasks/T484.md#t-399b) | 按详情实现。 |
| T-399c | 反破解欺骗片3:D3 严格不可达迷宫 + D4 量化污染(诱饵占比≥40%)+ §4.2 性能预算… | 📋 待办 | [详情](docs/tasks/T484.md#t-399c) | 按详情实现。 |
| T-409 | 创作包只读导出端点(供 ArticleOS 拉取)【跨仓需求·ArticleOS 2026-07-… | 📋 待设计/审核 | [详情](docs/tasks/T484.md#t-409) | 按详情实现。 |
| T-372 W-spike | 双端地基 spike(先行):Win 系统 tar.exe(bsdtar)对 pnpm symli… | 📋 待办 | [详情](docs/tasks/T484.md#t-372-w-spike) | 按详情实现。 |
| T-372 W-ci | GitHub Actions matrix(macos-latest+windows-latest… | ⏸️ 暂时挂起（待确认） | [详情](docs/tasks/T484.md#t-372-w-ci) | 用户恢复确认后继续。 |
| T-391 H-log | 加密日志(短板 H1,`logging.rs` 独立文件·可先并行):framed hybrid—… | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-391-h-log) | 用户已统一验收；保留既有实现证据。 |
| T-391 H-mac | macOS Hardened Runtime 全开 + entitlements 审计(不含 `d… | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-391-h-mac) | 用户已统一验收；保留既有实现证据。 |
| T-391 H-key | master key 传递废 env `CREATOROS_MASTER_KEY` 明文注入改 s… | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-391-h-key) | 用户已统一验收；保留既有实现证据。 |
| T-391 H-native | 放行去单点化(结果参与后续真实计算,patch 掉则功能坏非跳过)+ 多点冗余判定 + 时间随机化… | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-391-h-native) | 用户已统一验收；保留既有实现证据。 |
| T-391 H-econ | 破解经济学(短板兜底·**后续波次·依赖 L1s 服务端·非本仓·不阻塞内测**):更新强绑授权(… | 📋 待办 | [详情](docs/tasks/T484.md#t-391-h-econ) | 按详情实现。 |
| T-392 | sidecar 打包泄露整棵 frontend 源树:`src/` 269 个 .ts 明文 +… | 🔨 进行中 | [详情](docs/tasks/T484.md#t-392) | 按详情实现。 |
| T-393 | 稿面审核状态不刷新:脚本改后重新审核完成,横幅仍说「脚本已改动,当前稿未重新审核」;「先去审核」跳… | ⏸️ 暂时挂起（待确认） | [详情](docs/tasks/T484.md#t-393) | 用户恢复确认后继续。 |
| T-394 | 「看校准历史」点击 404(/settings?tab=calibration 不存在);用户拍板… | 🔨 进行中 | [详情](docs/tasks/T484.md#t-394) | 按详情实现。 |
| T-395 | 生成封面提示词改造:以最新发布作品封面为参考图、风格保持一致、结合本条内容出一张候选【需求·用户… | 🔨 进行中 | [详情](docs/tasks/T484.md#t-395) | 按详情实现。 |
| T-401 | 配置备份导出/导入报 `forbidden: request must originate fro… | ⏸️ 暂时挂起（待确认） | [详情](docs/tasks/T484.md#t-401) | 用户恢复确认后继续。 |
| T-403 | 封面点击率恒显 0.0% 数据不对——「无数据」和「真 0」混同 +「1」误当 1%【bug·数据… | 🔨 进行中 | [详情](docs/tasks/T484.md#t-403) | 按详情实现。 |
| T-404 | 「帮我复盘」卡挪到右栏、放复盘编辑上面【UX·用户 2026-07-18】 | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-404) | 用户已统一验收；保留既有实现证据。 |
| T-405 | 复盘对话 AI 试错三轮+编造推测:盲猜 artifactType 读空→输出「被覆写/没入库」猜… | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-405) | 用户已统一验收；保留既有实现证据。 |
| T-400 | 封面参考链路打通:copilot 拿不到「最新发布作品的封面」使 T-395 落不了地(真机 20… | 📋 待办 | [详情](docs/tasks/T484.md#t-400) | 按详情实现。 |
| T-406 | 腾讯云 CDN 藏源站 IP + 挡 DDoS + WAF/限流(license.aitongba… | 🔨 进行中 | [详情](docs/tasks/T484.md#t-406) | 按详情实现。 |
| T-407 | 盲预测深结合历史战绩:建「历史战绩画像」(完播/CTR/播放中位数分布+爆款vs哑弹模式蒸馏)喂进… | 🔨 SPEC 已过，待实现 | [详情](docs/tasks/T484.md#t-407) | 按详情实现。 |
| T-396 | 渠道化(代理白标)链接 + 更新分发改造【需求·商业模型·用户 2026-07-18 口述,方案当… | ⏸️ 暂时挂起（待确认） | [详情](docs/tasks/T484.md#t-396) | 用户恢复确认后继续。 |
| T-397 | release 包在开发机引用仓库 sidecar 源目录:resolve_sidecar_dir… | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-397) | 用户已统一验收；保留既有实现证据。 |
| T-398 | scheduler 启动清僵尸 ai_task 报 AccountRequiredError(ai… | 📋 待办 | [详情](docs/tasks/T484.md#t-398) | 按详情实现。 |
| T-366 | 视频阶段「成片三路」+ 素材包导出 zip:①制作阶段加「用 CreatorOS 制作 / 直接上… | 📋 待办 | [详情](docs/tasks/T484.md#t-366) | 按详情实现。 |
| T-366c | G3 · 真机验收:上传成品→发布走通;导出 zip 解开含全素材+可读编导说明+诚实标注非剪映工… | 📋 待办 | [详情](docs/tasks/T484.md#t-366c) | 按详情实现。 |
| T-361 | 素材视觉模型自动打标签:接 model-config 视觉 capability,上传/采集后自动… | 📋 待办 | [详情](docs/tasks/T484.md#t-361) | 按详情实现。 |
| T-352 | Windows 双端打包(独立工程)【发布·用户 2026-07-16】 | ⏸️ 暂时挂起（前置未满足） | [详情](docs/tasks/T484.md#t-352) | 前置条件满足后恢复。 |
| T-320c | 剪辑质量:视频信息卡避让底部字幕带(place() 纵向溢出策略)【T-320b 残留·独立】 | 📋 待办 | [详情](docs/tasks/T484.md#t-320c) | 按详情实现。 |
| T-350 | 制作阶段·脚本 tab「发布包生成」入口:把已有 `platform.adapt` skill 接… | 📋 待办 | [详情](docs/tasks/T484.md#t-350) | 按详情实现。 |
| T-350c | S3 · 真机验收:重打包/dev 真跑 AC-1~5(MiniMax 下走通不 cancelle… | 📋 待办 | [详情](docs/tasks/T484.md#t-350c) | 按详情实现。 |
| T-351 | 审核能力单一真值化:审核 SOP 从各生成模板抽出→收进**产品级数据**(review_rule… | 📋 待设计/审核 | [详情](docs/tasks/T484.md#t-351) | 按详情实现。 |
| T-349 | 单视频逐字稿抓取扩到两个新 surface(**非全局·单条按需按钮·复用现成失败韧性**)【功能… | 📋 待办 | [详情](docs/tasks/T484.md#t-349) | 按详情实现。 |
| T-349d | S4 · 真机验收:AC-1~5(对标抓稿+幂等复用/图集 skip 诚实/已发布关已有 arti… | ⏸️ 暂时挂起（前置未满足） | [详情](docs/tasks/T484.md#t-349d) | 前置条件满足后恢复。 |
| T-339 | frontend lint 债务清零:全仓 eslint 2461 errors(历史累积),分簇… | 📋 待办 | [详情](docs/tasks/T484.md#t-339) | 按详情实现。 |
| T-328 | 修 T-326 上线审计 bug(4 Blocker/26 High/22 Medium/1 Lo… | 🔨 进行中 | [详情](docs/tasks/T484.md#t-328) | 按详情实现。 |
| T-333 | BACKLOG 台账瘦身(T-328 收口后执行):①`bash <skill>/tools/in… | 📋 待办 | [详情](docs/tasks/T484.md#t-333) | 按详情实现。 |
| T-332 | 追溯登记补账:API-*/TEST-* 回登 ID_REGISTRY canonical 块;矩阵… | 📋 待办 | [详情](docs/tasks/T484.md#t-332) | 按详情实现。 |
| T-336 | 技能配置页诚实化 + 「我的叮嘱」可视化:①下架/弃用僵尸 skill `knowledge.cl… | 📋 待设计/审核 | [详情](docs/tasks/T484.md#t-336) | 按详情实现。 |
| T-335 | 用户自定义 skill 体系(L2):三层 skill(L0 出厂只读基线 / L1 覆写层=T-… | 📋 待设计/审核 | [详情](docs/tasks/T484.md#t-335) | 按详情实现。 |
| T-337 | 日志与 AI 可观测性层:①轻量 logger 封装(级别/命名空间/traceId,stdout… | 📋 待设计/审核 | [详情](docs/tasks/T484.md#t-337) | 按详情实现。 |
| T-337a | contract 零依赖 logger(级别/ns/traceId 单行结构化,stdout→si… | 📋 待办 | [详情](docs/tasks/T484.md#t-337a) | 按详情实现。 |
| T-337b | traceId 贯穿:requestId 真 uuid(chat route/任务派发/定时 ti… | 📋 待办 | [详情](docs/tasks/T484.md#t-337b) | 按详情实现。 |
| T-337c | AI 黑匣子 `ai_call_log` 表(trace/task/会话关联+capability… | 📋 待办 | [详情](docs/tasks/T484.md#t-337c) | 按详情实现。 |
| T-337d | webview 错误落盘:root `global-error.tsx`(现只有 segment… | 📋 待办 | [详情](docs/tasks/T484.md#t-337d) | 按详情实现。 |
| T-337e | logging.rs 轮转改大小制(10MB×5 份+现役,启动不再覆盖 prev)+ 一键诊断包… | ⏸️ 暂时挂起（前置未满足） | [详情](docs/tasks/T484.md#t-337e) | 前置条件满足后恢复。 |
| T-337f | 成本可观测:provider 预设附 pricing(自定义可填,不填只显 token)+ 收口处… | 📋 待办 | [详情](docs/tasks/T484.md#t-337f) | 按详情实现。 |
| T-337g | Pi 会话转录落盘:SessionManager.inMemory → 文件版(appDataDi… | 📋 待办 | [详情](docs/tasks/T484.md#t-337g) | 按详情实现。 |
| T-334 | ai_tasks 任务可靠性层:错误分类(配置错误→引导去设置不重试 / 瞬态→自动退避重试 2-… | 📋 待设计/审核 | [详情](docs/tasks/T484.md#t-334) | 按详情实现。 |
| T-314 | Pi 全产品落点 + 记忆层 + 对话式改 skill/记忆——调研 → 落点地图 → SPEC… | 🔨 SPEC 已过，待实现 | [详情](docs/tasks/T484.md#t-314) | 按详情实现。 |
| T-324 | Pi 全面接管:抓取网页/截图/自动化任务/剪辑切到 Pi 引擎;自动化任务=模板脚本 + 沙箱模… | ⏸️ 阻塞/搁置 | [详情](docs/tasks/T484.md#t-324) | 满足恢复条件后继续。 |
| T-340 | agentic.research 三端口真接线(gate-M2 硬前提):web.search 复… | 📋 待办 | [详情](docs/tasks/T484.md#t-340) | 按详情实现。 |
| T-313 | 点亮 Pi 引擎:pi-engine.ts 真接 `createAgentSession` + c… | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-313) | 用户已统一验收；保留既有实现证据。 |
| T-315 | Pi 记忆层·memory-tool(读):现有 14 表经 Context 层包成 Pi 记忆检… | 📋 待办 | [详情](docs/tasks/T484.md#t-315) | 按详情实现。 |
| T-316 | Pi 会话续(受控):pi-coding-agent JSONL SessionManager →… | 📋 待办 | [详情](docs/tasks/T484.md#t-316) | 按详情实现。 |
| T-317 | 跨会话偏好捕捉:对话里偏好/纠正经采纳门 → creator_profiles.downstrea… | 📋 待办 | [详情](docs/tasks/T484.md#t-317) | 按详情实现。 |
| T-318 | 对话式 skill/记忆进化(飞轮,复活 T-087 skill.evolve diff 卡)+… | 📋 待办 | [详情](docs/tasks/T484.md#t-318) | 按详情实现。 |
| T-319 | Pi 接 MCP client(装 pi-mcp-adapter,复用现有 MCP 工具;可选按需… | 📋 待办 | [详情](docs/tasks/T484.md#t-319) | 按详情实现。 |
| T-312 | 编导式/对话式剪辑 + ChatCut(SPEC track·母任务)【用户 2026-07-14… | 📋 待办 | [详情](docs/tasks/T484.md#t-312) | 按详情实现。 |
| T-321 | 日拉新作品不认「已绑定链接的已发布项目」→ 建重复项目 + 原项目卡「立项中」【bug·数据管线去… | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-321) | 用户已统一验收；保留既有实现证据。 |
| T-322 | 每日抓作品没抓到新作品的封面【bug·数据管线·封面回填·用户 2026-07-14】 | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-322) | 用户已统一验收；保留既有实现证据。 |
| T-308 | 制作页四决策「可离开本页」但切页即要求重新生成【bug·阻断·状态恢复】 | 📋 待办 | [详情](docs/tasks/T484.md#t-308) | 按详情实现。 |
| T-309 | 弹药库 B-roll 素材在制作阶段仍未被用上【bug·T-294 尾·核查】 | 📋 待办 | [详情](docs/tasks/T484.md#t-309) | 按详情实现。 |
| T-311 | GitHub 登录了仍报"未登录"——`detectLoginWall` 裸关键词撞内联 JS 误… | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-311) | 用户已统一验收；保留既有实现证据。 |
| T-307 | playwright 启动点统一浏览器选择(截图崩 chrome-headless-shell +… | ⏸️ 暂时挂起（待确认） | [详情](docs/tasks/T484.md#t-307) | 用户恢复确认后继续。 |
| T-305 | 主题翻转:进 app 暗色→点设置变亮色【bug·主题·根因已定】 | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-305) | 用户已统一验收；保留既有实现证据。 |
| T-306 | 首页「页面加载失败,请稍后重试」【bug·待复现·疑似瞬时】 | ⏸️ 暂时挂起（待复现） | [详情](docs/tasks/T484.md#t-306) | 获得稳定复现证据后恢复。 |
| T-304 | 素材库网格缩略图全黑——`<video preload=metadata>` 不画首帧【bug·素… | 🔨 进行中 | [详情](docs/tasks/T484.md#t-304) | 按详情实现。 |
| T-299 | 抖音采集(评论/收藏夹/选题)崩:chrome-headless-shell 缺失【bug·阻断·打包】 | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-299) | 用户已统一验收；保留既有实现证据。 |
| T-300 | 热门选题采集 0 条(采集对标他号作品→新增0/更新0,黑马雷达3词无黑马)【bug/数据·待查】 | 🔗 已归并 | [详情](docs/tasks/T484.md#t-300) | 沿合并任务追踪。 |
| T-301 | 首页 4 个空 widget 规划:待办事项/热门选题热度/数据概览/创作建议【产品·设计·调研已完成】 | 📋 待办 | [详情](docs/tasks/T484.md#t-301) | 按详情实现。 |
| T-303 | 首页热门选题热度活起来——每日出题分落库 + 读端兜底 positioningFit【bug·首页… | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-303) | 用户已统一验收；保留既有实现证据。 |
| T-302 | 首页待办事项接生产者——派生 actionable 待办(待确认渲染/待复盘)【bug·首页·T-… | ⏸️ 暂时挂起（待确认） | [详情](docs/tasks/T484.md#t-302) | 用户恢复确认后继续。 |
| T-298 | 存量素材时长回填——已入库的 durationMs=1000 假占位重探真值【bug·后续·T-2… | 📋 待办 | [详情](docs/tasks/T484.md#t-298) | 按详情实现。 |
| T-297 | 制作视频页编导侧边栏支持拖拽宽度(仿脚本阶段)+ 默认宽=编导对话可拖最大宽【功能·UX】 | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-297) | 用户已统一验收；保留既有实现证据。 |
| T-292 | 成片在产出框内预览(final.mp4 播放器)【功能·小·视频大功能③】 | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-292) | 用户已统一验收；保留既有实现证据。 |
| T-294 | 素材真被用上——制作页 B-roll 素材区 + 生成即重决策 + 排除 role=clip【bu… | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-294) | 用户已统一验收；保留既有实现证据。 |
| T-284 | 把 Chromium 打进 app——视频渲染永不下载/永不「未就绪」【拍板·渲染可靠性】 | 🔨 进行中 | [详情](docs/tasks/T484.md#t-284) | 按详情实现。 |
| T-282 | 今日新选题隐患:null 分候选被 NULLS LAST + pageSize 100 挤出第一页… | 📋 待办 | [详情](docs/tasks/T484.md#t-282) | 按详情实现。 |
| T-274 | 立论点树/任意功能「出错了,请重试」——悬空授权卡崩整流【bug·根因】 | 🔨 进行中 | [详情](docs/tasks/T484.md#t-274) | 按详情实现。 |
| T-275 | 脚本「像编的/没前因后果/突然抛概念」——叙事结构缺失【质量·根因】 | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-275) | 用户已统一验收；保留既有实现证据。 |
| T-276 | 读文件夹被授权4次 + AI操作不排队(仿 Claude 设计)【UX·根因】 | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-276) | 用户已统一验收；保留既有实现证据。 |
| T-277 | 审核跑在整稿前——审到旧空稿(时序 bug)【bug】 | ✅ 已验收（用户统一确认） | [详情](docs/tasks/T484.md#t-277) | 用户已统一验收；保留既有实现证据。 |
| T-261 | AI 关联飞轮(自动建网) | 📋 待设计/审核 | [详情](docs/tasks/T484.md#t-261) | 按详情实现。 |
| T-249 | 统一真机验证清单(考古跨任务残留承接) | 📋 待办 | [详情](docs/tasks/T484.md#t-249) | 按详情实现。 |
| T-250 | 工程健康批(T-145 残留收编,低优) | 📋 待办 | [详情](docs/tasks/T484.md#t-250) | 按详情实现。 |
| T-255b | ~~agent 引擎 executor 集成~~ **已并入 T-256b/d** | ⏸️ 阻塞/搁置 | [详情](docs/tasks/T484.md#t-255b) | 满足恢复条件后继续。 |
| T-185R | 访谈后替用户起草 custom skill(考古收敛自 T-185;elicitation 机制已… | ⏸️ 阻塞/搁置 | [详情](docs/tasks/T484.md#t-185r) | 满足恢复条件后继续。 |
| T-136R | 多账号残留两点(考古收敛自 T-136):①多号并存时定时 job 精确 targeting ②双… | 📋 待办 | [详情](docs/tasks/T484.md#t-136r) | 按详情实现。 |
| T-100 | 单视频分析页(观众/来源/留存维度) | ⏸️ 阻塞/搁置 | [详情](docs/tasks/T484.md#t-100) | 满足恢复条件后继续。 |
| T-087 | Skill 迭代循环机制(经验回流进化,防污染设计) | ⏸️ 阻塞/搁置 | [详情](docs/tasks/T484.md#t-087) | 满足恢复条件后继续。 |
| T-045 | 激活码授权 + 本机单用户模式(完整方案) | ⏸️ 阻塞/搁置 | [详情](docs/tasks/T484.md#t-045) | 满足恢复条件后继续。 |
| D8b | 单视频维度真数据(观众画像/来源/留存/关键时刻·走 T-038 限流) | ⏸️ 暂时挂起（前置未满足） | [详情](docs/tasks/T484.md#d8b) | 前置条件满足后恢复。 |

## 🎬 生命周期重设计 L0–L7(SPEC PASS-ready 2026-07-01,按序做)

> SPEC:[lifecycle-redesign-creation-first](docs/superpowers/specs/2026-07-01-lifecycle-redesign-creation-first.md)(gate CONCERNS→补清→PASS-ready,`5bb29c7`)。核心:每阶段 AI 干重活+产具体创作物+无真东西不摆空+创作向非学术;本地优先存储。**全做,无优先级,按 L 序(L0 地基先)。** 横切 Copilot/导航 bug 已修(T-014)。

| ID | 任务(切片) | 状态 | 一句话 |
|---|---|---|---|

## 🧬 真实作品数据管线 2.0(T-030 切片,D1–D8a 全完成 ✅,剩真机 e2e 卡 DATA-1/2)

> SPEC:[real-works-data-pipeline-v2](docs/superpowers/specs/2026-07-01-real-works-data-pipeline-v2-design.md)。**✅ gate CONCERNS→补清 F1-F4(SPEC 修订版)→可开工**(见 [REVIEW_LEDGER](docs/superpowers/specs/REVIEW_LEDGER.md))。垂直切片、各自可验,非阶段。开工顺序:D5→D3 快赢 → D1→D2→D4→D6→D7→D8a(D8b 单视频分析页规划中)。

| ID | 切片 | 状态 | 一句话 |
|---|---|---|---|

## ✅ 已完成

> ✅ 已完成任务全文已归档到 [BACKLOG-archive.md](docs/BACKLOG-archive.md)(减小本看板体积;单一执行真相仍是本文件)。
