# 自主研究3个真实Worker回归的传输驱动候选（未应用）

原 `agentic-research-worker.integration.test.ts` 3个输入保：maxCalls20/10/8，预期请求6/5/4、succeeded/partial/partial，非法来源引用后自修复、首尾正文分窗、同原证据、秘密隔离、待采纳→重复采纳只1真实知识条目。当前三项均在extractToolData第41行 `JSON.parse(row.content)` 失败，实际 `Unexpected token '本', "[本次传输仅显示结果首..."`。相关完整46为43P3F，日志backend-chat-current-contract-ports-worker.log。未改该文件或任何生产逻辑。

操作者已有研究目标与原来源，需要完整阅读的真实证据候选，再由本人采纳入知识库。恢复必须原任务/原来源/快照继续读，不因传输缩减重做写入、猜全文或跳过非法来源反例。

## 精确旧与当前形状及来源

- HTTP SDK的role=tool.content仍string，未发现类型变更；不是SDK升级将字符串改对象。
- 原Pi `pi-engine.ts:255–260` 将 `{summary,evidence:actualOutcome}` 序列化成JSON文字，details仅宿主诊断不进供应商。
- `execution-research-evidence.service.ts:29–34` 的12000窗正文同时在outcome.evidence[0].text与outcome.data.text出现，整段text超过24000字符。
- 后续547504f132729d1c8b956caf381f8b1b62c44ff9/T923 `2026-09-08-continuous-agent-execution.md:43` 已确认完整工具回合的确定性传输缩减、原始目标和完整账本保留，不是模型摘要。实际 `continuation.ts:16–17` 对>24000字符的text输出前16000+明确片段标记+后8000；`durable-pi-stream.ts:90` 只在continuousContext进行该模型投影。模型收到此明确文字不承诺合法JSON，全账本不因此损坏。
- 旧fixture假设所有role=tool.content都是完整JSON，故在解析观察时失败。不能用移除JSON断言、捕获异常默认成功、改生产传输或读DB隐式补给模拟模型绕过。

## 最小测试驱动候选与边界

仅此existing integration测试/必要其已有fixture，待主控及独立精确评审授权。完整content继续JSON.parse并用当前actualOutcome schema核验。明确片段态另按真实模型可见文字处理：只提取在模型传输中完整出现的受控证据小对象与尾部offset/nextOffset/snapshot身份等字段，字段必须来自原可见内容并验证原来源，不将拼省略段声称完整回执或全文。解析不了必要身份就fixture明确失败；不catch为空结果成功。不得使用DB或宿主details决定模拟模型下一次输入。

真实DB/完整call回执只在最终验收侧读回：按已有完整schema核原operation、来源hash与owner，证实正文首尾窗口连续、全部源文本和原引用一致；保原预算、请求数、guard/非法来源自修复、cookie不泄漏、原知识采纳幂等。模拟模型能不能可靠得到原nextOffset及所需证据字段需先具体核对真实投影，字段若已被省略且不可恢复则应记录产品能力缺口，不能测试伪补。

必要反例：完整JSON损坏仍失败；无明确片段marker的任意文字失败；缺/错误证据身份或offset失败；片段不能宣称读全；原完整账本无丢失及0重复导航/写入。新增driver自身正控制需证明解析的值来自实际供应商请求，不是静态预期/副本。若要改变原请求数或maxCalls部分结果语义须先明确批准依据，不直接改成GREEN。

当前仅候选，未实施、无production响应修复或新的PASS。

## 精确driver算法与仍保完整JSON的范围

本fixture实际page属性次序由execution-research-evidence.service.ts:31–34与agenticToolOutcomeSchema控制。候选不使用JSON容错解析器，不补省略正文：

