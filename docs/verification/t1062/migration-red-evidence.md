# 旧迁移跳过问题：当场隔离复现

2026-10-05。冻结原SQL：root125bc864、diagnosticc5316506、canvas55a526d6。使用本机实际Drizzle0.36.4/PGlite0.2.17，在/tmp四份全新内存库按原journal建基线，再运行按原when排序的三源union。没有改历史SQL、没有用户资料、没有产品源修改。

root旧库升级后仍缺creative_canvases/creative_results/work_compositions/production_media_requests；canvas旧库仍缺account_groups及三个新领域表。fresh和diagnostic基线能建出这些表，但这不是全部列/约束/原ID/行数/二次启动/备份/并发的验收PASS，也没有执行产品createRuntimeDb或安装版。

这是本次兼容收敛实现前的真实红证据。来源脚本、当场输出及结构化结果邻接保存，不回溯编造旧TDD证据。最终修复必须走产品公共启动链与四个含历史行/引用的隔离基线，再证明幂等和数据保留，不能只以此表存在probe洗绿。
