# T1117 第一轮公共浏览器真实失败及断言范围

2026-10-09T10:00:25.243577+00:00至10:06:36.178031+00:00，exit1，370.887662秒，1PASS/1FAIL/0retry；log SHA7c3b8acc44e0052ec67f7b1482b9b4edbab8faa4f63f390af487d91eb8a5a028。原网络替身中断保存后，画布alert已真实显示网络连接不稳定,请检查网络后重试。；新增全page getByText(Failed to fetch).toHaveCount(0)匹配Next开发诊断portal内日志，错误持续到120秒。实际截图画布没有裸英文、参考field已为已选素材，DOM中应用alert与开发诊断区并存。

仅将新断言定位到包含画布标题的实际CanvasEditor main，继续断言该界面无英文、saveState失败和中文提示。不是删原断言、关devtools或改变console；原保存、精确file/reload、用户显式旧标记恢复、防重复与平台流程保留，原完整trace/error-context/failedPNG及第二流程工件独立保存在新验收目录browser-first-failure。后续当前浏览器需真实再跑，不能写本次2PASS。

## 第二轮实际采证定位失败

scoped原runner真实10:08:15.848889至10:14:47.373728 UTC，391.521304秒，exit1/1PASS1FAIL0retry，log SHA20a0a7dacd40d1310c80b1482ff17c13aefa6e9068200140d593bdf796b5aa0a。第一轮英文断言修正后通过；保存重开、旧引用显式恢复、正式回读、预览无文件名/尺寸均执行通过。新采文案脚本在模态弹窗已打开后读取背景referenceField的getByRole.innerText，而Radix正确把背景aria-hidden，角色定位因此失效并等待120秒。正常弹窗实际截图已root查看，选择/预览可见。只将字段DOM文案在各对应viewport打开前采集，弹窗文案仍打开后实际读取，不能伪造文字或解除aria-hidden；原业务断言保持。完整第二次失败trace及截图在新验收目录browser-second-failure独立保存。窄窗/确认/详情及后续流程尚未执行，不写PASS。

## 第三轮原保存失败状态观察超时

10:15:30.847775至10:23:56.799483 UTC原旅程505.946559秒exit1，仍1PASS/1FAIL/0retry；原保存中断计数为1，但错误状态断言未找到，最终已保存。完整日志SHA0f4c76d8feaecd9427c681328b8b3f6ef07284c84e2280e3daed0ff7b5b68dd5及trace保存在browser-third-failure，不以先前2轮局部通过代签。实际reload默认load等待44.250770秒；异常于reload开始2.900172秒出现，原错误观察比异常晚42.558612秒；后续真实GET与SAVE、Fast Refresh均保留。已登记独立T1120且初审PASS[REV:8af0827f9d1e]，限定改唯一该次reload为domcontentloaded，仍须原流程真实再次验证，不改产品保存、断言、HMR或0retry。确切Fast Refresh触发者仍UNKNOWN。
