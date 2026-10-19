# T1115 默认初始化及执行预算修复的实际验收

本次只改 backend Vitest 的默认 test/hook 预算和同一归档入口两个显式 it 预算，统一为有限的 120000 毫秒。测试正文、权限、归属、竞争、事务、幂等、退出码、数据库工厂、产品代码和当前安装包均未改变。SPEC 独立初审为 PASS[REV:61382e511aa5]；源文件、SPEC、模块配置与完整对账开始前冻结的 SHA 一致，实际提交底本为 82e235f7077e3094c0e04121143b7fce865adedf。

原归档入口当场退出1：55PASS、4SKIP，lease beforeAll 的 createDb 在默认 10000 毫秒超时，四项断言没有执行。修复后同一原命令不加 CLI 预算覆盖、不加 retry，59PASS、0SKIP、退出0。相关稿件保存 backend 44PASS、frontend 5PASS，均0SKIP；backend typecheck、diff check、boundary、semantic、orphan均退出0。完整命令、UTC 时间、时长、退出码和日志 SHA 见 current-evidence.json。

完整 reconcile 在 2026-10-09T08:56:44.397654Z 开始、09:24:09.489932Z 结束，1645.066565秒，真实退出1，41error/0warning，日志 SHA256 bf20c0f903ee7449fb654033fa8b134ff44198027843196f783923b21a9f01bd。与 T1114 的43项错误逐条比较，只移除 LED052、LED027，未新增错误，其余41项原样保留，详见 global-comparison.json。不能写成全局通过或全功能完成。

经独立复核的私有单次日志捕获只保存两个原 execSync 命令的 stdout/stderr；没有改命令、cwd、env、预算、返回或异常，没有注入子进程。完整对账中 LED052 原命令真实59PASS/0SKIP/退出0；LED027 原串行命令 backend44PASS、frontend5PASS/0SKIP/退出0。其事实不证明 T1116 历史未保存的内层原因。

超时规范动态七套测试全部通过，共166例；原静态27项失败仍退出1，其五字段投影与 T1080 保留记录完全相同，继续关联 T1081。其余历史审核、任务看板、发布和公共链失败关联 T1101-global-gates 及对应原任务，不删除检查、不补拍历史证据。

本任务属于测试预算修复，不需要重打产品包。已安装 App 与 Downloads/CreatorOS-1.2.0.dmg 仍是源码54af33d0的实际产物。没有触碰用户数据库、原媒体、凭据、模型任务或正式发布。没有把本次测试当成原生界面、扫码、采纳或 Pi 联合创作验收。

最终独立实现复核已完成：PASS_LIMITED_T1115_SCOPE_COMPLETE_WITH_RETAINED_GLOBAL_FAILURES，findings=[]。报告及JSON逐字复制于本目录。允许只完成本任务，范围外41项及T1116历史根因UNKNOWN继续保留；实际完成状态由taskctl审计事件记录。
