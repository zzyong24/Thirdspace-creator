# T-1110 EXP-2 仪器实现独立只读核验

结论：本次实际源码未发现阻断这一单次窄研究 intent 的具体问题。未运行测试、browser、服务或 API，未签收真人、正式停止 receipt、研究 validated 或生产采集 PASS。

已读 /tmp/t1110-section-research2/plan-private.json、当前 researching/v2 研究卡及其指向 clone 源。实际 wechat-browser-source.ts SHA-256 为 4c0343030348f5aa350c6ded4043827c8e8787b2dbb1e0cc0c13a39b0355cd30，与计划相符；persistence-client 原装配 SHA 为 ab11053526e4f2a4f71b45fad6e012b5215a1502d4d5124a8e4db4b5d0457dd8。相对于 ded9 候选，增量只有路径观测、imageTaken 标记和之前的 ready 停止仪器。

samePath 内实际 page.url() 仅读取一次，URL 对象同时用于 accepted 与全部机械字段。accepted 仍是原官方 origin、无 username/password、当前 kind 的固定 pathname 三项判定，hash 不参与放行；未放宽截图 guard。只有 !accepted 且本次尚未记录时才输出固定对象，随后 pathWitnessEmitted=true。路径解析失败直接返回 false，不输出 raw 内容；此分支若发生只能报告未取得分类，不能猜机制。

officialOriginMatch 包含原 userinfo 限制；reportPathMatch 是当前 kind 固定 pathname 的精确比较；pathCategory 只使用固定 pathname 相等判断，值限 report/homepage/login/other/unknown。hashReportPathMatch 只比较官方 origin 下的精确 '#'+paths[kind]，无 URL/hash/query/path 文本、正文或身份输出。它为 false 仅证明这一个精确 hash 不匹配，不能排除带 query 等其他 hash 路由；login 类别不能成为登录状态或 needsAuth。

imageTaken 初始 false，只在截图 promise 返回、原 check 成功之后置 true，因而 snapshotPoint 的 beforeCapture/afterCapture 可区分实际路径拒绝发生在成功观察截图之前或之后。未把晚 bytes 当作截图成功。各 currentDataPage 入口、登录探针返回、记录分类前及实际输出前继续 check 原组合 signal/end/局部剩余预算；过期或取消抛出，沿原父原因和 finally。同期一次 console.info 仅输出固定字段，没有异步 probe、等待、重选、额外截图或业务晚提交。

首次 prepare 若 ready，仍先检查 op.signal、op.timeoutMs，再发固定 ready marker 并抛错，位于 receiveReport/onReport 前。原 typed prepare 失败则保留原失败与原单次诊断，新仪器没有触碰 closeProfile/onStopped/onStopUnconfirmed 或租约释放。

研究卡现已记录 EXP-1 的真实 cancelled0/SKIPPED_CURRENT_PATH，并明确之前未能区分截图前后；EXP-2 为 prepared-not-executed/maxRuns=1。也已纠正前一设计评审中“排除截图阶段”的过宽表述：0文件及 SKIPPED_CURRENT_PATH 并不证明 screenshot 未执行。计划保持一个新 clientRequestId、原公开 backend/worker 链，不重发既有 ID；原服务 OS0/Chrome0 仅是观测，仍须原 hostRecovery/profile 正常 checkout。拒绝或停止归属不明即结束，不抢锁。EXP-2 后无第三次实验，机制未闭合就保持待验。

既有 guard race 前 await、关闭确认缺口及永久 OS unlink 限制继续保留，本次仪器没有修复或签收它们。评审 homogeneous inherited；仅写 /tmp 报告并修正同属 /tmp 的先前设计报告，无共享修改。
