# T1175 独立 SPEC 初审

结论：**PASS，仅限该展示修正的初审。** 产品尚未实施；不签当前运行、包/安装、安全全验、真人微信研究恢复或全局失败闭合。

当前阶段为4-build维护；product-to-code-orchestrator安装及项目版本均为3.29.0，沿用Oil 0.10.0和已有紫色方向。实读HEAD为`d414dcb34aa88fa032fd302b6d1030ec720e5aa4`，SPEC SHA256为`b269630e67711f1c1b7f69b3b25d9f895a60fa111498959b4c23b62e31ffa013`。全部实际读路径、字节数和SHA见READ_SET.json。

## 真实问题与现调用

已实际看过原图，尺寸1280×720：恢复卡片在“工作区暂时未能打开。”下露出`forbidden: request must originate from the local application`，重试、账号组与绑定账号、设置入口仍在。现Boundary错误段直接渲染`initialization.error`，缺陷与源字节相符。截图仅证明英文展示；403和缺宿主握手的负向条件由SPEC记录，本次不重跑、不将其解释为App启动失败。

AccountSwitcher现公共list消费非2xx error字符串或对象message，经HttpTransportError及原`fail(error.message)`进入provider；原`registerRetry`绑定真实retry。共享`describeUserError`已有forbidden/403权限反馈、网络规则、未知中文fallback和短且无技术噪声的中文透传，因此无需新词表或修改共享helper。

```mermaid
flowchart LR
 A[原403拒绝] --> B[原初始化错误状态]
 B --> C[仅展示复用中文反馈]
 C --> D[原重试公共读取]
 D --> E[原成功与就绪条件]
```

## 精确写集与安全边界

产品只允许`frontend/src/components/shell/workspace-initialization.tsx`的展示调用及必要import；测试只允许`frontend/src/components/shell/workspace-initialization.test.tsx`。原共享helper、provider存储的错误、初始化/ready/fail-open/同根、分页、timeout、Abort、epoch、重试登记及按钮处理器不改。AccountSwitcher、backend、握手、owner、模型、任务API和旧失败/包均不在产品写集内。现同根fail-open为原行为，不得在中文修复中新增、删除或扩大；服务安全拒绝继续逐次有效。

## 测试覆盖判断

SPEC计划对该写集足够：用真实HTTP403 raw envelope走现公共组list消费链，核中文权限反馈及原英文不出现；无冻结根意图时创建入口仍关闭，点击原重试后仅公共list成功并满足现同步/就绪条件才开放。另补未知技术错误中文fallback和已有安全中文保留。现同名测试已覆盖公共读取延迟、实际total分页、同根fail-open与retry、无根错误/成功、恢复页/overlay、超时Abort、refresh等待/失败、StrictMode晚回执、切组、旧轮超时与脏稿保护，原断言须完整保留。

本次没有执行RED/GREEN或任何Gate。实施后仍须取得SPEC指定组件/helper/类型及LED047、boundary/semantic/orphan/diff实际结果、独立窄源复核，以及同1280×720真实恢复态前后图和原重试操作证据；组件或helper单测不能替代该真实页面证据。

## 实读绑定

- workspace-initialization.tsx：`4f251797b3b01cfacdf2a7bd6c072953f6d58c6c24e973d09b6df349cfb7f2a4`
- 同名.test.tsx：`9ffb9c23d8d8e765a80b2c6ccc42977e0f0bc4198711d1fe70fe862c54e03d38`
- ai-error-humanize.ts：`4fe33a5e977424aa07e6e4292993986e9d9b09f94bd0abbdfa0121e953b9bebb`
- account-switcher.tsx：`701fff5fbbb54378b9cdc8d9f695a649807cf6fb6ca1a0a873be5efe7d257aee`
- 原PNG：`6a94edcc36920f89f226344c19fb54620d2b93405d13a026a32c9b714177b562`

实际findings为`[]`。本初审不覆盖额外安全诊断、打包修复或微信发布范围。旧失败和所有任务状态保留；只写本私有目录，未执行验证器/产品CLI、服务、DB、模型或新方案探索。
