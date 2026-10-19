# T1119 核对类型检查与开发浏览器共用Next生成目录竞态

用户要求发现问题登记task及时修复。当前T1117原类型检查已实际exit0（332.495936秒）；之后仅修浏览器新增采证代码，再次类型检查与原dev浏览器同时运行：2026-10-09T10:15:34.293853至10:17:28.297817 UTC，exit2/114.002229秒，log SHA4100952e86130251e689eff5f75c6701e4d381351a1695e782b4151396ea1f2d。失败文件是.next/dev/types/routes.d.ts与validator.ts，TS1109/TS1160等生成语法错误，非产品文件诊断。

真实typecheck命令为next typegen && tsc --noEmit；Playwright同树启动next dev，两者共享.next/dev/types，根会话此前将它们误当独立检查并行。生成目录当前字节取副本只作为事后观察，不伪称捕获了报错瞬间同一字节或已证明全部来源。先保留原错误与命令时间，在本轮浏览器退出后串行执行原typecheck；不删产品断言/缩短预算/改变next或tsc退出码，不删除缓存洗绿。若串行仍报生成语法错，再取得独立SPEC与复核修真实消费者；当前不改生产、frontend配置或仓库runner。只有原串行入口实际通过后，才能写本次验证入口恢复，不代签全面并发或其它会话。

## 限定维护方案（提交独立复核后实施）

阶段4-build，维护本机验证环境，不改产品/配置/测试断言或Gate。串行原入口仍真实exit1/68.458213秒、相同两个dev生成文件语法错，log SHA335e04cd164dde8f40511a628c7f3ea31fa811eacbc3c84a711e535f62c2f6cc。已读本机Next next-typegen源码：生产phase生成.next/types，dev生成.next/dev/types；tsc同时消费两份。不能继续称两个命令都写同一文件，也不能把串行失败抹掉。生成文件尾部实际拼接重复声明，完整副本及SHA保留。原因归到生成/读取环境，确切写坏源头尚未锁定。

只允许在确认本树没有next dev写者后，将两份损坏的本机派生文件.next/dev/types/routes.d.ts和validator.ts按当前SHA校验、原始字节保存到0700验收目录后移除。闭合集为这两个文件，拒绝symlink、路径漂移、SHA变化或仍有dev写者；不清整树.next、不删库/媒体/项目/类型源，不手改生成内容，不改tsconfig。随后原next typegen && tsc必须实际执行，且.next/types两对应产物非空；最后原浏览器会由实际Next dev重新产生dev两产物，浏览器结束后再原typecheck并核它们非空且原tsc包含路径没移除。任何仍失败保留，不重试洗绿。本地准备脚本仅私有目录，日志/诊断/任务审核与审计为唯一仓库写集。没有App或DB备份/构建变更。

验收：真实两次失败、删除前两SHA与非空复制、闭集/当前无dev证据、原完整消费者type绿色、dev实际重新生成与最后类型复验、独立最终限定复核。只可声明本轮验证环境恢复，不代签生成器并发稳定性/全功能或原历史写者。

## 正式执行绑定（REV-001整改）

新增唯一验收辅助入口docs/verification/t1119/generated-types-check.mjs，模式prepare / verify-production / verify-development。prepare必须实际lsof限定当前树cwd的潜在Next dev写者（判不清拒绝）、两文件lstat非链接/realpath在当前树的闭集、读取并保存0700私有原字节+SHA、移除前再查写者与SHA，才允许unlink这两个派生文件。现有生产/开发源与tsconfig不改。verify-production核原typegen生成的两prod产物非空；verify-development核原公开浏览器Next dev产生的两dev产物非空、原tsconfig仍消费dev路径，最后原typecheck实际成功，不能仅以helper通过代替。所有原日志/新保存时间与SHA进入私有目录，仓库仅加入该helper及本任务文档/actual receipts；helper不执行模型/库/媒体或删除其它文件。

modules正式顺序明确prepare→原typecheck→prod非空→原run-journey→dev非空/原include→原typecheck→pmem/reconcile，直接执行本任务自己的原浏览器消费者，不借T1120或其它任务的PASS。两任务没有完成状态循环：T1120仅校准原测试观察，T1119仅维护派生环境；均引用同一个已有可执行公共流程并独立报告实际共同调用发生的时间/SHA。独立复核绑定本新增完整命令集，生成源代码副作用还需最终只读审核。
