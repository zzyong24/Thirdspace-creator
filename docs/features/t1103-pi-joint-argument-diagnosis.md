# T1103 Pi联合提案遗漏图文参数的真实安装缺陷

用户2026-10-09要求“有问题的创建 task 及时修复”。本登记承接T1099真实安装Pi验收，不是实现规格或审核PASS；产品修改前必须先核机制、冻结写集并独评。

大白话：AI已经读到脚本，也知道错误是缺图文，但正式调用仍只交文章，没交齐两稿。结束状态现在准确，联合候选本身还不能算可用。

```mermaid
flowchart LR
 A[同一已安装包 真首页与旧数据通过] --> B[Pi task272真实read成功]
 B --> C[提案1仅摘要参数]
 C --> D[提案2文章齐全 图文缺失]
 D --> E[提案3仍缺图文]
 E --> F[真实partial 无候选 原稿不变]
 F --> G[研究参数生成与完整回执 原任务保留]
```

## 当场证据

- 版本1.2.0，包源main `070287024a99fdf810a03d0ff39a9c944a9775e7`。首次展开失败另立T1102；同包正常重启完整展开、HTTP首页61596、CLI及4安装成员匹配，11原任务/4DTO/两旧会话对照实际通过。公开22读取21正常，裸定位按既有空结果约定404。
- 唯一新修复验收意图`t1099-repair-20261009-pi-creation`，会话`ai-conv-c4504fa1-268`，任务`ai-task-c4504fa1-272`，actualEngine=pi。中性组`grp-58776bff-101`、项目`project-58776bff-104`。实际提交和观察日志保存本机`t1099`。
- 正式`work.creation.read`为ok/none。三个正式`work.creation.propose`均error/invalid_input/none：首次只有targetDigest；第二、三次是article和targetDigest，graphic缺失。回执已明确graphic必填及必填子字段，没有合法完整article+graphic调用或成功proposal。
- 第二、三次文章来源实际title/summary各1、两sections各1；当前来源提示开始被遵循，但图文缺失没有触达领域root。不能称本次现场验证了T1099安全领域错误；该点目前真实公共Worker隔离测试已验证，供应商现场尚待合法调用。
- 实际终态partial、assistant completeness=partial。观察脚本exit0仅表示观察结束，candidateVerified=false、validationFailure=实际任务非成功终态；article/graphic/composition DTO逐字不变。
- 没有保存本次供应商原HTTP字节；以上是实际公开工具input/outcome，不能推定供应商发出完整图文后被SDK删掉，也不能只依据模型文案猜原因。
- 提交日志SHA256 `b0666142e6e9ba6073d3d0a67b4dc744f1bbe9aba418a43e43d990a1399c12cd`；完整观察日志SHA256 `c206fb0247759d135f25219ad8c30025b4cfc8406d4f3fc7615d48198b303983`。

## 诊断边界和下一步

先只读核对当前合法联合工具定义、冻结系统方法、Pi worker/provider参数与工具结果转交路径、模型停止/同参有限收口以及已保存公开回执。明确实际SDK版本与参数模式；新增可观测性若必要，先精确SPEC和独评，不读取用户密钥、CLI连接文件、激活或用户DB。不在真实任务上补字段、伪造scriptRef、改payload、改终态或直接调用root代交候选。

同类真实失败已重复，先按研究门收敛机制，不继续盲改提示或不停换键。不能放宽三根字段、来源/版本/owner校验，不能把文章单稿或read成功算联合成功。原200/222/272及未知结果都保原ID/原回执；若后续明确修复并经正式审核，新验收必须是已确认终态缺陷的单一独立修复意图，不自动采用或保存、不生成视频。Codex通过不能代签Pi。

当前不complete本任务、T1099或T1095；包已恢复首页可供用户测试，但不标全功能通过。仍保留原42全局/27超时失败与T1096/T1097/T1098等任务。


## 两次隔离实验已完成

机制研究卡及当场脱敏结果：`docs/research/t1103-pi-joint-arguments.md`、`docs/verification/t1103/research-observations.json`。完整参数分3段且graphic末段的真实Worker链3 PASS，原业务/回放断言和预算保留；截断参数5族3 PASS/2 FAIL，两个非法原串被SDK修补成合法前缀。finish事实仍保留，没有task272原wire，所以其具体原因仍未知。两次实验已用尽，原RED留存，研究卡仅candidate；不新增第三实验，不盲换strict parser或放宽schema，先收敛兼容修复。T1099已真实taskctl block，不complete。
