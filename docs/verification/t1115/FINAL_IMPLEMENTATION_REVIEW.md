# T-1115 最终独立实施复核

- 复核时间（UTC）：`2026-10-09T09:26:24.834203+00:00`
- 结论：**PASS_LIMITED_T1115_SCOPE_COMPLETE_WITH_RETAINED_GLOBAL_FAILURES**
- Findings：`[]`
- SPEC：`dd00528cef1f1ed9515db739ff0dd5e1c40fbf85c8e4e5fba449d224be8eae8b`，初审 `PASS[REV:61382e511aa5]`

## 实现核定

相对底本 `82e235f7077e3094c0e04121143b7fce865adedf`，可执行差异只有：

- `backend/vitest.config.ts`：默认 `testTimeout` 从 30000 改为 120000，并新增 `hookTimeout=120000`；当前 SHA `26ad26c6023af5bc97902b670c26aad8938af0a390541d78fd0ca6bc3b432e07`。
- `startup-group-collectors.postgres.integration.test.ts`：两个真实 SQL 锁竞争用例的第三参数从 30000 改为 120000；当前 SHA `969c43578cc96a84ac8714c194443efa24fce531c73203f0c3bf2b8706a544e3`。

测试正文、断言、SQL锁采样、释放、清理、产品任务期限、原wrapper、隔离PG和 `maxWorkers=2` 均未改变。SPEC 独立初审先于代码修改，冻结哈希与当前字节一致。

## 实际结果

原入口 RED 为 55 PASS / 4 skip / exit 1，失败在 lease `beforeAll` 的 10000ms hook；修复后同一原命令 59 PASS / 0 skip / exit 0，未加CLI预算或retry。完整reconcile内部原LED052为59 PASS，LED027为后端44 PASS+前端5 PASS，均0 skip/exit 0。backend type、diff、boundary、semantic、orphan均exit 0。timeout动态166例通过；静态27项仍exit 1，其五字段与T1080保留记录完全一致，没有豁免。

## 完成与全局边界

T-1115 可以独立完成。完整reconcile仍真实 exit 1、1645.066565秒、41 errors/0 warnings；相对T1114的43项只移除LED052与LED027，没有新增错误，其余41项逐行不变，并与T1112原41一致。完成证据必须明确保留这41项、T1081静态27和T1116历史LED027内层原因UNKNOWN。

本结论不证明全局/全功能通过，不代签T1116根因、原生UI、Pi联合候选或安装版更新。当前已安装App仍是source54af33d0；本测试配置任务不要求重打产品包。

完整SHA与边界见 `FINAL_IMPLEMENTATION_REVIEW.json`。
