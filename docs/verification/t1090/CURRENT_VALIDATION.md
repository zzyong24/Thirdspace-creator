# T1090 当前验证

原回放缺陷已按原可信task冻结ID恢复实际消息，旧摘要/权限/lease/fence和回执校验保留；四产品路径及一个新增测试字节见[evidence.json](evidence.json)。

真实RED新增21例5FAIL/16PASS，五项均实际source冲突；修复后五文件139PASS，原completion60例不改断言或fixture时钟。backend/frontend类型与boundary/semantic/orphan均exit0。静态、实施Gate及[最终安装独审](INSTALLED_FINAL_REVIEW.md)通过，完整Worker两文件8PASS（134.307秒）。本SPEC范围完成；全功能仍未完成。

原b75与当前60例59PASS/1FAIL证据保留，不能把修复后的PASS追记成原GREEN。时间扰动测试仅操作合成后续行的createdAt，原冻结ID/digest/payload/正文/回执不变，正向零重复写；16负向族仍拒绝并保持调用前后行集合一致。

## 本轮真实出包与安装

冻结main产品提交 `5915784cc691db140177e3520187d2da3182bb51`，四版本均1.2.0，工作树实际干净；冻结后四项打包基本测试45PASS。固定入口本地构建exit0，405.321秒，无备份。当前安装包[CreatorOS-1.2.0.dmg](/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg)，840322404字节，SHA256 `6ccb5876f7ecad44decded655b66c2e46fcdd55f0abfb37fdd75d8cf9d2f11c9`。

hdiutil校验通过，源App和DMG内App deep/strict签名检查通过；实际安装App四个关键成员与源App/DMG一致。新冻结历史实现从本轮编译源和transform policy映射至实际打包运行时的九个成员，包内最终字节均与本轮staging一致；0130迁移仍为原已验证字节。本地ad-hoc包，没有Apple公证或公开发布。

原App温和退出后正常替换并open -n启动，没有强杀、备份或重置用户数据。实际Native PID36612，本机origin `http://127.0.0.1:65321/`；日志有SIDECAR_STARTUP_VERIFIED及HTTP MAIN_PAGE_LOAD_FINISHED，CLI确认为installed/connected。外部观察开始至首页事件67873毫秒，仅为观察相对时间，不声称精确冷启动或已看见原生窗口。启动前缀仍有渠道digest/配置同步502签名，前一T1089实际捕获也有相同三项；未猜根因或修改凭据/渠道，不能声称配置同步全通过。

## 安装版AI公开只读与同key回放

复用原中性项目 `project-c68e8d14-143`，只创建本次验收会话 `ai-conv-af716e53-230`。原公开消息243、AI任务244、execution245成功；公开Pi实际工具回执为projects.outputs.list、articles.get和graphicPosts.get，解析结果与正式DTO逐一相同，两个空初稿v1按实际报告，业务DTO前后深等。模型期间两次把数字versionNumber当成字符串versionId，被原schema拒绝且sideEffect none；随后同一原任务改用get恢复成功，这两次错误保留，不算成功调用。

使用完全相同公开CLI key和payload回放，返回原消息DTO、原AI/execution任务，消息集合不变。公开请求幂等证据不代签安装版Worker completion私接口回放；后者由本轮真实service测试验证。没有生图、渲染、写稿或采纳图401，不代签live Codex、平台扫码及原生逐页交互。

## 完整对账与收尾边界

本轮完整reconcile实际exit1，1185.104秒，42 error / 0 warning；日志SHA256 `5a7dc597bbef244902c857fc708f2a8e4fbfe10583fb9d46624d709b7079ea5a`，与T1089日志逐字相同，没有新增错误。旧来源评审、历史回执、LED、预算、旧glob和看板健康欠债由既有T1081/T1082/T1083及T1015/T1018承接，不手改旧状态或虚报全仓通过。独立最终复核允许以明确全局失败证据完成本任务。

完整对账结束后确认本轮独立PG55422没有其它客户端，正常停止其精确数据目录；用户数据库与其它PG进程不动。收尾只更新文档、状态和真实审计，不改变已安装包的产品字节；本轮包仍绑定上述5915784提交。

```mermaid
flowchart LR
 A[可信原历史ID] --> B[当前真实消息按原顺序恢复]
 B --> C[原摘要 归属 租约 回执校验]
 C --> D[原ID继续或回放 零重复写]
```

本轮已通过真实taskctl完成T-1090并留下审计event；之后pmem同步exit0。状态收尾没有修改产品/测试字节，不需要把文档提交冒充重新构建。
