# T-1308 新候选公共历史验收独立复核

**PASS，仅限本次三种真实历史响应顺序与只读隔离。未发现未解决实质问题。**

source `dc46cfa700ec9c9cbada47fb76237d0b50d10a67`；控制 HEAD `354786143377c58a12876731d00b075c4008a858`；实际服务 `65353`/fresh owned `MhP4pW`。HANDOFF SHA `ec80c73261c08f9362d77fabd3e508cab5879f050f29e0425a32974361513e15` 与binding逐项一致。87项证据索引逐文件字节数及SHA全匹配，索引 SHA `a3dd6c281f74beded0622f0ee47d7512bab84d4bcbe8dfaf2154cc38730fc70a`。

A为当轮真实 editor会话 `ai-conv-bcda7005-361`，B为当轮真实联合创作会话 `ai-conv-bcda7005-107`。

| case | 原件确认的顺序 | 最终结果 |
| --- | --- | --- |
| `01-a-then-b` | 自然A恢复及明确B的两原200均已取得；先释放A并等浏览器完成，再释放B | B |
| `02-b-then-a` | 先释放B并真实可见，再释放A | B保持 |
| `03-hydrate-then-b` | A真实恢复完成且可见后，原UI选择B | B |

独立读runner、三份timeline、12份原服务body、case-result与见证。每份原body逐文件SHA与server/browser记录相等，目标release摘要也同源；HTTP均200，时间线有request、server完成、显式release、browser body完成和requestfinished。只控制原响应释放，不改body或内部ID。

三case最终region、精确原user文本、菜单active和自然pointer四项均为B。原UI选A及自然reload建立指针，fresh context仅设当前组/onboarding偏好，未注入会话指针或业务storage。显式B发生后允许旧A被抑制；没有强求旧错误继续出现。

三组前后完整article/graphic DTO、script metadata及按真实total分页的全部versions原件完全相等，attemptedWrites均为空；新增模型/owner保存/script保存均0。Playwright原reporter为3PASS、0skip/0flaky、真实exit0。本run适用的完整timeout verify真实exit0，原件引用T1307同冻结源码run。

原T1306公共1FAIL/2PASS及T1305缺完成顺序保持原事实。本次不追认旧时序，也不替代受控implementation的其它失败/生命周期族。共用两真实会话不等于新增模型调用；T1307的两次模型请求不计入本历史只读阶段。

限制：不代签T1302完整视觉、父40功能/56route矩阵、原生壳、现用App或激活；runtime RET-001/002仍缺失，不被本run补齐。宽文本observer及后端phase不提供精确DOM/TTFT或完整FEEDBACK。C仍持controller供后续复用，未声明最终服务shutdown。

本轮homogeneous独立复核只读原件与离线对照，不执行测试、HTTP、浏览器、模型或服务。issues为0。四份授权报告核验后 **RELEASE全部写权/资源**，不提交，由C整合。
