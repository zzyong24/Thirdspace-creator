# T-1072 全局提交钩子修复

只替换本机 `~/.config/git/hooks/commit-msg`；全局 core.hooksPath 与两份 Git LFS、ThirdSpace post-commit 钩子保持原字节/权限/归属。备份在 `/Users/zyongzhu/.config/git/t1072-0mqy07ml/backup`。

旧脚本实际35失败/3通过，新脚本相同38例全部通过；测试覆盖真实Git提交与配置分发边界，工具夹具不代签供应商。官方Lefthook2.1.4发布校验和验证后仅在临时中性仓库执行，成功Git返回0，子检查失败阻断Git/保持HEAD，空格参数及消息读回、钩子未被自动重装；未装入PATH或项目依赖。独立候选复核PASS，仅准单文件替换。

新全局脚本已安装；本仓真实提交4eedd433实际返回0、stderr为空，Git Trace证明commit-msg调用一次且退出0，失效路径提示已消失。当前另外三份钩子再次读回与备份字节一致，未修改客户端。

pmem sync实际0后运行reconcile，实际exit1、37错误/1告警；完整输出SHA与T-1071保留日志完全相同（ff95de5787927c16835d0101ec144e975f066133317a455d69dfd96ce84cc3e0），无新增错误，既有T-1018/T-1015债务保留。期间仅登记后续AI只读任务T-1074和纠正本非UI维修验收类型，产品和测试未改变；不声称全仓通过。原失败和注册纠正保留在result.json。本任务按独立环境修复范围完成，原T-1071客户端验收及后续AI任务不代签。
