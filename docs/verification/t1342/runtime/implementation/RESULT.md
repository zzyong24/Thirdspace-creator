# T1342 本地实现与必要回归收据

唯一生产改动是 `DraftResizableLayout`。保留桌面 380 默认、300–640 宽度和折叠偏好；1024 窄窗新增同页“打开编导”，一个 right/aside 在开关和断点之间保持实例，关闭时 hidden/inert。新 nonce 仅按原请求打开，不重发已处理请求。正常开关、宽转窄、窄转桌面收起偏好的焦点回到可见控件；键盘遵守最近的物理 dialog owner。

单实例保留未发输入和历史；隐藏时原有单在途 8 秒 feed 允许继续，终态停，不新增轮询。不能称隐藏零请求或性能提升。

## 原始运行与准确计数

| 运行 | 真实结果 | 清理 |
| --- | --- | --- |
| red-v1，改生产前 | 23：10 PASS / 13 FAIL；inner 129.510s，outer 136.193s | afterInputDrift=[]，remainingOwnedGroup=[]，监督身份 null |
| green-v1，五文件 | 192：190 PASS / 2 FAIL；inner 139.375s，outer 144.523s | 同上；原 FAIL 保留 |
| green-v2，仅 layout | 23 PASS / 0 FAIL / 0 skip；inner 6.190s，outer 11.194s | 同上，registered=[] |

green-v1 两项是夹具问题：关闭后重新创建了触发器，旧断言持有已脱离 DOM 的按钮；running 响应后才安装假时钟，原 8 秒 interval 已在真实时钟。仅测试修成重新读取当前真实按钮和在 resolve 前安装假时钟；焦点、2 次读取、单在途和终态停止的硬断言不减。另删边界禁止的直接 `ai` type import，受控空 messages 用局部 unknown[]。生产不再改。

RED 的无入口、生命周期、偏好/nonce 等原失败仍是原始证据；原 feed 的计数失败不能在该假时钟装配缺陷之外单独证明生产轮询错误。green-v2 对真实共享 AICopilot 的 effect/单 feed 进行受控 SDK/读取边界组合验证，不冒供应商或持久公共任务链。

green-v1 其余四文件共 169 项已实际 PASS，生产与依赖零漂移，最终继承该收据；加上 green-v2 layout 23 项，共 192 个不同用例覆盖。不是一套 192 全绿，也不把两次重复通过累计为新用例。完整名单见 CASE_RESULTS.json。

## 静态与来源

- 两修改文件局部 ESLint 最终 0 warning / 0 error；原 lint 失败单独保留。nonce 订阅 effect 沿原局部注释模式说明条件消费，不改规则或共享配置。
- C 独立全量核了 RED/GREEN-v1/GREEN-v2 输入锁；各次 wrapper 运行前后仍完整核源/依赖。
- 最终生产 SHA：5878cb84318140bb097832b5d3042c2f271e576b27d5caec2fae22e0ef69a1e7。
- 最终测试 SHA：0d96cf998baa1bf5365b6fcd88a8a6a3edd72940430e1fed56c0f4ac470bb9a8。
- 无数据库、worker、浏览器、服务或模型根。源/测试/依赖读窗已明确 RELEASE；完整 frontend type 与最终门由 C 沿最终干净来源统一负责，不冒本收据已执行。

## 尚待新固定包

实际 1024×680 / 1280×800 / 1366×900、真实 Chrome 200% 与恢复、可见触发器、历史两来源、未发输入、正常返回/刷新、焦点/真实 Tab 与网络/业务前后核对仍待新包执行。已准备六文件 final-ui driver，不把 JSDOM 可见/属性或组件 mount 探针当实际新包视觉/网络通过；本地组合没有替代新包验收。当前不 task complete。
