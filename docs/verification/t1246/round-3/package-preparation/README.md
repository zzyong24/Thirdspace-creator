# 新开发包执行准备

只准备工具，等ROOT新干净HEAD后再采集新输入并构建。当前不复用50c7/e718旧freeze；未构建、安装或启动App。

`run-owned-round3-local-package.cjs` 基于原6483父工具，仅basic CLI显式 `--retry=0` 和回执字段 `retry0Explicit` 两处变更。原45测试/产品入口、109.68M完整预算、21.6M打包、7.2M核验、完整源/依赖/App/原e632包守卫保持。

`verify-local-artifact-v1.cjs` 文件名供原父工具消费，实际字节是20108已通过的 b66d data-filename修复版，未复用曾产生EEXIST的3482版本。真实只读挂载、内外签名、Info、11 dist/10公开copy、完整文件SHA及detach检查全部保留。

实际执行时，将上述两个工具按当前SHA复制到fresh PRIVATE同层目录，避免freeze/results写回cleanHEAD。固定入口仍为 `CREATOROS_LOCAL_SKIP_INSTALL=1 pnpm -C frontend desktop:package-local`，原headless/buildonly/adhoc环境保持；不加第二次Workerbuild。

等待ROOT给实际新HEAD后，按该父工具原 `--prepare --head <HEAD> --freeze <PRIVATE同层新文件>` 采集；ROOT及独评核新实际输入后，才一次 `--execute --head <HEAD> --freeze <新freeze> --review <新准入>`。

旧50c7已验开发包67df/887540202B已保全至唯一PRIVATE历史副本，源Downloads保持原字节及inode。完整复制及回读证据见 `PRESERVED_50C7_DMG_ACTUAL_COPY.json`。实际新包完成后按新HEAD保存唯一开发DMG副本再核SHA；不会把原30046FAIL改成PASS，也不会安装或启动App。

当前source校验与物理资源清单见 `PACKAGE_SOURCE_PREPARATION.json`；精确正逆diff见 `parent-retry0.*.diff`。资源清单只核原固定入口闭包，没有新增源码或依赖全桶freeze。
