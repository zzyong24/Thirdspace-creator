# 公共 Rust 夹具测试预算窄评

PASS_TEST_BUDGET_CANDIDATE_ONLY。

仅三处 cfg(test) 可信观察值、在绑定前严格拒非法输入，ready 后冻结且字节不能续期。现有原 body、ignore、所有生产权限/请求协议不变。

```mermaid
flowchart LR
 A[严格测试预算] --> B[自有fixture ready]
 B --> C[原公共Node完整调用]
 C --> D[真实done与原停止]
```

没有编译或运行；具体预算与新二进制仍待独立工具准入。
