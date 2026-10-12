# 设置历史诊断工具独立源码评审

只读评审准入通过；未运行工具，未签原两项settings用例或返回行为通过。候选产品533224f334c43cdb81a344424e420cad93784dd1；最终工具/tmp/t1246-settings-history-diagnosis.cjs，SHA256 **c37517e4cf8ba8129cc39e6e18f0f23ff08f0f8f8a325c4402204b3b24f508c8**。本次独立node --check实际exit0，只做语法解析，不启动Next/浏览器/模型。

## 保留旧候选发现

- 275a3e78...：初稿来源，未执行；后续a458a911...独立审发现原生fetch Response.ok被作为函数调用，TypeError被readiness catch吞入观察，导致300秒后固定启动失败。
- 1b266a1d...：已改resp.ok布尔并await resp.text，前一启动阻断关闭；仍有stop boolean使outer异步清理与finally等待不一致，结果可能先于server退出；result.after只在主体成功末尾，失败族缺后SHA。两点已反馈root，未执行。
- c37517e4...：共享stopPromise，outer/finally等待同一次清理；最终finally清理后无论主体失败独立verify并保after/afterError。三项发现均已按实际最终源码关闭。

## 真实消费者核对

1. fresh证据目录拒绝复用；os.tmpdir()的creatoros-playwright-* fresh数据、media、auth、cache、backups路径；数据库/proxy/desktop/standalone污染env被覆盖或删除。253源文件存在且按原SHA核验、11Worker原SHA前后核验；HEAD固定。未修改产品/原case/首轮结果，未重建Worker，诊断本身没有生成/发布/账户登录动作。
2. 61348先net bind拒绝已占；真实readiness后lsof监听PID+ps父链必须属于owned launcher，才进行浏览器动作。启动使用已经独评的start-isolated-next真实loadConfig/独立.next目录消费者，launcher SHA256 **066c8ca0cf46e88ab2a8eb1e0a28c4b50e1b39479db445adef91dd905bada0e5**。不复用其它Next。
3. 两个独立context分别真实/accounts→侧栏设置→关闭、直接/settings→关闭；真实点击外观与dialog-close。截图、trace、history/events写本轮独立目录。没有route.fulfill、结果伪造、SQL写入或设置手动采纳。观察失败保存expectedReturnObserved=false，不用任意非空body作为原页面验收。
4. history pushState/replaceState/back/forward/go包装调用Reflect.apply(original,this,args)，保原参数、this、返回值/异常，不阻断/修改调用；记录当前URL、length、state keys名称、__NA布尔、idx数值与go delta，不保存state对象内容。binding调用不await后再执行原方法，无新增延时/重导航；framenavigated/popstate用于核真实事件。它仍是可观察诊断工具，不能以静态评审证明浏览器时序事实。
5. Browser HTTP外网请求abort，WebSocket仅同本地hostname/portconnect，serviceWorkers block；不读取/复制用户凭据或全history state。页面error/event可能包含现行本地错误文本，结果不得改签成功。
6. action/navigation/expect/screenshot各120000ms；request startup读取完整响应在原AbortSignal里，startup总300000ms；browser launch120000ms。两族最多17个正动作×120000=2040000ms，加startup300000、launch120000、Next清理120000=2580000ms，outer3300000ms保720000ms给上下文/trace/metadata与清理余量。原任务预算不延长；这里只有导航、无任务生成。outer触发关闭自有browser/server，并保失败及同一stopPromise等待。

## 评审边界

这是工具启动前静态准入；工具真实运行后必须核result/events/截图/trace/owned cleanup、253+11 after绑定。不能将此报告代签settings原case通过、原170新增PASS、官方Codex生成或App验收。此次未执行收费/外网请求。
