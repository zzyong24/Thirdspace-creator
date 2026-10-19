# T1113 独立只读诊断复核

- 时间：`2026-10-09T07:32:18.780000+00:00`
- 基线：`e0b5947181430c276cde34dd909f43f36ad68ccc`
- 结论：**当前没有确认的产品缺陷；两份目录描述不同正式入口。**

## 两份目录的真实含义

`accounts.bindingCapabilities` 属于既有账号绑定服务。组合根明确装配 `createDouyinAccountBindingStage`，`accounts.bind.start/status/cancel` 是它的正式公共操作。因此抖音返回 QR 可用具有源码装配依据。

`platforms.capabilities.list` 属于另一套 platform-collection/source-adapter 服务。它只根据 `sourceAdapters` 判断 `platforms.bind.begin`、采集与指标入口；当前装配仅有快手和小红书。抖音在该目录返回 `SOURCE_UNMAPPED`，准确表达“新来源适配器入口未装配”，不等于既有账号绑定入口不可用。把这里硬改为 `supported=true` 会虚构适配器。

## AI 发现和执行闭环

AI 的固定读取目录包含 `accounts.bindingCapabilities`。`system.features` 的 accounts 域公开 `accountGroups.*`、`accounts.*` 读取以及 `account.bind.start` 动作。候选准备会再次读取真实账号组及所选平台 capability，只接受 `bind.available=true` 且 `method=qr`；用户采用后才由原 owner 调用 `accounts.bind.start` 的事务内预约，并在提交后唤醒。该链不依赖 `platforms.capabilities.list` 或 `platforms.bind.begin`。

因此，当前源码不存在“AI只能看到SOURCE_UNMAPPED而找不到抖音绑定”的确定缺口。目录可见性也没有替代归属、组版本、明确采用与原owner校验。

## 仍需的证据

在宣称安装版扫码可用前，仍需隔离公共组合验证：同一上下文读取抖音QR能力，真实 `accounts.bind.start` 创建组属主预约，status/cancel保持归属；AI链需验证 features→read→候选→明确采用到同一个owner，采用前不得启动。外部浏览器阶段可以受控替身，但不能把替身扫码当真机成功，也不得读Cookie或密钥。

同时应保留一项相反断言：`platforms.bind.begin` 对未装配的抖音source adapter继续返回 `SOURCE_UNMAPPED`。测试应同时断言两目录及其各自operation，不能要求两份目录逐字段相等。

只有上述公共链出现失败，才有依据登记具体实现修复；单凭目录差异不支持产品写集、真实扫码失败结论或能力flag修改。
