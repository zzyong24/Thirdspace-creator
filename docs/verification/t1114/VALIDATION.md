# T1114 原任务模型调用摘要验证

这项改动补充诊断入口，帮助查看原失败任务已经保存的分片和最终参数。它没有修复 Pi 的联合生成解析，也没有重新发送模型请求、采用候选或改动原作品。

```mermaid
flowchart LR
 A[原工作区与原任务] --> B[公开CLI读取]
 B --> C[任务 会话 源消息归属核对]
 C --> D[已保存回执的有界摘要]
 D --> E[根据真实证据继续排查]
```

## 实际前置与失败历史

正式 SPEC 初审 `PASS[REV:aa44cb7e4c35]` 后执行 taskctl start。契约行为 RED 为12PASS/2FAIL；最初两次公共测试各13FAIL，原因是夹具漏传必填 capability，发生在新操作之前，不能当作产品行为 RED。第二次文件名中的 valid-fixture 不证明它已有效。补齐真实聊天提交参数后，公共行为 RED 为7PASS/6FAIL，正读取因新端点不存在失败；其中负例尚不能单凭 RED 证明权限守卫。原日志、时间与退出码均保留。没有补拍 helper 缺模块为功能 RED。

## 当前源码结果

契约两文件14PASS，backend五文件55PASS。随后只补一个 SPEC 已要求的公共空结果例，原公共文件14PASS（其中13项与前次重叠），最终相关唯一用例70项。正式 dispatch 26PASS，当前相关唯一用例合计96项。六个产品文件在补充测试期间未改。

覆盖纯组、归档历史、旧NULL冻结及canonical来源、完全canonical、跨user/group/account与缺身份拒绝，任务与会话/摘要/来源闭包错配，以及分页、非顶层或未结算模型排除、无效回执不遍历、secret canary不外泄。新空例保留任务身份和afterSequence=19，不把calls=[]解释为任务不存在。业务账本前后逐字相等；公开CLI读取审计不算领域写入。

contract/backend类型检查实际退出0；新增空结果测试后的backend复查独立保存，不以前次代签。boundary、semantic、orphan退出0；既有5条物理边界基线与100条orphan warning保留。独立实现复核 `PASS_LIMITED_T1114_IMPLEMENTATION`，findings为空，绑定六产品、四测试和SPEC/modules当前SHA；原补充前报告逐字保留。

具体命令、时间、退出码与日志SHA见 [current-evidence.json](current-evidence.json)。本文当前不声称安装版新入口、原生UI或完整reconcile已通过；安装与全局结果在实际结束后补记。T1103/T1099/T1095仍保留原真实失败，不将本诊断入口视为候选成功。
