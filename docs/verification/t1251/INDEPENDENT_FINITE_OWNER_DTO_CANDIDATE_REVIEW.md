# T1251 独立候选窄评

PASS_TEST_CANDIDATE_ONLY。

原公共 DTO 无 accountId；使用真实 groupId，并由既有 scoped getTaskExecutionRuntime.owner 保留完整 user/account/group/version/membership 校验。首次失败在 enqueue 前，未验证期限。

未运行候选、未修改产品；不签新增断言或期限已经通过。
