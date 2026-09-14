# T-973 V1.2双端流水线

用户授权版本更新为1.2.0，运行Windows与Mac正式流水线。先统一四处产品版本并提交，再于干净工作树合并origin/main，非强制推送并触发desktop-release only=all。跟踪签名公证及原生安装验证、下载产物并计算校验和。不创建tag或公开Release，不修改渠道更新配置。

用户追加要求审查稳定性与速度：检查本轮阶段耗时、缓存命中、重复构建、重试和验证路径，形成建议；本轮构建期间不修改冻结的workflow。

## 本轮结果（未完成）

版本四处均为1.2.0；补齐版本断言后42项基本测试通过。发布候选33dad57a69334dc0bbda8d50dc40b99585acac06已非强推同步main与codex/release-1.2，未创建tag/Release或更新渠道配置。

Actions运行34793812788：Windows在运行文件预算检查失败（runtime4145>3500，core2121>1500，node_modules=0）；未生成安装包。Mac第一轮Apple notarytool认证401；用户更新APPLE_APP_PASSWORD（元数据更新时间2026-09-14T00:54:14Z）后单独重跑Mac，第二轮仍401，未生成安装包。Secret名称与workflow引用一致，未读取或打印Secret值。待用户提供有效Apple认证，及确认Windows独立修复范围。

提前误触发的旧main运行34793780311已取消；正确运行在远端HEAD一致性核对后触发。性能与稳定性审查见docs/research/t973-pipeline-review.md。没有把失败流水线标为成功，未调整文件预算。
