# T1125 私有冻结 helper 独立实现复核

结论：**PASS_LIMITED_T1125_PRIVATE_HELPER_SCAN_ONLY**，未发现未解决实现问题。该结论只证明私有 v2 helper 的代码与本次 scan-only 运行满足已审约束；当前工作树不干净且 receipt 明确 `buildFreezeAuthorization=false`，不能代替最终 clean 冻结或授权构建。

## 实际结果

- self-test：exit 0，3文件6条命中接受，18种未知或变更组合全部拒绝。
- full scan-only：exit 0，11.186秒；7172个changed blob全部扫描且路径唯一，13088个tracked source重新哈希；3文件6命中被精确分类，密钥形状finding为0。
- `reviewedSourceHead`与current HEAD均为`ec5fa6a851b4a660eabb10d064b968e66baa026d`；三fixture OID逐项一致，`ec5..HEAD`五个产品/工具根差异为空。

## 代码复核

候选保留原五条模式、敏感文件名、20MB/NUL文本边界、四版本、source8、clean/diff和全部tracked hash。fixture只在exact path、完整source SHA及完整match数组同时相等时分类。批读取以HEAD `ls-tree`取得期望OID，逐ACM路径验证blob类型、header OID、声明大小、实际读取长度、对象内容OID、总数、批处理exit和扫描中HEAD稳定。

self-test逐文件覆盖未知路径、字节追加、行位移、缺match、额外重复match及额外未知形状，未使用目录、vendor、Rust或`cfg(test)`宽白名单。原helper保持不变。

## 边界

本次仅scan-only，`clean=false`，明确不授权构建。最终必须在无产品/工具源码漂移的clean HEAD执行非scan-only模式并生成新的冻结receipt；本报告不签打包、安装或全功能。