1. 先严格解析HTTP请求完整JSON并验证messages的role/content类型，仅取最后一条真实tool.content作当轮模型观察（旧回合仍作为原上下文存在，不反复当最新观察）。普通content以完整JSON.parse+现agenticToolOutcomeSchema验证，必须得到合法web.read完整data；无marker时任意残缺/普通文字直接拒绝。
2. 片段只认精确固定前缀 `[本次传输仅显示结果首尾片段，完整回执保留；需要证据请继续读取原来源。]\n`、唯一精确中间marker `\n[…中间省略…]\n`，去掉marker后head.length=16000、tail.length=8000。短头/短尾、多marker、不同前缀均拒绝，不能宽松replace。
3. head必须是Pi实际包装的JSON起始：summary为完整合法JSON string，evidence.status为ok/partial、evidence.summary完整string；之后的evidence.evidence数组使用识别JSON字符串/转义的括号扫描找到真正闭合位置，完整原数组单独JSON.parse，再用现schema的evidence子schema验证。不在任意正文中搜索相似键名。此数组第一项（本fixture只1项）的text完整12000字、entityId、version、sourceUrl、title均在16000头内，不从尾部拼回它。
4. 数组结束后head必须精确进入 `,"data":{`。只取在head中完整存在的evidenceRef、snapshotId、sourceUrl、title四个合法JSON string值（按现服务已明确次序），下一键必须是text。独立小对象严格schema验证，并与完整evidence项entityId/version/sourceUrl/title逐项相等；无字段、字段未完整闭合、其它顺序/畸形JSON、不一致均拒绝。不会把data.text的部分内容当完整data解析。
5. tail终端必须精确包含当前服务的完整offset/nextOffset/totalLength/truncated四个数值/布尔字段，接合法error:null、continuation（null或包含evidenceRef/nextOffset/totalChars的严格小对象）、sideEffect:none及两层对象闭合。这些完整末尾字段独立JSON.parse+严格schema；下一位置、truncated与continuation和值域一致，且continuation.evidenceRef与真实头部身份相等。不能从任意残留正文的相似字段提取。只允许此次已明确读回执shape，不泛化到所有工具。
6. 模拟模型当轮仅得到明确model-visible observation：head里的完整第一证据text与已验证元字段；mode=fragment/full单列，fragment不伪装完整JSON回执。firstWindow.text依旧为真正完整首12000证据数组正文；nextWindow来自原第二个短窗口的完整JSON/schema，offset必须等于前nextOffset、snapshotId/evidenceRef同原，nextOffset=null且含原尾窗。原snapshot.fullText===firstWindow.text+nextWindow.text不删。原下一次web.read/knowledge.write均仍根据模型请求里真实可见身份产生，不读取DB、details或trace补值。
7. 仍保6/5/4请求数、20/10/8预算与succeeded/partial期望、完整settled账本/原operation、0重复导航/采纳、非法evidenceRefs自修复与隐私断言。片段driver正控制使用真正收到的raw请求；另合成纯负例改变marker长度/身份/元字段/闭合符及无marker损坏JSON，必须显式拒绝，不调用模型/工具来绕失败。

写集仅当前existing integration测试（可在同文件放typed纯driver辅助）与报告/本轮日志。现Worker fixture网页正文/生产窗口/工具schema/预算不变。实际投影若不满足这些完整字段前提，保FAIL并报告确切缺字段；不调整driver从DB取得它们。


## 后续授权与实际应用状态（2026-10-09）

前文是未应用时的候选，保留原RED及算法。主控后来明确授权仅现integration test内typed严格observer，已应用，无生产或工具协议变化。实际原供应商请求首窗mode=fragment、完整可见12k evidence，后短窗mode=full/同evidenceRef/snapshotId/连续offset通过；因此不是从账本补给模型。18新增正负控制通过，原3业务场景继续FAIL于后续正常账号父组缺失和continuous默认预算装配差异。RESEARCH_CURRENT_FIXTURE_RECOVERY_PROPOSAL.md另列准确2处候选，未因observer修复直接改原partial期望。完整新结果见RESEARCH_VISIBLE_OBSERVER_RESULT.md，旧3JSON.parse及首完整并行hook失败日志保持。
