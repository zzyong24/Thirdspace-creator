# T-957 文字 AI 真实验收

修复候选 `4b04c1bd`。真实任务来源为已安装 CreatorOS 的公开 CLI，账号 `acct-ae1a8346-9`；不读取真实业务数据库、不自动采纳候选。

## 截图根因

项目 `project-9cd24147-100` 有真实播放/留存指标，逐字稿未就绪；聊天复盘却硬性要求稿件，和后台指标复盘不一致。上下文准备失败被错误封装成未知调用，原任务 `ai-task-5ae29617-6543-4936-8959-bb6532910bae`、`ai-task-8df17dc6-b31c-400b-be21-9dce8816f261` 保留，不伪造成功、不自动重新提交。

修复两入口共享真实证据判断（稿/指标/评论任一有效，零有效，待采状态不是证据），无稿不得点评具体台词；script.review仍要求稿件。未知执行状态由服务端转换稳定错误码，错误气泡不再暗示新建重试。

## 已运行校验

后端相关 238 项回归通过，主树新增入口/reader 12 项通过；前端交互及流式状态 50 项通过，frontend tsc通过。构建前 42 项打包检查通过。后端全包类型仍有既有错误，不宣称全局通过。

## 真实功能矩阵

| 功能 | 原任务/实际证据 | 状态 |
|---|---|---|
| 编导对话与稿件诊断 | `ai-task-9cd24147-10954`，会话 `ai-conv-9cd24147-10950`；读 current output_script v2 879字，经 context_artifacts/artifact_text及calibration_diagnose，回复已读回 | 功能跑通；质量不合格：将指标与具体段落错误作因果归因 |
| 原截图项目复盘 | `ai-task-c7dc03ce-67` succeeded；会话 `ai-conv-c7dc03ce-54`，artifacts仍为空，review_analyze返回真实数据复盘及items=[] | 功能跑通；质量未通过（比例误算、单变量实验实为多变量） |
| 选题候选 | `ai-task-c7dc03ce-75` succeeded；会话 `ai-conv-c7dc03ce-71`，topic_generate返回流量/信任/获客3类候选 | 功能跑通；未采纳，标题中待核实数字须修正后使用 |
| 改写候选 | `ai-task-c7dc03ce-83` succeeded，但script_patch两次error，无可应用候选，只在正文给建议 | 不通过；旧稿sections=[]，模型虚构full引用，安全校验正确拦截；继续修复兼容 |
| 生图、语音、视频生成 | 不属于本次文字入口验收 | 未测 |

安装前完整备份 `~/.creatoros/backups/t957-20260912/app-data`：1807个数据库文件SHA-256比对一致。

## 本地包

已从干净候选 `4b04c1bd` 构建并安装 `/Applications/CreatorOS.app`，PID69785，CLI自动full访问。DMG `/Users/zyongzhu/Downloads/CreatorOS-1.1.0.dmg` SHA-256 `6345e9a78ac0f71c1e77004d87693466bbc32446c53e916ea25cb85b70377f13`，hdiutil verify VALID、codesign deep strict通过，本地ad-hoc未公证。安装二进制SHA-256 `1d560a13681ef2a0beed5540885252534f631c78c2f5992c1fcb1ea84c2f82de`。

主稿仍为 `artifactversion-185382ce-678`，没有采纳候选或覆盖稿件。全局reconcile仍为既有233 errors，不宣称全绿。


## 2026-09-12 旧稿兼容安装复测

候选 `9901cf2f` 已安装启动（PID86401，CLI full）。独立实现评审 PASS；6文件264测试通过，主树11项公共链回归通过；frontend/ai-worker类型检查通过，backend仍14条既有测试错误。边界扫描仍7条，包含此前已存在的live-chat-session两条超基线；没有宣称全局通过。

支持三种旧正文存储，以真实版本/hash/唯一原文构造局部候选，采纳时严格版本和CAS保护；隔离测试覆盖公共采纳、重读、撤销、并发覆盖与归属拒绝。真实用户稿未采纳，读回仍 `artifactversion-185382ce-678`。

42项打包检查通过，DMG和签名校验通过。本地ad-hoc未公证，DMG `/Users/zyongzhu/Downloads/CreatorOS-1.1.0.dmg` SHA-256 `1cdc1f91905932feecfc84953d919ec313abed6911528fc05ebeb74aa265de6e`；安装二进制SHA-256 `495ff5d28f296d7a0f0c4cb7609d57c2ce6ff69876056594db97c5b42ecd60f1`。安装前备份 `~/.creatoros/backups/t957-legacy-20260912/app-data`，1808个数据库文件逐一hash一致。

真实复测会话 `ai-conv-24509a92-48`，任务 `ai-task-24509a92-64`，执行 `execution-task-24509a92-65`：已提交后反复进入retry_wait，公开错误为“供应商明确拒绝，等待重试时间到达”，暂未返回助手候选。没有另建任务或更换幂等键。不得记旧稿安装版真实模型验收PASS。

同时启动日志记录 `CLIENT_CONFIG_ACCESS_CHANGED`（startup/bootstrap配置同步被阻止）；代码将授权绑定不匹配或渠道不可用映射为此码。尚无证据证明它就是本次模型拒绝原因，不把两者直接作因果关联，也未重置激活或修改凭据。原截图两个unknown任务继续保留。T-957待同一真实任务结果或服务侧拒绝原因确认后再验收；T-954仍承担已记录的内容质量失败样本。
