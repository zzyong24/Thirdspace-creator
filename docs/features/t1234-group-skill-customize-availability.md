# T1234 验证账号组下Skill定制按钮的真实可用性

T1232只读核验发现：settings服务投影在组ctx下accountId=null且返回groupId；前端SkillsItem及SkillsSection定制可用条件仍以accountId非null判断，可能让合法组中的Skill全部不能定制。当前只有静态疑点，未实际浏览器签产品缺陷，不把official只读或权限拒绝一概称bug。

用户要求AI助手与Skill功能全面验证并及时修复缺口。先读T1022共享组归属、T513有效Skill/用户覆盖与当前公开settings.prompts契约、组内服务归属和前端projection/按钮真实消费者；利用T1232后续独立浏览器真实组入口核官方Skill的获批定制流程、按钮状态和对应public响应。必须区分原official不可直接改与用户组增量的合法定制，不借改owner/status扩大权限。保旧overlay、版本、冻结任务以及原effective快照不变。

当前只读写集仅本SPEC及 `docs/verification/t1234/**`、root控制看板/审计；无产品/测试准入，不启动额外Next/DB，不取真实用户秘密，不后台put假造UI成功。实际确认缺陷后提出精确UI投影/范围边界修复SPEC，按oil-ui-pro保现有tokens/组件并独立复核；所有归属、权限和effective消费者保持真实。验收须真实UI定制→公共同组读回→刷新→错组拒绝，不能仅helper PASS或恢复旧单账号旁路。

## 2026-10-11 精确候选与完整验收（待独立复核）

静态证据和逐项操作设计见 [诊断](../verification/t1234/diagnosis-and-candidate.md)。公开组覆盖已含 groupId，前端投影丢弃该字段并仅按 accountId 启用定制。此次保持既有服务归属和字段权限，不新增用户覆盖能力，不改变官方 Skill、历史版本、effective 快照、任务冻结、Owner 或 Status。先取得自然失败的真实 UI RED，再按下列最小修法闭合 GREEN；当前仍仅文档准入，不能先写产品再补评审。

拟涉及三个现有产品文件：

- `frontend/src/features/settings/skills-data.ts`：投影真实 nullable groupId，保留 legacy account-only 与无 scope 的区别。
- `frontend/src/features/settings/settings-interactive-region.tsx`：定制区域实例按真实组或账号及 scope kind 隔离，保当前 Dialog/分类/品牌和组件。
- `frontend/src/features/settings/skills-section.tsx`：合法组可定制；system/template/policy 分别遵守公开 editableFields，policy 同时要求真实 adapter 支持，patch 不发送未获许可的字段。写和历史操作固定在目录返回的原 scope，旧编辑器在真实组选择已改变而新目录未到达时禁止新写，已提交的合法原组请求继续完成，晚回执不写入新组界面、不重发。保原 CAS/错误/草稿，不绕开 backend 守卫。

拟测试文件为现有 `skills-data.test.ts`、`skills-section.test.tsx` 与新独立 `frontend/tests/e2e/group-skill-customization.spec.ts`；均先独评绑定，不改已冻结 T1232 七例、通用 helper、服务、契约或 transport 产品实现。若现有 frozen transport 不够表达原 scope，应先报告真实额外点，不擅自扩写。原 fixture 缺字段不能自动当作公开授权；需要按真实消费者补声明并保有效旧断言。

投影 scope 边界明确为：canonical group 必须 groupId 非空且 accountId=null；legacy account 必须 accountId 非空且 groupId=null；两者皆 null 为官方只读。异常或两者同时非空禁止编辑/写入，不静默降级到另一种 scope，不据缺失字段扩权。buildSkillItems 以真实公开响应解析为准；旧缺 groupId 仅归一 null。editableFields 缺失按空许可处理，原手造组件 fixture 补真实字段声明并保留合法旧断言，不能在生产路径默认全可编辑。scope 实例和冻结 transport 依据以上种类及真实 ID，不依赖业务名推断。

完整验收：

1. fresh 空组 A 的公开目录须真实 groupId=A/accountId=null、official/base 不变、无 overlay/revision。真实设置→技能编辑中性 system 并保存；旧 UI 若在 disabled 阻断，保实际截图、trace 和 0 次 PUT，不后台补写。
2. 修后同 UI 首写 expectedRevision=null→公共同组读回 revision=1→刷新相同值，再 UI 修改 revision=1→revision=2、历史追加。正文、模板、工具及 schema 不因定制凭空改动。
3. 空组 B 读同 global skillId 合法返回 B 的官方基座和无覆盖，不能错误期望 404。A 创建的真实 versionId 在 B rollback 按正式接口拒绝，A/B 当前值与历史不变。
4. 两个真实页面在同组同 revision 编辑，首页面 UI 保存成功，另一页面旧 revision 通过 UI 保存出现真实 CAS 冲突并保草稿，公开当前值/历史只增加成功一次。
5. A 未保存草稿切 B、延迟真实 RSC 和已发原组回执，核新旧实际 scope/header、禁写窗口、在途原组合法完成和晚回执不落 B；不伪造成功响应、不取消合法后台任务。
6. 无 scope 官方只读、未允许的字段不可编辑且 patch 不含这些键、tools/schema 只读。官方目录若没有所需字段组合，以严格组件契约夹具另证，不能称为真实官方浏览器族。
7. 归档后旧目录不得成功写；legacy account-only 定制和 CAS 不回归，真实跨用户负族沿既有服务证据核验。所有原 overlay/version/effective snapshot 保留。

