# T-973 V1.2双端流水线

用户授权版本更新为1.2.0，运行Windows与Mac正式流水线。先统一四处产品版本并提交，再于干净工作树合并origin/main，非强制推送并触发desktop-release only=all。跟踪签名公证及原生安装验证、下载产物并计算校验和。不创建tag或公开Release，不修改渠道更新配置。

用户追加要求审查稳定性与速度：检查本轮阶段耗时、缓存命中、重复构建、重试和验证路径，形成建议；本轮构建期间不修改冻结的workflow。

## 本轮结果（未完成）

版本四处均为1.2.0；补齐版本断言后42项基本测试通过。发布候选33dad57a69334dc0bbda8d50dc40b99585acac06已非强推同步main与codex/release-1.2，未创建tag/Release或更新渠道配置。

Actions运行34793812788：Windows在运行文件预算检查失败（runtime4145>3500，core2121>1500，node_modules=0）；未生成安装包。Mac第一轮Apple notarytool认证401；用户更新APPLE_APP_PASSWORD（元数据更新时间2026-09-14T00:54:14Z）后单独重跑Mac，第二轮仍401，未生成安装包。Secret名称与workflow引用一致，未读取或打印Secret值。待用户提供有效Apple认证，及确认Windows独立修复范围。

提前误触发的旧main运行34793780311已取消；正确运行在远端HEAD一致性核对后触发。性能与稳定性审查见docs/research/t973-pipeline-review.md。没有把失败流水线标为成功，未调整文件预算。

## Apple 认证已恢复（后续实测）
用户生成并更新App专用密码后，run34793812788第4次尝试的Mac job103837137091成功。候选33dad57a，Developer ID签名、notary Accepted、staple、Gatekeeper及真启动均通过。下载产物：`/Users/zyongzhu/Downloads/CreatorOS-1.2.0-mac-official/CreatorOS_1.2.0_aarch64.dmg`，SHA256 `504d0fc83b24958938a0e467dae9bfc69a927673e0684badb5dc27b6d8a6e90f`。本机hdiutil verify与stapler validate通过，未安装。
Windows独立优化已获用户授权并在T-974执行；不能将仅Mac成功表述为双端成功。Windows仍待新候选真安装验收。

## 最终完成

T-974修复完成后，main与正式候选6147d380f1cbad066d1756bab625dcabc3d8e227一致触发run34802836581，Mac/Windows均success。四处版本1.2.0，冻结前42项预检通过。新安装包下载至 `/Users/zyongzhu/Downloads/CreatorOS-1.2.0-6147d380/`；Mac本地hdiutil/stapler均通过；Windows未签名（已接受）。哈希和CI证据见docs/research/evidence/t974/release-verification.json。未创建tag/Release、未公开分发、未修改生产更新配置。
