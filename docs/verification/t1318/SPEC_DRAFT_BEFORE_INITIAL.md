# T-1318：恢复纯组策划论点候选采纳

## 当前真实失败
planning.thesis原task103可生成候选，但ai.tasks.confirm返回428 AccountRequiredError，ai.adoptThesisCandidate要求selected account。planning.contract259/outline318生成及采纳成功不覆盖thesis采纳失败。

新不可变包source 0e1dc6228f1fa3dc02f2b1c7a1cee77ab18d650a，owned-root qyb5ZR/50727；原失败、任务与响应保留，证据见docs/verification/t1318/OBSERVATION_INDEX.json。不用后续task succeeded覆盖单操作拒绝。

## 待审最小方向
原采用函数requireAccountId并按account行锁；后续最小方案需核真实workspace和task/project冻结身份、原候选/幂等/CAS/原子版本与跨组安全，不删权限门假通过。尚未冻结实施写集，不扩大contract/outline。

## 授权与阶段
用户原全功能修复授权与Root本轮明确裁决覆盖本问题登记；当前仅现象/源码线索/必要最小范围草案，不start、不产品/测试修改、不重包、不改变当前T1314–1316 packet/共享配置或T1300已锁矩阵/原审核轮次。先精确正式SPEC/输入锁与独立评审，再真实完整公共消费者前RED→最小实现→安全回归及新包必要复验。原既成失败不能补拍成前RED；不重发旧UNKNOWN或重复付费请求。

后续验收必须以原受权入口/实际owner/原scope/真实task/call/结果读回为据，跨user/group/account拒绝、旧合法账号兼容、归档/取消/回放/rollback按实际受影响族核；新机制或写集扩大须先明定。此时没有实施PASS或新模型结果。
