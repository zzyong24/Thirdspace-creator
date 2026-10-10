# LED009 真实 Skill owner 跟随的最小工具候选（未实现）

源码 af34bef454d4bab319e75806c068b9f3a7f8bf3f，未改生产、Skill、scanner、tests、contract或正式review轮。本轮真实静态门 led009-af34-semantic-boundary-red.log exit1，只报backend/video-decisions-runner.ts未调用material.match。另独立执行原video-decisions-runner.test.ts，98/98通过、2.06秒exit0；不是把失败门用分项通过放行，LED009整门仍FAIL。

## 原批准契约与后续 owner 迁移

| 来源 | 准确条款与不变约束 |
| --- | --- |
| T-712 / DEC-AI-039 | DECISION_LOG.md:2479–2498，明确用户已确认：素材/场景语义选择只由可配置Skill/模型完成；video.broll只规划需求，material.match读口播/场景/真实项目inventory，返回真实assetId/sceneIdx/at/durationSec/reason/presentation；代码只权限/ID/类型/范围/时间/幂等/安全。静态门与运行回归须核真实主链调用。 |
| LED009账本 | LESSON_LEDGER.md:266–279，原词表/Jaccard旁路失败、GuardRule和GuardCheck原样保；Outcome跨行业真实新包仍待验，不把98合成测试替它。 |
| 现系统架构 | SYSTEM_ARCHITECTURE.md:50，素材与场景语义匹配归Skill/模型；guard只事实安全边界。 |
| T915已有迁Worker要求 | 正式旧母R02的单一Worker寿命/领域宿主职责，R05所有入口迁唯一owner及兼容出口证据；2026-09-07已记录video.decisions完整迁入Worker。不是新增R03a/R05a draft的授权。 |
| 迁移事实 | commit66bb9484367d25b5f6da389cf48707f74d25c3dc及docs/research/2026-09-07-video-decisions-worker-ablation.md:7–17：3501行纯决策迁Worker，backend仅兼容导出，material.match/分块/检查点/补充选材原业务保留。此消融记录当时未跑业务，不能冒当时PASS。 |

## 当前确切调用链

backend兼容文件只有注释与 `export * from "@creatoros/ai-worker/video-decisions-runner"`。ai-worker/package.json:87–90的types/default均精确指向 `./src/runtime/video-decisions-runner.ts`。真实runtime:2182的decideMaterialBroll在非空inventory上调用structured接口，:2201真实skillId material.match；真实runVideoDecisions:3022，:3154/:3299分别材料模式/完整链调用同函数。

Worker入口 `ai-worker/src/execution/video-decisions-worker.ts:3,19–31` 直接import该runtime；callStructured用真实node.skillId→resolveVideoModel→durableGenerationModel原operation/ledger→effectiveSkillSnapshot内模板→runStructuredNode，不是宿主本地伪Skill字符串。backend business adapter冻结本人project inventory/storyboard及现各Skill身份，候选投影重验冻结inventory/真实ID。

原回归test经backend兼容导出真实调用同Worker runtime；T712:1687精确检查structured call.skillId和library/visualSlots、AI结果真实ID及时间吸附；:1805动态schema编造ID/封面/场景拒绝；:2750材料模式calls仅material.match并保场景/字幕；空结果/违约/取消/格式修复/排除与安全事实原98保。没有用户关键词/Jaccard选择新素材。模型callback是合成测试接口，不宣称付费provider/真实跨行业素材质量。

## 原工具失败根因

semantic-boundary-scan.mjs:65–72只在已退役实现owner的backend wrapper内搜索 `skillId: "material.match"`，不跟当前已声明包export与唯一Worker owner，故实际存在Skill仍拒绝。现扫描范围已经包含ai-worker/src，所有高风险启发式扫描没有这次报错。不能在wrapper加注释/假调用literal、allowmarker或删除这项guard来凑绿，也不能以ledger失败推断production缺Skill。

## 唯一最小候选与精确写集

候选只改 `orchestrator/process/semantic-boundary-scan.mjs` 的视频owner定位：核backend wrapper移除单行注释后必须精确唯一export；核受控ai-worker/package.json的同一specifier types/default都指向已知Worker实现；再在实际owner查真实Skill和原4个禁止启发式。仍扫描原3个roots/同扩展/同allowmarker规则，prompt职责分离门、原失败exit和原完整video98 GuardCheck不删、不变。

LED009_OWNER_GUARD.candidate.patch是未应用精确patch；不执行候选、不产生GREEN。特定已知export双向核对，不泛化任意URL/外部路径/dynamic code读取；缺文件/坏JSON/导出分歧/缺Skill均硬FAIL，不fallback当支持。

若主控经独立边界复核授权，再在 `orchestrator/process/semantic-boundary-scan.test.mjs` 增加Node内建隔离fixture回归（新增工程文件仍需登记准确写集）：正常wrapper→正确package→真实Worker的正控制，删实际Skill/只wrapper注释literal、错误specifier、types/default分歧/越界owner、wrapper额外第二实现、原禁止词/未声明高风险、原prompt声明缺失各真实拒绝。fixture不使用用户目录/数据库、不会执行import的业务code，也不将异常吞作通过；实际运行仍是原canonical scanner加原98，不只纯helper绿。新测试如何构造可注入repo根或只读owner解析helper先作精确工具设计，不给guard添加宽泛skip/root捷径。

## 用户结果与恢复

此修复仅让门卫准确跟随已批准唯一owner，用户本人既有项目inventory→material.match真实选择→video_decisions候选→明确采纳→真实成片的业务路径不变。若实际Worker缺方法/模型/素材，沿现明确失败/旧候选与人工纠错，不凭此工具修复新造自动成片能力。回退仅该工具patch；原FAIL和完整98证据保留，reconcile需授权后重新真实运行，不能现在把LED009或全reconcile标PASS。无T915新轮、生产发布/秘密/OS安装操作。
