# T-990 双端正式构建记录

候选与远端main：`7e27960364a5bae392f8a07d73f4f765119e670b`，版本1.2.0。
运行：[34932675118](https://github.com/zzyong24/Thirdspace-creator/actions/runs/34932675118)。最终整体failure：Mac success，Windows failure。

## 候选与预检

本地78ad7afc与origin/main ca7bf1f7普通合并。只发生BACKLOG新增任务块及events追加记录冲突，合并保留双方记录，无产品代码冲突；主工作区未提交内容保留未入包。独立工作区冻结、四处版本均1.2.0、42项官方打包测试通过。新增差异的私钥/常见token字面量扫描无命中。非强推同步候选分支和main并fetch证明一致，only=all手动触发，仅一次。

## Mac

job104264011252成功。日志实际输出：Apple notary Accepted；staple成功；Developer ID/Gatekeeper/DMG内应用严格签名通过；T975安装引导布局、背景与Applications入口存在；T705归档解压签名通过；T663真实启动并加载首页通过。artifact `desktop-darwin-aarch64`，ID10382247580。

CI attestation：源码SHA与候选相同，DMG预期SHA256 `f89d9965f6dea97b390f71e6749db67e60067b294f2555914772f67c44a926e9`，487979980 bytes。真实签名与公证均为true。实际下载校验通过：`/Users/zyongzhu/Downloads/CreatorOS-1.2.0-34932675118/CreatorOS_1.2.0_aarch64.dmg`，SHA256与上述CI attestation完全一致，`hdiutil verify` VALID。没有覆盖当前本地测试版应用。

## Windows

job104264011297失败，未生成可安装exe。Next源码编译90秒成功，Running TypeScript阶段V8约2GB堆耗尽，exit134。不是签名或安装启动失败。没有重跑或修改冻结代码；独立修复范围登记T991。

## 全局边界

本轮reconcile LED047/048/049/050通过，保留既有T916共233条工件漂移。未创建tag/Release，未修改生产下载或Growth/Activity配置，未公开分发。此次没有新的Windows安装产物，不可把旧包当本次结果。

## T991 后续解除阻断

用户明确授权独立修复后，Windows构建内存预算修复5a5f61dd，run34935220088最终success，实际类型检查58秒完成，安装/启动/卸载通过。详见[t991验证](t991-windows-memory.md)。原run34932675118仍是Mac成功/Windows失败的历史结果，不改写；双端产物源SHA分别为7e279603（Mac）与5a5f61dd（Windows）。
