# T1365 本机交付SPEC独立初评

规范包为`findings.json`（spec-review-round/v2 initial，findings为空）。未发现需整改的规格缺口。冻结SPEC SHA256为`8527b9eaa4c5384457972fd5ae1559cdbaecede3eaba1b46bddcba0bfb8f4fbe`；文本副本与输入SHA在同目录。此为交付合同审阅，不是前置实现通过、构建/安装通过或真实诊断执行许可。

按项目入口核对BACKLOG任务与SPEC，复用本会话已读PROJECT/CONTEXT、产品流程3.29.0与架构；结合项目packaging-creatoros-release技能审阅，当前为SHIP本机交付准备、待审。DEC-136501已记录Root选定方向和授权边界。Reviewer未运行测试、Next、构建、安装、平台或新诊断，没有产品/中央状态写入。

- 前置以T1364最终冻结字节、受控公共CLI/HTTP/Chromium/实际DB租约、真实断连/scope保护及独立实现审为准；不以尚需真实导航的T1364 complete作为前置，避免依赖环。当前工程证据仍在完成，SPEC没有提前给它们填PASS。新op默认关闭，安装成功也不自动执行平台诊断。
- 固定产包与技能一致：提交且干净自有候选、四版本/lock/tree/secret差异预检、四基本打包测试；正式Next/Chromium及大型测试退出后串行构建，独立T7真实依赖闭包与新Cargo target。仓内package-local.mjs:230确实支持CREATOROS_LOCAL_SKIP_INSTALL=1，能先产包而不自动安装。禁止构建中改脚本/产品/断言洗绿、失败自动再构建；单次至少120秒不被错用为构建上限。
- 产物须核源码/attestation、主程序/sidecar/server/DMG SHA、codesign及只读DMG同源；ad-hoc不冒公证。覆盖同名Downloads前保护唯一e676旧包字节与SHA。未虚构Windows或外部Release/发布授权。
- 正式替换前fresh核当前App/活动；具体活动、未保存风险或归属不明就停。无dirty接口保UNKNOWN，只允许既有授权的正常quit，不点丢弃、不强退/取消/延长旧任务。进程子树实停后才同卷暂存/备份/替换；新App同源可用之前保恢复备份。当前历史PID和T1359的120.399秒不能代本轮fresh事实。
- 存活验收分开启动预算与完整连续120秒稳定段；核实际App/PID/runtime/tar stamp与全量canonical文件/链接/类型，显式保护此前隐藏名前导点误归一化的真实FAIL。无原生像素能力保未验，不拿浏览器镜像代签。当前诊断关闭只消费现有实际证据，不为验收再加API或真实启动诊断。实际close/lease结果留T1364收。
- 清旧只允许本次Root核准精确集合，逐项核canonical/链接/引用/owner/独有证据，不能套用T1359已清14项。用户Library数据/auth/profile/runtime、原任务、受信单次准入标记、失败原件及可恢复唯一旧包均受保护；UNKNOWN即保留，不能删标记重获额度。

原global44、foreign9/T1255和既有prediction-lock两路由库存失败必须保分类与原件，不能把本轮新增范围失败归旧债。SPEC明确实际适用门与源漂移会阻止构建，纯交付文书又不重复无关UI/模型门，边界一致。本审没有改变或销账这些原失败。

后续执行者须按真实结果分别报告候选交付、T1364受控工程、Root是否已单独放行/完成当次导航、原281等未改及真实采集恢复未证。交付完成不能结束用户仍在排查的问题。本轮不为未发生的打包、安装、真实导航签证。
