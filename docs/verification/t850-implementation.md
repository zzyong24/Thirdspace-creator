# T850 实施与当场验证

## 2026-10-02 原文件转写接入

- 正常迁移根模块公共转写链[1项通过](../research/evidence/t850/asr-formal-shared.log)：真实ffmpeg视频、原Source探针/采纳、精确对象文件SHA、抽音、原Worker、全文get/adopt。供应商为显式夹具，不是真实模型成功证据。
- 原片转写面板接原transcripts.create/get/adopt，折叠按需加载、手工剪辑继续可达、创建/采纳未知回复保留原完整body和请求号。[界面9项通过](../research/evidence/t850/transcript-ui-tests-final.log)，[前端类型退出0](../research/evidence/t850/transcript-ui-types-final.log)。首轮3项失败由测试夹具共享source被修改及缺providerEvidence引起，修夹具后重跑；不计前置TDD产品红测。
- 原AI探针列表遇坏generation不编造0，控制命令仍严格拒绝；[10项回归通过](../research/evidence/t850/probe-corrupt-read-null-final.log)。
- 目前转写仅全文；真实词句定位、删选区、模型删留候选、旧工程转换和叠加精确文件绑定仍待整合验收，不标完整交付。

- 原公共根真实本地MP4[1项通过](../research/evidence/t850/public-root-source-bytes-green.log)：原probe→capture旧稿转换→坏字节拒绝零保存→恢复原字节正式采用→原历史回执重放。首次[全局操作漏注册](../research/evidence/t850/public-root-conversion-registry-red.log)及[错误使用图片限定bool](../research/evidence/t850/public-root-conversion-image-guard-fail.log)当场失败后修复；这是合并回归，未补录为之前TDD。测试只重定向本地目录到/tmp，原Settings同tx、实际文件和探针未替换。

## 2026-10-02 原请求恢复与跨作品切换补验

旧方案转换新增三个明确选择；转换前只生成候选与警告，采纳才写原工程新版本。scope立即重挂载和晚回复隔离两项有真实红测；明确冲突重新选择先核原采纳回执，未知采纳回复不自动新建请求，两文件 **8 PASS**。真实旧稿 HTTP／UI旅程尚待测试。

实际 ASR 原任务在公开原执行状态中为 `unknown_result / CALL_RESULT_UNKNOWN`，截图 `docs/research/evidence/t850/asr-original-unknown-result.png`；没有供应商账本细项，不能声称未调用或已识别成功。最窄原控制类映射修复独立复审通过，共享34 PASS；补充兼容测试待重跑。广 worker 测试命令误将全部套件运行，留下4文件6 FAIL，证据 `worker-broad-run-fail.log`，并非全绿。build exit0仅确认构建，未确认真机或真实 ASR timing。

### 旧黑盒方案真实浏览器迁移与播放

正式 API 新建验收 output `output-1ea3f367-56`，以当前真实项目原片保存旧 v1，浏览器核对原片探针→转换候选→用户动作采纳，保存版本 2。公共 API 重读版本 1 与新 legacySnapshot 严格相等，旧扩展/场景/真实 asset/file/SHA 保留。原提交 body 经 v1 owner 正常化，不能拿未正常化输入冒 savedPlan 精确相等；实际读回证据 `legacy-conversion-real-readback.json`。

点击真实预览播放曾受 iframe 音频 policy 拦截，失败截图保留 `legacy-preview-permission-fail.png`。修复预览 iframe 音频委托（隔离 sandbox 不变）与真实 iframe 内用户手势恢复按钮后，实际父播放按钮转“暂停”、成片时钟从 0 到 0.154；定位 0.757 秒实际红色源画面显示，截图 `legacy-conversion-real-preview-green.png` / `legacy-conversion-workspace-expanded.png`。仅证明浏览器播放与同源画面，未称人工听音通过。原独立 Worker ASR 错误兼容最终真实原树 37 PASS。视频成片生成已发原 video.render 一次，结果仍待核验，非导出 PASS。

