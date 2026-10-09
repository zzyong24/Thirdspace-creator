# T1105 预算校准独立增量复核

## 结论

**有限 PASS，findings 为空。** 本次仅校准已有真实浏览器旅程的外层与客户端默认预算，没有修改 T1105 产品组件、组件测试、断言、route 或生产接口。

当前产品 SHA `92705c667ef8efa7dcbf7b918f7a2beb171c6699151d88feb9292d863b3539be`，组件测试 SHA `e31131d31b9eadeb1076f6cbf22c22ad93fc454353aeea38520860b684aa675a`，均与原独立实施报告一致。runner SHA `8880616240beef9d117b21ae5bb03d427be578b068f72cd019a3f038ab85cafe` 也未变。

E2E 从 `6b02091c6facb108242a08af65f9dff12a97ef66465f6a2e29d0ba84e11413fc` 变为 `2b3e7f7068822a3e0614d168ec5cf4003f584aa9dc2e29ba2e7627f7728f27ea`，差异仅三项：

- 单例外层预算由900000ms扩为7200000ms，用于覆盖已有串行准备、导航和观察；
- 页面导航显式120000ms；
- `accountGroups.create` 的 Playwright APIRequest 显式120000ms，避免其30秒客户端默认值先于规范预算终止。

这些变化没有缩短任何既有更长预算，没有更改业务任务期限，也没有删除或放宽旅程断言。

## 实际结果

预算修改前的当前源码旅程实际 exit 0、127.383秒；修改后的最终源码旅程同一 runner 实际 exit 0、70.806秒。最终 JSON SHA `9d36b5ca3ebecf9d399572db98ed5b389e8d20f1b1d3e6a93c939da303d405d8`，日志 SHA `3960f447dd9eb87dec270af923086b1af4adb28f36e2c3e39425a54d3b002403`。

本报告不覆盖或改写原 `IMPLEMENTATION_REVIEW`，不代签安装、全局 Gate或其他任务。
