# 新包本地性能与手工操作事实

包源码 `7790be04ca16b65a8161c06c5943ba607e8ecd4d`；新隔离候选64455，owned组 `grp-6215d1e4-6` / 项目 `project-6215d1e4-9`。这不是T1300或T1316整任务PASS。

## 实测样本

计时为同document `performance.now()` 的真实Tab click→页面内容存在、指定控件可见且通过命中可操作检查；普通content仅核布局/viewport相交，不是严格整页TTI。首访指独立新browser context首次访问目标，可能已有浏览器预取，不是冷OS/冷服务/冷网络。每面只有一个有效样本，无同条件旧包基线，不报p95或加速百分比。

| 工作面 | 各context首访（ms） | 同page已访问切换（ms） | 有效readiness |
|---|---:|---:|---|
| 脚本 | 217.7 | 89.6 | 真实可见分镜正文textarea |
| 文章 | 321.7 | 193.9 | NoteRelay正文存在+copy控件可用，不点击交付 |
| 图文 | 331.1 | 174.4 | NoteRelay当前卡正文存在+真实loaded导出控件可用，不导出 |
| 制作视频 | 622.6 | 68.2 | 原native容器内容+精确保存工程按钮enabled/命中 |
| 复盘 | 189.9 | 115.3 | 首屏账号组筛选内容+真实平台账号combobox可用，不改筛选 |

前3项首访来自tabs-v2的独立有效单样本，整轮曾中断；后2项来自tabs-v4补验。tabs-v4自然3PASS/11.132295041秒，含完整暖访case+两首访补验。暖访原视频host节点引用相同且connected，不冒光标/播放/dirty全状态保留。文章和图文实际更多导出展开/关闭及原生滚动成功，不开正文精调。

原production 587.6ms为“原容器+任意header控件”样本，可能被更多菜单满足，不能当loaded/保存ready；原JSON不修改，另以622.6ms精确save-ready补验。

## 手工对象和操作

所有对象通过原公开manual接口创建，脚本非空、文章12节、图文手工正文与1张文字卡，0上传/0AI候选来源。Tab测量时native为空黑底工程；随后通过原UI添加默认文字保存revision1，成为5秒黑底文字场景，mediaRefs=[]。没有真实媒体解码/ASR或AI性能结论。新owned实际公开最终AI任务0、execution任务0、会话0；其它旧根原长任务没有取消，未在该时刻穷尽其它进程负载，不称全系统空闲。

- operations-v2脚本：真实Mac全文尾selectionStart=selectionEnd=60后键入，Meta+Z实际撤回；公开原currentVersionId保持artifactversion-6215d1e4-48，全2版本（原空初版+手工版），用户autosaveEnabled=true保原，未新增脚本持久版本。
- operations-v2播放：原native播放时间码00:00:00:00→00:00:02:22并暂停；新增第二文字片段与dirty成立。只是本地文字场景，不是HTML video解码。
- native-v3自然1PASS/4.857545584秒：实读Mac平台并确认深焦点在原native根，Meta+Z→1片段、Meta+Shift+Z→2片段，保存revision1→2；再原Undo恢复1片段并保存revision3。完整before/saved/restored plan和全部版本均在native-local-result.json，最终elements与baseline相等；整个document含revision/时间等字段不宣称字节相等。Undo/Redo观测上界26.3/32.4ms含自动化开销，不混入Tab数字。

## 原失败、口径纠正与证据边界

1. setup最初把Node Response.ok当函数，组创建已发生后报错；原STARTED与失败保留，只读唯一组回读恢复，未重发创建。
2. native文字准备首轮has locator重复套native根，0匹配/原5秒默认expect失败；后按真实DOM修正，新增文字和保存是真实发生，不能据首轮失败声称全流程0写。
3. tabs-v1选择隐藏rich editor，实际手工稿有sections默认结构视图；测试PGID9915精确SIGINT，原exit-2保留。tabs-v2完成四冷样本后，复盘content在首屏外，PG10561中断；tabs-v3暖up至复盘仍用首屏外grid，PG11070中断。三轮均不是产品性能失败；不能将它们整case签PASS。
4. stop-reason里“page未传filter”的早期源码推断已由真实DOM推翻：filter实际存在，主要错误为analytics-grid在首viewport下方；本文和校正JSON保留该事实。
5. operations-v1实际在textarea开头插入，原期望全文尾而FAIL/124.641657125秒。catch截图后context关闭，未当场Undo；后公开全版本证明未持久化变更，不冒UI恢复/0写。operations-v2以真实selection确认修正；script/播放/加字通过，但Control+Z不是当前Mac原生快捷键，整caseFAIL/127.804627208秒。现有native解析器在Mac取metaKey，native-v3只补必要原生依赖，不重复脚本/播放。
6. tabs-v2/v3/v4 BEFORE_RUN_INPUTS仅当时thin文件hash/bytes记录，未包含metrics/register，亦未保完整原字节副本；不能称完整事前快照。POST_RUN_DEPENDENCY_BINDING是事后将当前两依赖和已提交77c70a50 blob逐项相等对照，不追写旧快照。native-v3已在运行前保存全部thin和两依赖字节副本+SHA。
7. 早轮network只保last-safe-network，成功context close均真实断言denied=[]，完整逐context原记录缺限保留。native-v3起逐context安全network独立保存，实际denied=[]；被拦截请求会使case失败，不能用拦截隐藏自动AI请求。

## 未执行

普通聊天首字、SSE、AI完成性能及新包所有真实供应商模型复验未执行。T1321自动审批在CreateProcess前拒绝，原POST0/model0，任务保持blocked等待真人授权；本报告不把它记产品诊断失败或已定因。原U14/cover/card UNKNOWN均不追定因，不重发。
