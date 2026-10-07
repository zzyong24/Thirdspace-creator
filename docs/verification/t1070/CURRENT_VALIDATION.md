# T-1070 当前实际验收

用户明确：脚本一键生成文章和图文，不自动生成视频初稿；三类作品经同一个右侧编导持续精调。当前已真实完成默认分镜联合生成、文章与图文单字段精调及原生导出；视频暖画布首帧问题已查明并修复，原持久候选的真实React预览、采纳、撤销/重做、手工保存、切Tab刷新及MP4导出实际通过；本地包与安装版验收继续进行。原失败不覆盖、不以fixture替真模型，不据此关闭整个任务。

```mermaid
flowchart LR
 S[默认分镜保存版本] --> G[同会话真实Codex联合候选]
 G --> A[文章完整预览及采纳]
 G --> P[图文翻页预览及采纳]
 A --> R[编导修改指定正文，刷新及HTML验证]
 P --> E[编导修改第2卡，刷新及4页ZIP解码]
 V[真实录像] --> C[原生候选首帧从源1秒正确开始]
 C --> N[采纳到时间轴，撤销重做及手工保存]
 N --> O[切Tab刷新及5秒MP4导出]
```

| 实际链/检查 | 本轮结果 | 证据 |
| --- | --- | --- |
| 默认分镜严格保存及同会话后续Codex联合生成 | 原script artifactversion-57da6418-28精确公开读回；唯一模型POST source71/execution7eef成功，两候选完整预览、分别CAS、刷新恢复；5章/5卡完整typed候选与两原owner当前正文深等 | default-structured-history-real-chain.json；BASE/real-ui-creation-structured-history-fixed-result.json |
| 文章指定段落自然语言精调 | 唯一POST source146/af530350，v232→v244；preview前后owner未写，UI采纳后当前textarea与exact/current/刷新全文一致；实际HTML7865B原生浏览器解码正文/标题/小标题一致 | text-refinement-acceptance.json，原85件证据hash清单 |
| 图文第2卡自然语言精调 | 唯一POST source309/06f208ab，v286→v318；仅指定body变化，卡片ID与其它字段保真；宽屏4页预览、UI采纳/刷新全文一致；实际ZIP4张1242×1658 PNG解码并逐页看图 | text-refinement-acceptance.json |
| Codex原工具历史适配 | 当场SDK真实两回合RED2FAIL6PASS；最终三suite28PASS、workerbuild/types0；完整字段保序标历史、错角色/空ID/直接多媒体/未知仍拒绝，动态权限及原预算不变 | codex-history-implementation-closure.json |
| 候选恢复与素材mtime | provider刷新target=null时已加载真实output定位，错误owner不进入；原生mount UUID防counter重置碰撞，真实owner/全部前值守门；原UNKNOWN采纳重用旧body/key，不被旧revision反杀；原File mtime从saved descriptor恢复，bytes/name/type保真，未豁免mtime | root-recovered-editor-red.log / root-recovered-native-red.log / root-recovered-media-mtime-red.log → root-recovered-media-mtime-green.log（38PASS） |
| 真实滚动/弹窗/200% | 独立1366×900与1280×720滚动/正文及整卡/键盘Esc与focus通过；私有Chrome真实tabs.setZoom(2)，683×512且DPR2，send可达、无横溢，不用CSS缩放代签 | current-visual-host-closure.json；BASE/t1070-ui/actual-zoom-after-preview-result.json |
| 本任务完整frontend要求 | 30files201PASS，类型exit0 | root-final-required-front.log / root-final-front-types.log |
| LED-047交互回归 | 8files162PASS | root-led047-current-final.log |
| backend必要公共组合fixture | 5files13PASS，不代签真供应商；真实供应商另外由上述页面链验证 | root-final-required-backend.log |
| contract新native/work DTO及旧production合同 | 实际三files11PASS | root-final-required-contract.log |
| 原生frame-cache及GPU纹理版本修复交付 | 新53tests326assertions/类型/verifier0；固定基点累计patch复原710文件零差异，两build全部7产物字节相同；独立精确源码及交付复核通过 | native-pixel-version-delivery.json；native-pixel-version-final-artifact-review.json |
| 原持久candidate97真实React闭环 | 实际执行7f9650 bundle；warm0→trim1预览源frame24，owner revision4完全不写；仅一条原apply CAS→revision5、native完整tracks与候选深等；Undo6秒→Redo5秒，手工PositionX10保存revision6，文章Tab返回及刷新全tracks深等，普通UI导出对应revision7，120帧AVdecode0 | native-browser-pixel-closure-acceptance.json（独立固定报告SHA cc0ab5ba27e929cffbe9e010d86ad3a06dca8f66b141fba72769ccd095dad708）；原始媒体与逐件SHA留BASE |

旧166进入waiting_user/unsupported，未admission且原期限已过；保原ID/失败，不清历史、不续期。修复后source71是明确的一次新测试，沿同一conversation已有工具历史，非自动重发未知付费任务。测试脚本的selector、选区、chatContext路径及跨HTML标签raw-text断言错误单独保旧FAIL后纠正，不改产品洗绿。

## 保留的全局欠债与待验

- boundary仍7违规（基线5及未改live-chat-session旧2 SDK），semantic旧video-decisions-runner缺material.match；orphan0error/100warning。旧2 backend Redfox断言、旧全局类型问题不在本精确99；不把本任务回归描述为全仓全绿。
- MAIN不存在tools/timeout-policy/verify.mjs，规定命令当场MODULE_NOT_FOUND；不使用另一checkout结果冒充MAIN通过，继续登记原T-1018全局欠债。
- 旧native暖首帧source0的三个FAIL和原root-cause trace完整保留；新7f9650实际React原candidate97闭环已通过，预览MP4 SHA5ff66848b7a635a9c2b7571b7aad18c88c2d3d00a7266439e3ceac1b9c4ffb49；手工PositionX10后最终MP4 SHA7df717c048350946ad2f0d2c977ba267e68a6be38e80ca4bbdf6979e59c2cb5f，按实际平移全120帧比源24..143，min SSIM .984258。原AAC音轨尾约85ms仍记录为minor，完整decode通过不代签音频尾精确5秒或听觉质量。当前实际页面只代签本次trim与手工位置/Undo链，字幕/替换/变速等未在本页真模型逐项复验，不以原生/后端fixture代签。
- 本地安装包及安装版验收仍待完成。当前App的未保存状态尚无新确认，本轮将使用已授权CREATOROS_LOCAL_SKIP_INSTALL=1固定入口先出包，不强制替换/关闭。

本文件是当前当场证据索引，不替代SPEC/BACKLOG/Gate或最终用户验收。
