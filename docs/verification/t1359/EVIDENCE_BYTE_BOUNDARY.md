# 原始证据字节与文书检查边界

第一次完整staged diff-check实际exit2，原输出保STAGED_DIFF_CHECK.txt：仅三份原始unified diff工件的context空行含单个空格，以及其中一份diff的原EOF空行。没有修剪原diff、改hash或改写原审阅记录，也不称这次完整检查曾绿；真实产品源码没有新改。原检查stdout自身也逐字含这些context空格。排除三份原始.diff及其原STAGED_DIFF_CHECK.txt后，其余staged工作流文书实际git diff --check exit0；不替代完整原FAIL，也未修改这四份原字节。

|原工件|原字节SHA256|
|---|---|
|docs/verification/t1359/review/round2-SPEC.diff|`bc9a9ecbfaf3b2781b973faf6f28d596f8fc7b675adc50b32be1cd1bf5058104`|
|docs/verification/t1363/implementation-review/PRODUCTION.diff|`dc3d0c3ef34a924ba580dc32e9cbfba5b5d118a5180181b065af0147160a81fc`|
|docs/verification/t1363/spec-review/round-2/SPEC.diff|`49fc78d9341f5533bd131d81fe3a8be2cc6d4b988bd59bd1428ed600cf500007`|

第一轮stage guard采集使用非-z git文件名导致中文路径被quote后字符串不等，原index实际仍在白名单。改为git --name-only -z读取真实路径，当前guard已证明79项差异只来自允许文件（后续此说明/guard自身另纳），foreign9未stage且SHA全等、T1255工作行未变/索引保原HEAD行。没有为修采集器重跑产品Gate。
