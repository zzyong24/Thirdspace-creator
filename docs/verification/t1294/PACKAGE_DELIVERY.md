# 本地包已安装并打开

本轮固定命令 `pnpm -C frontend desktop:package-local` 实际exit0，冻结候选为main的 `8bbbe79d01f5b2c1f16503277f3fb922a647076a`。构建前后Git工作树干净；本页及交付JSON随后单独提交，不更改包内代码。当前只保留主worktree。

- 安装包：[CreatorOS-1.2.0.dmg](/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg)，850,592,185字节。
- SHA-256：`cd8ae600910ccfdd2be1ff222ef62bdbb59c06c61701bb3b3e624253f1f0cb04`。
- `hdiutil verify` 实际exit0、checksum VALID；4文件45项打包基本测试通过。
- 已替换并打开 `/Applications/CreatorOS.app`；PID19794、服务PID20059，持续存活。安装二进制SHA与本轮build attestation完全相同。
- `codesign --verify --deep --strict` 实际exit0，签名为本地ad-hoc；未做Apple公证。Windows未构建，GitHub run无。
- 实际已安装服务 `127.0.0.1:56853` HEAD响应HTTP200；script-src有wasm-unsafe-eval、没有JS unsafe-eval，完整响应证据见 [INSTALLED_HTTP_CSP.json](INSTALLED_HTTP_CSP.json)。新资源tarSHA与运行目录stamp相同，旧App/服务PID已消失，没有只替换外壳而继续加载旧资源。
- 用户App数据目录与激活保留，没有reset；正常启动写入不被说成零写库。旧DMG回退备份仍保留。

功能验证与限制见 [RESULT.md](RESULT.md)：正常完整浏览器两轮各10项通过，含真实本地Codex对话；视频V1/V2/V3实际制作与原生导出留有音画文件证据。该结果不等于原生App全功能自动化验收：用户暂不授权原生自动化，Windows和真实付费官方模型未验证、Growth新服务未部署。全局对账29项旧债继续保留，未签全项目全绿。软件GPU旧黑片、AAC padding和上游间歇账户读取具体根因仍有准确限制。

本次清理9项旧测试目录/诊断副本，逻辑163,937,268字节、allocated165,040,128字节；磁盘空闲差不作为等量物理释放保证。保留严格复跑依赖、2份小源片、全部失败/截图/日志、新包及旧回退包。删除前逐项复核原始marker SHA、UID/nonce、文件归属、无symlink、PID/port/打开句柄。两次前置校验因owner候选投影额外字段停止，均删除0；未确认的static目录保留，未盲删。详见 [CLEANUP_RESULT.json](CLEANUP_RESULT.json)。

本次没有push/tag/GitHub Release/公开分发、Growth或Activity生产变更。完整候选、产物、签名和运行记录见 [PACKAGE_DELIVERY.json](PACKAGE_DELIVERY.json)。