### 2026-10-02 粗剪公共候选与实际成片读回

独立审两项阻断（最终原调用sequence、模型选区泄漏）修复后合入27文件；共享树重新构建原worker成功，正常DB/真实ffmpeg原片→Skill→原worker→本地SSE供应商夹具→原结算同TX冻结→GET/明确rebind采用，2文件10项通过。供应商仍是明确本地夹具，不记真实模型成功。前两次root测试因用户中断只留下RUN，不能记通过。

浏览器旧v1真实转换保存版本2，点击生成一次，原video.render返回final.mp4真实候选。浏览器原生控件播放至结束、再次空格播放时paused=false；通过原采纳按钮入素材库，原AI采用result与active Asset读回。经精确file公共签名下载返回41522字节，ffprobe确认1.5秒、H264 1920×1080/30fps、AAC 48kHz双声道均1.5秒。保留实际低码率警告和未配置视觉模型的skipped，不伪称视觉审核或听觉验证。首次urllib访问受本地代理502影响；直接loopback无代理读回成功，不重生成原render任务。

新粗剪候选面板尚未接入页面，先落可运行静态折叠组件并实际3项缺控件红，再实现明确片段/文字UTF16/真实tokens、逐条删除选择、原receipt/CAS恢复及显式当前触点rebind。首次1项失败是生成fixture对不存在预约返回了其他请求ID，已纠正；完整UI及独立复审继续，未计完整粗剪Gate。


## 2026-10-02 本轮真实跨片段播放与编辑（仍在实施）

真实原界面完成手工字幕保存：`output-4061fc0b-189` 制作版本 2→3，两段共 1.5 秒，原片与原转写不改。900×600 无页面横向溢出，顶栏导入／备料／预览／成片操作可达；[保存后页面](../research/evidence/t850/rough-real-subtitle-version3-900.jpg)。真实播放在0.75秒交界停下、提示素材准备失败，媒体实际 readyState=4、error=null；并非字节坏。桥接原仅等 loadeddata，已有媒体 seek 后的 canplay/seeked 不能唤醒。新增真实事件回归先1 FAIL，再同时监听真实就绪事件并核安装竞态，复跑原剪辑/工作台共53 PASS；真实页面再播走到1.50/1.50秒且无错误，[完整播放证据](../research/evidence/t850/rough-real-playback-complete-version3-1440.jpg)。未声称听音校验。

材料空位置的合法1.000001秒曾因浮点乘法被拒：1 FAIL→十进制BigInt精确转换、parent传真实整数endUs→3 PASS，独立原例1 PASS。按词句剪切只使用已保存真实token及用户明确片段实例，原公共apply/CAS/双前值摘要；组件2 PASS、父层真实接口接线先1 FAIL，修后35 PASS。独立父层另验证Unicode、ACK丢失恢复、digest待回时卸载零写与重复原片定位13 PASS。未把原始全文或用户字幕当词句时间码。

字幕／六类卡片／插入视频/场景直接编辑唯一v2稿面；素材文件在原作品组合精确采用入口处理。新增字幕与文字卡片使用用户文本及位置，不猜转写。初始fixture缺重点词text是夹具错误，另保真正缺控件3 FAIL；实现后发现删除草稿emphasis但Object.assign保留旧字段造成1 FAIL/2 PASS，修正只删除明确失效字段；组件及微秒/词剪8 PASS。父层接口未接先1 FAIL；两个同revision React key导致4 FAIL/38 PASS，改为各面独立key，含旧工作台/旧稿共80 PASS。当前实际代码与接线已测，未冒称真供应商或整个任务完成。

Video21 精确合入后原5文件32 PASS；独立冻包14 PASS。原实际server roots尚待最后装配验收。Precision21 按DEC-T850-07精确合入；完整native PCM帧/样本证据、旧预约无漂移及精度探针失败回原全文已独立15 PASS，author原新38 PASS；供应商响应仍是明确夹具。新UI精度入口与正式roots/实际供应商仍分别待验。
