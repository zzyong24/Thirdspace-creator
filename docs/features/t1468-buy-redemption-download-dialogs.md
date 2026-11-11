# T-1468 购买前提醒与兑换后下载弹窗

用户2026-11-11明确要求：buy官网跳转链动小铺之前，提醒用户复制交付的码返回兑换；兑换完成后弹窗，引导 https://my.feishu.cn/wiki/QY1owmFUjit7VgkpmQ1chGPCnTR 下载。授权修改并部署自有buy CreatorOS页面的这两项提示，不下单、不提交真实购买码、不改套餐、支付、兑换API或生产数据库。

当前已有checkout-reminder原生dialog，确认后才创建购买请求，保留原时序。把文案改为“付款后复制链动小铺交付的购买码，回到本页兑换正式激活码”，与当前输入框命名一致，不把两种码混淆。取消及Escape仍不得创建购买请求。第二个新原生dialog仅在原交易脚本已展示兑换成功delivery（open且有正式激活码）时显示，直接成功与轮询成功均覆盖；待交付、失败、缺码不能显示成功。弹窗提醒先保存本页正式激活码，包含明确飞书下载链接（新页签noopener noreferrer）与“先保存激活码”返回按钮。返回后聚焦现有复制按钮，原交付卡片继续保留。

复用原样式tokens与native dialog焦点约束，手机390×844、桌面1440×1000无横向溢出；可键盘关闭，不自动跳飞书、不自动复制剪贴板。只在CreatorOS购买页载入新增onboarding脚本；以MutationObserver读取原delivery的class及代码存在性，不修改共享store.js、store.css、其他产品Moving或商品JSON，避免改动支付主链与旧旅程受保护文件。

写集：website/buy/creatoros/index.html、website/buy/assets/rights.css、新website/buy/assets/creatoros-onboarding.js、本SPEC及docs/verification/t1468/**，BACKLOG/PROJECT及必要任务控制面；原T1434页面被监看，按既有taskctl正式刷新旧旅程回执，保护全部原交易断言，不放宽受保护store.js摘要。此次为现有结果的可逆展示提示，不改变产品方向、架构、归属、API/支付状态或交易schema，不增设独立规格评审。

验收：原确认按钮真实打开提醒、取消与Esc不触发POST；原确认购买业务不改，通过本地合成checkout响应验证确认后沿原流程新页签跳转，禁止线上测试下单。本地合成兑换响应验证fulfilled有码才弹窗、pending轮询fulfilled弹窗、失败/缺码不弹窗；Close/Esc可返回保存激活码，下载链接是指定HTTPS精确地址。Moving载入原脚本无新增弹窗。浏览器本地替身只证明前端，不能称真实付款/兑换通过。线上只GET和取消购买提醒，不提交任何真实交易。现有网站node测试、JS语法、diff及timeout-policy验证；源码限定提交，部署前备份和SHA防漂移，原子替换页面与资源；上线HTTPS摘要及桌面/手机实际浏览器核对。pmem sync→quick只读reconcile→taskctl按实证完成。
