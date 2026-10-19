# T1312 同 lineage 第三轮独立规格复核

本轮检查最小 A 兼容增量与真实新增 FAIL，原 REV-001、REV-002 保持 resolved，未发现新增实质 finding。未自填 verdict，交 C 调用实际 reviewctl 裁决；这不是实现终审或公共验收。

## 冻结输入

| 输入 | SHA256 |
|---|---|
| SPEC | ac6bbab4b8065abbf33a432f3fd61b8213fea373ddbf40d905c049b0a90dcfdd |
| INPUT_LOCK_ROUND3 | a57e843cff8108fa682e1dddd43fbe86047ea68a485aae0a613c030daaa9ab1b |
| MODULE_SCOPE_ROUND3 | 1f9d022fa55458da2acccb924816e2dffea2cfa79ca6877e3287bf03a4010e76 |

实际 53 项输入逐项 bytes/hash 匹配。已读 RECHECK_CONTEXT_ROUND3 的上一轮完整 packet、ROUND2_PRE_LEGACY_DELTA/SPEC.md 与本轮精确 diff。JSON 中两条既有 finding 全部字段原样保留。当前 B 中途产品字节由本轮锁绑定，未修改或重置其工作。

## 增量判断

SPEC 第 64–66 行的例外只接受此次真实 noGroup ctxA；原 task 查询已验证同 user/account 与合法 legacy 范围，原 assertFrozenWorkspaceMembership 又在同一事务持有并核验 A/member/G。下层重取同 A/member/G，既不引入页面 B 的新锁，也不借 rubric 来源或组名后缀构造权限。其他 group、puregroup 与跨筛选调用继续沿 task 冻结 ctx；positioning 分支、原 subject 与各叶子查询/盖章不变。

原 confirm 在产品修改前快照中直接传实际 ctxA。保这个合法入口的 accountA 叶子，符合原 scope；没有要求根据 key/fingerprint 改为恒定 origin 的新 owner 策略。它不重开 REV-002：原有跨筛选 B 的反序由冻结 ctx 继续避免，此例外只使用已经持有的同 A。

生产仍是已审九源。三份旧调度测试的追加 W 仅机械适配 ensureDefaultRubric/full ctx 端口，不能删业务断言或扩大生产修改。

## 新 RED 的实际范围

legacy-public-v3 的 50 份运行前快照与运行/日志/tuple 等合计 56 项保留证据均校验匹配，快照时间先于命令启动。运行实际为 1 FAIL / 5 skipped，32.414 秒自然 exit 1。真实公开 noGroup A 创建原稿和 AI，prepare 使用隔离旧 canonical v2null，immutable worker 收到一次明确受控 provider 响应，原模型 call settled 后形成候选；confirm、AI 与 execution succeeded。随后同 ctxA 对该次 confirm 原 prediction ID 的公开 get 抛 OwnershipError。

原件 tuple 为 caller noG/A、task G/A/gv1/mv1、draft G/A、root G/A/current v2null、prediction G/accountnull；这支持最小 A 的必要性。不是旧版本原来失败，也不是 PG 死锁复现或真实付费模型证据。后续 lock、manualResult、Learning/adopt 未执行，不追签已通过；原两个跨筛选 B 族本次被 testNamePattern 跳过，不记作本轮回归 PASS。

core-v1 的 puregroup/namespace 是准备证据；两跨筛选案例含 worker、confirm、prediction 与 lock，未覆盖 result。修后须按 SPEC 第 68 行读取并锁定该次 confirm 的原 prediction，用其原 ID 继续 result 读回；另建第二条 prediction 的成功不能代替原产物后链。完整 Learning 回流/采纳与两个跨筛选 B 族、普通 scope、positioning、错误身份及 rollback 仍须实际验证。本轮不代其签 GREEN。

## 执行与交接

仅写 SPEC_REVIEW_ROUND3.json 与本文件；没有生产、测试、控制面、HTTP、模型、浏览器或服务操作，没有 commit。真实工具 verdict、产品恢复执行及后续受测结果由各自授权窗口处理。RELEASE 全部写权与资源。
