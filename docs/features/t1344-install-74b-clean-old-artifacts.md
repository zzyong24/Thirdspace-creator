# T-1344 安装74b新包并清理旧安装与可删除旧产物

用户明确授权：“你把新的安装包给我安装好，然后把旧的卸载掉，把旧的那些东西都清理掉。”

本任务仅为本机安装与清理运维，沿用T1293边界，不变更产品代码、设计、服务合同或数据归属，不重新打包；不复跑与安装无关的全局reconcile、TDD或产品回归。技能与vendor均3.29.0，路由为既有交付物SHIP本机安装。父T1300的旧凭证阻塞不阻断本项明确授权。

安装来源：74b03effa508e793712de3be738c0b518ed7117b；DMG为`/Volumes/T7-MacData/CodexBuilds/t1300-final-20261018-74b03effa-script-bare/candidate/CreatorOS-1.2.0.dmg`，846966271字节，SHA256 `ef1b6c590076db387f5055e168e7d96de1a5b2adf0a996054c2278d6a4a6225f`。App二进制SHA256 `83ac284a283a0c0cc0677983bb1148925c643af8739b3cc06354c2d5455c22a9`；sidecar.tar SHA256 `f5ffca8f9b6496f9d3443517f5005b19b5be5c0b08d83fc7cf62b2ee5bb1ba18`。这是本地ad-hoc签名包，不声称公证。

先只读核现有正式App、进程启动路径、正常退出支持、数据路径元信息及DMG摘要。新包只读挂载、验证签名，在/Applications同卷暂存复制后比对摘要；无活跃业务或未保存提示才正常退出旧App，保留旧App备份至新App启动成功。正式替换并正常open，只观察本次MAIN_PAGE_LOAD_FINISHED及sidecar等可信标记；至少120秒，外层容纳冷解包，不重复发起启动。核正式进程与解包runtime匹配，不声称UI点击验收。

成功后移除本次暂存和旧App备份，卸载本次DMG。更广清理由独立只读清单与Root复核后按精确路径执行；保最新DMG、用户账号、激活、模型设置、项目、素材、数据库和日志证据。系统拒绝保留真实错误，不绕过系统保护，不开启Automation Mode，不运行模型、充值或外部业务。现有foreign dirty原样保留，只提交本轮自有运维工件与本任务看板增量及taskctl事件。

验收：正式安装hash和codesign通过；真实进程与本次主页面/sidecar启动标记；清理精确清单/剩余路径；用户数据保留元信息与foreign hash保护；taskctl事件留痕。若有活跃业务、未保存提示或系统拒绝则先报告，不强杀。

```mermaid
flowchart LR
 A[核对新包] --> B[同卷暂存]
 B --> C[正常退出旧版]
 C --> D[正式替换并启动]
 D --> E[启动证据通过]
 E --> F[清理旧App及核准旧产物]
```
