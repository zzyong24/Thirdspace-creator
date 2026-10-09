# T-1112 独立实施复核

- 复核时间：`2026-10-09T06:50:37.324584+00:00`
- 结论：**PASS_LIMITED_T1112_IMPLEMENTATION**
- 当前源码：`f9d855e41bf49316efa431cce5cda515fa986866d69a79108ee33ca6b63d045f`（scope）、`507a488a3c367d5e36eed02c8c4d5a5410a5fff7fc295d167b31f3f5daf15365`（transport）、`4f2d2ac6cf5727c2f987cf58576a10b11d14585c34afc47ad1634284136b1f36`（contract test）、`06c36103b7875bbfa405eca42f7418ae4862c79d95f1b6ac3dd114010e353b1c`（组合 test）

## 结论依据

实现只把 `workbench.capabilities.list` 的作用域声明改为 `group`，transport 也只为这个 endpoint 接受有 `groupId`、无 `accountId` 的上下文。其它七个工作台操作仍保留账号门。真实 CLI gateway 继续负责组归属校验和读取审计；transport 没有获得绕过 gateway 的新归属能力。

新增组合测试覆盖 active group、archived group、旧账号入口，以及错误用户、不存在组、非属主组、无工作区和无认证。七个账号操作使用各自合法的 params/query/body，先经 schema 校验，再精确断言 gateway 的 `AccountRequiredError` 与 transport 的“当前账号不存在”，避免把参数解析失败伪装成权限拒绝。合法目录读取只新增原有 CLI 审计及加密结果；项目、输出、AI/执行任务等业务快照保持不变。

三次 typecheck 失败被完整保留：空输入以及两轮 `it.each` 联合推断均未保存具体 endpoint 类型。最初组合夹具遗漏 `now` 的失败也保留，未冒充产品行为 RED；有效夹具的 13 PASS/2 FAIL 才是权限行为 RED。最终测试通过逐端点泛型闭包保存 `EndpointInput<E>`，产品文件没有随之改变。最终证据为 contract 12 PASS、backend 26 PASS/0 skip、dispatch 26 PASS，以及 backend typecheck、boundary、semantic、orphan 均 exit 0。证据 SHA 见同目录 `IMPLEMENTATION_REVIEW.json`。

SPEC 初审的两个 finding 均有可追踪解决证据：验证命令已绑定；归档组和全部拒绝族已纳入组合测试。模块在正式 PASS 后新增的仅是两条实际 SPEC_RECHECK 收据路径，产品写集和命令未变。

## 边界

`installedCatalog` 仍是确定性安装目录替身，故本报告不证明新安装包、真实目录内容、模型、用户环境、T-1103 或全功能通过。读取会按原设计写审计和加密结果，结论是“零业务对象写入”，并非“零数据库写入”。全仓新 baseline 仍为 exit 1 / 41 errors；没有新增错误，但本报告不将其或历史 42 项欠债签绿。
