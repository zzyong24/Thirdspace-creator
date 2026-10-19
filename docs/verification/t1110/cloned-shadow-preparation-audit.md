# T1110 已完成影子准备的独立只读复核

评审时间：2026-10-09T15:39:04.199769+00:00。评审基线与复核首末 HEAD：`88b663a6d445a242c9c34aa14db68c4fac1ef6b3`。

结论：本次实际影子准备的依赖隔离、source/HEAD一致性证据成立；QA准备器外层预算仍有一项待修复缺口。此收据不签页面、Chrome旅程、真实绑定或采集PASS。

## 范围与来源

唯一输出为本文件。只读已提交QA脚本、PAGE_SPEC、指定manifest、限定依赖目录的lstat/realpath、声明sourceWitness代码和重base启动脚本；未运行clone/helper/Next，没有HTTP访问31410/31411，没有操作Ego/Chrome，没有读取PGlite/auth/runtime、Cookie、浏览器profile、真实用户库或原私人报表。

实际准备由主任务执行；本评审没有重演该准备过程。manifest路径：`/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/creatoros-t1110-shadow-FqdGW5/shadow-manifest.json`，SHA256：`7956d8494c18edb1d54e35cff7c44c1488ba488736a0fbe7ddc646bf768befff`。影子canonical根：`/private/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/creatoros-t1110-shadow-FqdGW5/source`。

评审实际读取的已提交文件SHA：

- `docs/verification/t1110/browser/materialize-shadow-dependencies.mjs`：`86f1db54eb7a04230380fedb020673d8829fe5988ad33f5e9c8196ea3562ed99`
- `docs/verification/t1110/browser/prepare-next.mjs`：`83ecf8846d6865991340fe9babee11996ac5ac88c416ba5f1f7c71b1a3daa243`
- `docs/verification/t1110/browser/start-shadow-next.mjs`：`f5ff6356b2b0cbd9e35e9e883c943a2b4d0c1bd4cf6d7a7817500956c4903dbf`
- `docs/verification/t1110/browser/execute-ego-journey.mjs`：`fbabf2bfb252d3282532f1ecd9f17c06518608ce7a3f72605a51471e8132c7d8`
- `docs/features/t1110-wechat-browser-collection.PAGE_SPEC.md`：`f3932b82655e9d73c9fb2aa6dbc03e91644cf94559eb03ca176e7991c21206bb`

## 已复核的实际证据

1. manifest的`head`、`headAfter`及本评审开始/结束实时HEAD均为上述完整commit。16项`sourceWitnessBefore`与`sourceWitness`完全相同，16项实时正式文件SHA全与记录一致。相应影子文件全部一致；只有声明的persistence-client composition副本使用声明的afterSHA。该副本beforeSHA为`2957795108ade0ac774b91b20efe1abc4721b24395864e9b347cd7331547d6ef`，afterSHA为`3f9739fb614f625b5ae260d24e50d1b3b73cb5781d19ec43a99ef3db6edb20e0`。正式Next config、SSR页面、dispatch、backend service/归属守卫、tokens/styles均保留对应源SHA。
2. 源依赖首末均为106220个regular、4986个链接、243个.bin shim，2042118193字节；首末treeMetadataSHA均为`aba59cc859d5c5415f3fa385519aed14575b9417187072e8dbcd09389622ab73`。独立完整bounded元数据重扫得到同一摘要；关键依赖文件SHA首末相同。
3. 影子依赖独立bounded重扫：106220个regular、4986个链接、243个.bin shim，2042146837字节；treeMetadataSHA为`d46cdde74ff2b48fcbcf25f9fde8d5cba05b4ea4831f561d7a847e061be6ae3b`，与manifest吻合。对每个regular与原对应文件比较dev/ino，0个共享inode。4986个链接均realpath成功；0绝对链接、0逃根链接、0broken链接。6个@creatoros workspace链接均指向影子对应backend/contract/ai-worker包。
4. 全部227个rebasedFiles的源beforeSHA、影子afterSHA逐份重新核对，0差异；`.bin/next`afterSHA为`5fc3825554e45b1bb705d2682deb1900c719b0e50b563ef1e1825aa4f63cb643`。这些文件的实际字节增量合计28644字节，恰好解释影子与源regular字节差。Next包版本16.2.9、package真实路径在影子根内，package SHA沿原安装保持。此处只证明位置与选定文件内容，不把Node.resolve合格当作Turbopack编译成功。
5. helper已经纳入PAGE_SPEC机器块`watched_paths`：`docs/verification/t1110/browser/materialize-shadow-dependencies.mjs`。prepare/start/execute/service-fixture/journey同在该机器监视清单，1366×900与1024×800及required_conditions仍保留。
6. 实现使用macOS`/bin/cp -cRpP`，不追随相对链接，不install，不扩大turbopack.root，不注入新Next config。独立inode是真实检查结果；没有检查文件系统物理extent，因此不声称实际用了CoW而非cp正常复制回退。没有对所有第三方regular内容逐字节SHA；全目录检查范围是metadata/inode/links，另核关键package/lock和全部重base文件SHA。

## 唯一发现：准备外层预算未覆盖所有显式串行调用

[P2] `docs/verification/t1110/browser/start-shadow-next.mjs:11`调用prepare的960000ms上限仍短于当前正常路径的全部显式内层预算。`prepare-next.mjs:11`的git()每次120000ms；正常路径有首末rev-parse与首末status共4次；archive与tar各120000ms；5次cp各120000ms。

| 内层串行步骤 | 明确预算合计 |
| --- | ---: |
| 4次git检查 | 480000ms |
| archive + tar | 240000ms |
| `.pnpm` + 四包cp | 600000ms |
| 当前显式内层总计 | 1320000ms |
| 当前prepare外层 | 960000ms |

因此外层可能在各内层仍处合法预算时杀死准备器。此静态缺口不否定FqdGW5本次已成功完成的准备证据。建议root唯一writer至少改为1440000ms（1320000+120000校验/manifest/收尾余量），或统一传递prepare剩余期限使内外预算相容；不缩短现有两分钟单步预算。`execute-ego-journey.mjs`的7200000ms只覆盖已提供server-state后的Ego旅程，不包含prepare/start，因此不能补足此缺口。

Next启动观察480000ms仍属于准备后的独立步骤。本收据没有验证其实际HTTP结果、编译结果或终态。主任务正在编译的事实不由此独评签成成功。

## 留待主任务实际验收

完整Next页面HTTP200与SSR交互、公共dispatch、双视口真实Chrome视觉/操作、真实绑定恢复、平台真实采集仍需分别记录当场结果。代表报表与执行fixture继续明确`fixture-only-no-platform-proof`，不证明真实身份或平台Cookie有效。准备层复核不得替代上述Gate。
