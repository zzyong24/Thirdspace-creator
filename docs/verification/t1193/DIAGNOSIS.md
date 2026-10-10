# T1193 当前源码只读事实

当前AICopilotContent产品SHA60fe11f9…，未修改。submit在开始prepare后清输入/附件picker；pending.catch只检查submittedAttempt归属，然后setPrompt(value)，没有按networkStarted区分尚未发出与已开始transport未知。因此prepare后的503路径能把原话重新显示为输入。发送按钮disabled检查空输入、pending approval、附件上传、引擎和preparationPending；没有直接按未知receipt禁用。不过源码条件并不证明新点击已重复执行后台任务，仍须实际UI/请求/原receipt验证；用户明确新创作也不能全局禁止。

原错误卡title实际13px、原因正文12px、引擎设置链接11px，恢复原生button11px；fresh画面约12逻辑px的估算有源码基础。shared Button default14/sm0.8rem不自动覆盖这些原生元素。现值来自原卡复用，本次T1191根滚动修复没有缩小它们；T1193应按现tokens修正重要状态可读性，不动全局字号或换品牌。

可能的后续精确方向是用现可信attempt/networkStarted保护输入恢复：尚未发送保原请求，已提交未知不重新预填同句；用户后来新输入和原请求snapshot必须同时保留，不能把一般错误文案当状态、更不能禁止合法新任务来躲问题。该方向只是源码诊断，未独评、未动代码/测试，也未签用户最终视觉选择或完整调用链。当前source/scope/lease/SDK/预算/上传研究原样保留。

实际读路径及SHA见READ_SET；fresh独评原文归T1191/FRESH_VISUAL_REVIEW，本root读源不取代独审。

## 当场独立 receipt 补核

最终独立走查原 receipt SHA af3102ae6d4ddc2cba816d6c6e55bb390ada138c709604976bd5bcc0156fe1b4 的 log[55] 实际记录：核对原请求 disabled=true；普通生成按钮 disabled=false；textarea 保留同一句原话；随后 log[56] 请求计数仍为1。它证实了当前控件状态，尚未点击普通生成来证明第二次POST或持久任务重复。不得将其写成只是紫色外观猜测，也不得代签重复执行已复现。该只读补核不增加模型/上传实验，原 receipt 和失败原样保留。
