# 资产蒸馏

用户要求或显式启用资产整理时，将确定的代码切片和问题类型整理为候选。不要求外部 project-distiller 技能存在；若可用且确有帮助，可按其真实能力协作。

1. 阅读来源、接口、依赖与许可证，不默认运行外部仓库脚本。
2. 提取能独立复用的行为，避免复制项目常量。复制和改写都保留适用的来源及许可义务，重写不自动消除这些义务。
3. 在 `decisions/assets/_candidates/<MOD-slug>/` 生成 ENTRY、必要 files 和 `example/example.test.ts`；用 `assets-runner.mjs` 验证。不要为移除所有依赖而重写已可靠的安全/协议实现。
4. 标记 `status: candidate`、`verified: false`，记录来源、完整提交 SHA、目标内容哈希和真实验证证据。

晋升只由 `decisions/assets/_candidates/README.md` 定义。本提示词不直接写 active，也不把候选当成已准入能力。
