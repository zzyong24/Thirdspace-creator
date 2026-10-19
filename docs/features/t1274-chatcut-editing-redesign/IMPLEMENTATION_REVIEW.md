# T1274独立实现审查记录

同模型隔离只读审查由chatcut_modules、editing_current、spec_review执行，主会话负责修正。以下是当场代码问题与回归边界，不是完整发布PASS，也不补签正式reviewctl回执。

| 当场发现 | 窄修 | 已有/仍缺证据 |
|---|---|---|
| 空native_elements scope导出0轨，与旧整scene语义不一致 | 空scope按整scene读 | 只读探针已确认导出2轨 |
| 冻结v1/v2从当前writing context重新推版本；adapter仍默认新prefix | 协议从原冻结prefix选；resolve与adapter复核schema/description/hash同opts | frozen-compat-green真实4PASS，含host返回version和execute |
| 未改未知type在保护skip前拒绝，输出schema同样拒绝 | 原轨同ID完整原样才绕过重建；输出允许原JSON投影，输入保持strict | native-protection真RED→3PASS；完整当前公共链仍待最新库复验 |
| 错误-only/no-change仍报待采纳成功 | error/failureCode有实值；正常noop无apply，摘要明确未产生改动 | 早公共链通过，末轮纯引擎24/definition12PASS；公共3例SKIP |
| 安全保原错误压成warning，丢结构化行/hint | keptErrors与阻止该轨的errors分开，partial继续但完整诊断保留 | 末轮引擎24PASS |
| 原可选媒体不可读阻断整个read/propose/apply | 只对实际新增或改变媒体重读，非修改/删除保留原引用 | 新公共fixture已加入；最后beforeAll120秒超时，未PASS |
| panel刷新丢原requestId/候选，错误锁定未发送请求；digest误比tracks | 持久base/draft/candidate/ID/pendingMode，完整scene digest；可信零发送冲突解除pending；未知保留 | panel4PASS |
| 预览后换选区可采用旧稿 | native采纳发写请求前复核当前target/scene/epoch/转录选区；原已保存回执不重做采纳 | 原工作区guard测试及手工draft18PASS；真实UI仍缺 |
| 同实例编导隐藏时原测试要求卸载 | 固定portal容器停靠，收回再dispose；隐藏/inert保唯一input | stage/surface/workbench40PASS |
| onStateChange未解构、词定位text分支无tokens | 显式解构、granularity判别守卫 | 前者已独立确认修正；后者完整类型重跑待结束 |

实际页面前后截图、独立视觉评审和独立任务走查未发生；两次隔离服务冷编译超时的原日志保留。不能用静态空布局图、JSDOM或mock Blob证明GPU/MP4/模型效果。未向他任务发消息、未换安装包、未调用付费模型或真实ASR。

## 2026-10-14公共旅程准备独立审查

spec_review只读核对当场源码与双份bundle，找到：

- published native.js SHA256 `ccb79c5133316320ce128c1efebc67240154bf57050836180db0ed596e917ca9`的operate分派没有preview-scene，宿主调用落入“此编辑操作尚不支持”。需要从原生源码补齐隔离候选渲染，不修改活动工程、不以mock Blob代签。
- draft-chat-request.tsx采纳后的generation保护把本次apply-tracks自身引发的documentChanged当作并发，可能将adopted改成saved-not-synced。须证明本次已同步结果，继续保留真正并发编辑/dirty/卸载保护。
- E2E导出后需用实际exportSaved工程作为刷新基线；导出冻结保存合法递增revision，不能要求等于导出前全对象。须另断言timeline/source不变。

未运行测试或签UI/MP4 PASS。主会话实际资源释放后公共3PASS，原隔离服务首页200、旅程已开始；后续红绿和实际媒体结果另记。

采纳generation窄修：两个组件/port seam当场RED2失败27PASS→GREEN29PASS（frontend-native-adoption-red/green.txt）。可信native port只在读回前后generation稳定、alive、dirty=false、场景与完整tracks相等时返回内部syncedGeneration；wrapper保端口/作品/dirty检查，仅同stamp放行自身同步事件并剥离stamp。spec_review独立只读复核无具体新增放行风险，不代签UI或媒体PASS。

中心投影增量独评发现并处置：只遮原画面仍允许时间轴Space重启原声，新增宿主用户播放时调用既有context pausePlayback、原生projection active时锁核心控制及shortcut；渲染预览本身继续不暂停/更改Core。隐藏旧header使原rename入口真丢失，须恢复原EditableProjectName compact工程名称栏，保旧rename/dirty/保存断言；并非换过期locator或删原回归。当前45个组件测试已通过，但原生两项补齐仍在构建，真实播放/重命名/最终UI未验。

音视频实物复核：旧83b同candidate AAC与新candidate PCM字节严格相等；source视频48帧配对旧全正确，新8个源帧重复，独立定位至私有冷VideoCache预取未完成与double尾界重叠。接下来只私有export精确模式处理，不改默认interactive快路径或加epsilon，必要重建/实际帧回归待完成。原整体baseline FAIL与原容器断言FAIL均保留。
