# T-1021 方案与本地预览验证

日期：2026-10-04。范围仅为已生成素材、SPEC与HTML方案原型；没有生产实现，也没有为本轮补拍TDD、数据库或供应商验收。

## 真实证据

- 实际调用图片生成并逐张查看14张结果：6张公共封面1086×1448，6张公共图文预览板1942×809，2张使用本人身份参考的私人横竖封面。原输出保留，复制到工作目录；未程序裁切或修改图片。
- `templates.json`的12个公共条目全部对应可读PNG，读取PNG头核对尺寸；没有用一张预览板冒充3个正文文件。
- ZIP逐项列出并验证12张PNG及3个说明/配置文件；`testzip()`无损坏；没有private/或real-ip图片。
- ego-browser TaskSpace 8、p2实际UI旅程：修改封面收藏名称、提示词与比例16:9→收藏→切换我的收藏→刷新→再次进入收藏，服务端未接入情况下准确回读本浏览器保存的名称、提示词和16:9。删除验证项后真实0收藏；原模板还存在。
- 图文教育风格收藏后，切封面库显示0、切回图文库显示1，证明本地原型不串库；验证用风格已删除。
- 筛选宠物图文显示0样图与真实空态；筛选教育显示1张实际预览板，不虚构各行业覆盖。
- 点击下载生成配置触发浏览器真实download事件；公共ZIP文件存在，包含的位图路径与配置一致。
- 默认桌面1716px与900×700窄窗口实际截图；窄窗口`scrollWidth=innerWidth=900`，当前显示图片均complete且naturalWidth>0。截图仅证明原型展示，不证明正式CreatorOS桌面E2E。

![桌面图文库](research/gallery-xhs.png)

![窄窗口本地收藏](research/gallery-minimum.png)

## 评审与局限

独立只读审查首轮两个major问题为图文合同不完整与身份输入降级矛盾，receipt `CONCERNS[REV:8a7deb394b52]`。补齐合同与验收旅程后，同一独立上下文复核销账，第二轮`PASS[REV:8618b59024af]`。`reviewctl context T-1021`显示当前SPEC与该回执一致、changed_line_refs为空。该PASS不是保存范围确认或生产Gate。

本轮定向`git diff --check`通过。尝试`reviewctl audit --backlog BACKLOG.md --task T-1021`时，脚本没有task筛选，会执行全局审计；真实结果失败，包含T-915/T-859/T-858等历史receipt hash过期，以及旧任务的constitution漂移。T-1021没有出现在失败列表；既有根因任务T-916已登记工程/历史receipt漂移。不能把此次全局审计称为PASS。

私人收藏按当前账号隔离或本人跨账号共享的选择仍待用户回复。正式共享contract、真实收藏服务、项目图文交付物、模型输入、多页恢复、CreatorOS真实生成/采纳/导出、TDD及完整Gate仍待实现与验收；任务不标记完成。

## 用户纠偏后的接入核对

- 现有项目publishing阶段路由直接redirect到项目稿面#publish；原PublishPackSection及PublishPackageCta为接入点。旧独立HTML工作区方向已撤回，未新增导航或恢复已退役阶段页。
- 原publication_drafts由AI候选经Publishing端口采纳为Publication与Revision；本轮SPEC撤回另建Assets图文交付物，改将图文正文、图片与页序纳入原发布版本，补原子当前版比较、完整摘要与持久幂等来源键。
- 正式图片模型选择须绑定原settings返回的真实配置ID，能力投影与执行共用backend端口，恢复沿冻结身份。该合同已更新；尚未实现，不能称为请求已传递。
- 通过creatoros --version/help确认当前用户CLI可调用，但status/access status返回CONNECTION_EXPIRED。因此本轮没有通过已安装应用取得真实项目截图或执行模型任务，不冒用素材页截图作系统验收。未强制退出正在使用的桌面应用，也未通过私有数据库或连接文件绕过。
- 私人收藏范围仍待确认，生产实现和完整Gate仍待完成。

本轮更新SPEC完成第三轮独立复核，`reviewctl record`实际返回`PASS[REV:f0f3fa0ff91b] (0 open)`；模型配置绑定及Publishing原子采纳缺口已补充到合同。此PASS不代表生产代码、收藏归属、UI视觉或真实桌面旅程已通过。定向`git diff --check`通过。
