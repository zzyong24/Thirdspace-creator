# T1046 原生采用后的派生时长一致性

上游 project-manager.saveCurrentProject 每次更新 metadata.duration。getProjectDurationFromScenes 选择 truthy isMain，否则scenes[0]；calculateTotalDuration遍历该scene全部overlay/main/audio取 startTime+duration 最大值（120000 tick/s，空为0）。后端只patch tracks导致同次采用后上游自动保存与后端document.duration不一致。

修复仅在 applyNativeRoughSuggestions 完成原轨道patch后，机械重算同规则的metadata.duration；保留updatedAt/name/其他metadata、独立tracks及其他scenes。旧receipt/版本不重写。

- native-duration-red.log：真实4 FAIL/13 PASS，含公共native采用缺duration。
- native-duration-green.log：3文件18 PASS，覆盖第一scene/isMain/全部独立轨最大尾点/空工程/metadata保留/输入不变；公共原source→formal skill worker settlement→确认采用；latermanualsave后原receipt重放保持历史JSON和后来current revision/题名。
- native-duration-types.log：后端全局旧错误保留；改动3文件无类型错误。
- delta：/tmp/t1046-backend-work/t1046-native-duration.delta.patch，hashes native-duration.delta.hashes.json，共享root git apply --check PASS。

已保存旧25→26采用receipt不补写新duration，复验须正式保存当前工程或执行新的明确采用commit；不能重放旧请求期待新版。