使用已加载 oil-ui-pro 0.10.0 与账号组 UI_RULES，修状态归属和控件真实可用性，沿用 tokens、SectionCard、textarea、Button、徽章和当前密度，不重新探索视觉风格。RED 留桌面/390px当前真实基线；GREEN 同状态与视口看图、操作走查，错误保输入与位置。单 Next/fresh DB/media/auth、worker1/retry0；所有有限执行/请求/观察至少120秒并保原更长预算，原任务与版本不另建重发。触及切组/晚回写路径运行 LED-047 聚焦回归；必需类型、契约/组件、边界和真实公共链证据在收尾按实际结果登记。

```mermaid
flowchart LR
 A[选择账号组 A] --> B[真实界面修改并保存 Skill]
 B --> C[同组公开读回和刷新]
 C --> D[切组 B 不带入 A 草稿]
 D --> E[拒绝 A 历史版本在 B 写入]
```

## 3924真实目标RED后正式实施（2026-10-11）

3924唯一自然运行实际exit1，系统提示输入框在合法空组投影下连续120000ms仍disabled；前置已实际完成首页真切组、四镜像、公开目录groupId=A/accountId=null/system可编辑、overlay/revision为空、0次PUT与桌面/390实图。74声明源/HEAD前后相同、自然清理无监听。原3922菜单前置FAIL和03ec静态漂移不冒充该RED，全部保留。

修订候选原独评范围PASS（scope-independent-review.md）据此由root正式绑定：三现产品 `skills-data.ts`、`skills-section.tsx`、`settings-interactive-region.tsx`；两原组件test `skills-data.test.ts`、`skills-section.test.tsx`；现新E2E `group-skill-customization.spec.ts` 与本任务docs。原首写enabled断言保留，新增完整公共保存/读回/刷新/CAS/跨组版本/真实延迟族，不能改成只PASS一个enabled。三产品职责及七族沿本SPEC，不增加后端/契约/transport/model/真实密钥写点，不放宽任何归属。Dialog T1237四响应式class和原4283完整settings E2E保持。

先同两组件test取得当场有效合同RED，再修产品并GREEN；原组件断言不减，旧手造fixture只补真实canonical/legacy权限字段，不默认missing可编辑。各scope/字段/代际/ABA/晚回执真实族和LED047需明确实际证据。公共GREEN仅在独评准入、最终全树类型/源码冻结后单Next/fresh库/worker1/retry0，端口及新目录由root正式绑定，不自动重复运行。

## 3928/3929实际通过后的按钮成功路径补验（2026-10-11）

3928四条公共旅程和3929原设置七例均自然exit0；其原图、源码和全部旧失败保持。当前公共证据尚未点击成功历史回滚和恢复默认，按用户全功能验证范围补验，不能先把按钮可见说成已验成功。精确候选见 `docs/verification/t1234/ui-rollback-default-diagnosis-and-candidate.md`（affc452439007f8bba7e0519e1fddcb06863923fecd6051a5ac837b577914aab），独立窄准入见 `ui-rollback-default-scope-review.md`。

只向既有新E2E文件末尾追加一个独立成功case；原830e源码完整前缀、四例标题/断言/helper逐字保持，产品/单元/契约/shared配置不变。真实fresh组A，通过UI首写r1、再写r2、选择真实V1回滚新增r3、恢复仅允许的system/template新增r4、公开读回和reload；精确3PUT+1rollback。rowRevision3的overlayVersion保V1原值；r4 overlay={}而非null、effective=official且四条真实历史保留。不夹入另提的专属冲突负例、policy恢复或改变官方内容。

新增所有response waiter即时settled并在finally有限等待同一promise；失败真实抛原原因、不点击重发。就绪以真实可编辑输入、正确目标值、保存标签与disabled及公开revision/history联合确认，不用延时猜React提交。正文与历史若无法同屏，分别真实滚动截图并由同组/Skill/revision机械附件关联，不要求改布局、不以图外内容代签。新case全串行helper AST预算覆盖两分钟内层与清理。root冻结最终类型/独评后只跑新增case单Next3930/fresh根/worker1/retry0，原四例已验证相同前缀不无故重复；如出现新失败保trace并另行定因，不自动跑第二轮。
