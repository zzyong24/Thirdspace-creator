# T1110 内置真实DOM witness补齐方案只读独评

2026-10-09；工作树 /Users/zyongzhu/.codex/worktrees/canvas-binding-fixes/Thirdspace-creator；HEAD b1f0cc5462285e59531a329a42340abe84c8d0ac。SPEC SHA256 cc4c7976146dadb0aafe264780344dfcf509c78cb5ff4c35d02c2a687f46996d，当前有效补充收据 b6b7772b74ff。本人仅读SPEC、接口及测试；真实DOM/请求的事实来自root当场观察消息，本人未操作空间20、用户库或Cookie，未读取私人身份文件。

**结论：所述内置witness属于已批准实现范围，不需要因这次补齐改写SPEC或启动新范围复评。** 当前SPEC §3.1:31要求普通页真实稳定身份且允许优先选取；§3.2:40要求按真实日期保存、明确statisticsDates/publishedDates；§4:59允许公众号当前DOM原生href、§4:61要求视频号真实日期/行数就绪而不是标签；AC01/02已要求实际identity witness与旧7天不冒充30天。新的精确控件、被动原生response关联、date input/href同窗证明是满足这些既有要求的内部协议，不新增公开DTO、采集范围、接口调用权或历史权限。实际稳定性或完成证据不充分时应继续保持原要求未满足，不能通过改写SPEC降低到昵称/可修改公众号ID或标签即成功。

| 闭合点 | 具体实现与来源边界 |
|---|---|
| 视频号稳定身份 | root观察 /platform 的 #finder-uid-copy.finder-uniq-id、h2.finder-nickname 及唯一身份提示，可以形成普通页reader；只读ID，昵称仅展示。缺/空/重复匹配失败，错误当前身份拒绝。信息应记录私有实际witness与Git哈希，本独评不代签其真实性。 |
| 公众号稳定身份 | /cgi-bin/settingpage 明确label AppID与名称比可修改“公众号ID”更符合当前方案方向。SPEC写“优先”而非只准gh字段，因此不存在必须新增DTO或改SPEC的问题；但只见label不是独立的稳定/唯一性证明，实际witness仍须说明此AppID确属当前公众号、不是第三方应用/关联小程序。固定选用同一种ID协议，不能首次AppID、后来出现gh就自动换成gh造成原profile错号。无法证明或读取到时严格失败，不伪报LOGIN_REQUIRED。本次尝试只读官方文档两URL未成功取内容，未引用搜索里的第三方转载证明。 |
| 详情控件 | browser-source.ts:232当前全scope getByText(近30天).first()会选趋势控件；内置reader应定位真实详情.filter-row:has(.filter-extra)，与本kind的详情表/下载按钮属于同一section。若匹配0或多且不能唯一消歧，明确普通失败；不任取first兜底。 |
| 两种日期窗口 | source:214–215、238当前把所有视频号种类固定到昨日结束，会拒真实channelsWorks。root提供的1788969600/1791475200独立按Asia/Shanghai换算为9/10 00:00与10/9 00:00；日报实表为9/9..10/8。应各kind保存自己实际观察的selection，不能移一天“修成一致”。这里只证明所给时间戳的日期换算，不推断接口endTime端点的开闭、全历史或指标累计语义；channelsWorks保持publishedDates/sourceUnspecified。 |
| 视频号日报就绪 | 对channelsDaily/Followers仍要求详情真实.ant-table-body完整日期集合匹配实际选择，旧7天、重复/缺日期、另一趋势表均不能代签。不要删除原旧7天负例。 |
| 单篇被动response | 在操作之前装waitForResponse/必要request观察；仅接受当前官方origin、当前同源分析frame、实际见到的post_list请求以及本次选择关联的响应。只读取实证startTime/endTime和已核实际成功协议，等待响应finished与页面总数更新；排除前次在途晚响应、其它frame、其它kind/账户与失败响应。不直接调用/构造接口，不保存完整URL、body/session参数或raw error。未知字段不能猜成功码/total路径。 |
| 公众号无日期表 | source assertReady:75–76不能将“真实完整DOM日期表”强加给仅图表的officialContent。内部就绪证据宜显式区分tableDates与dateInputs+nativeHref一致：inputs必须当前可见且双日期有效；当前实际下载href的begin_timestamp/end_timestamp按已核单位和Shanghai规则对应同窗；监听/下载时再次检查以挡过期href。不能把由inputs计算出的日期数组伪称实际表格dates。当前parser:251–271继续对下载统计表实际日期集合完整核验，不因浏览器无table而放宽文件日期。 |
| 导出13行与页面总数 | 当前worker state有reportedRows，但 receiveReport:141只返回selection，collector输入也没有总数证据，所以现流无法执行“页面总数=解析CSV行数”。必须通过内部download/collector窄端口传递本次witness的expectedRows，在真实parse之后、commit之前核channelsWorks数据行数；不加入公开NativeReportPayload/DTO，不在worker重复导入业务parser。允许真实0；不能把第一页10条作为总数13。缺/矛盾总数失败并保此前已提交日报/关注报告。 |

最小合成回归（先对旧源码实际RED，再同测试GREEN，不能用新fixture替换旧保护）：

1. 同源页面同时有趋势与详情两组近30天，只有详情发生操作；详情未唯一定位时不下载。旧7天先到、真30天迟到继续等；超时/取消不晚下载。
2. 日报9/9..10/8、单篇真实请求9/10..10/9可在同轮成功，分别保存正确meaning；单位误用毫秒、非法/逆序日期、旧request晚response、HTTP/平台业务失败不得就绪。同标签无新有效响应不自证。
3. 公众号没有DOM日期table，但可见inputs和href日期一致、实际BIFF/HTML统计日期匹配时公开链成功；inputs/href不一致、过期href、实际文件7天或缺日期仍失败。不得把这条实现为所有日报放宽。
4. 单篇页面总数13/第一页10/CSV13成功；CSV10或14、页面计数仍旧4、缺总数拒绝；实际0/空CSV可成功并保窗口key。native ID缺失不能按标题补；如声明ID集合唯一，重复ID负例必须相应覆盖。
5. 两平台真实label reader的空值、错误身份、同昵称不同ID、可修改公众号ID干扰、关联小程序AppID干扰、明显登录页与普通网络/DOM失败区别。sourcePath不含query/session，回执/log不含完整ID/URL/token。
6. 至少一条公开binding.begin/get→backend原事务的产品隔离profile链，以及公开start→内置witness/下载窄端口→真实parser→DB commit→reports.list（合成浏览器必须明确标注），覆盖2+3份报表、第三份失败保前2、原deadline/取消late callback、onStopped/onStopUnconfirmed；原owner/lease/group guards不另放宽。

必要真实验收：按已明确恢复授权核普通页身份协议、选择前后日期/response与13条CSV行数，私人实五文件交当前parser验证；再用产品独立profile真人扫码和两平台完整同步。研究空间登录不等于产品绑定，读ID授权不等于搬Cookie；Git仅记录安全哈希/协议元字段。实际能力只在这些内置reader已装配且能按真实协议运行时开放；Chrome页面1366/1024、停止确认与全部Gate仍分别保留证据。

未发现需要改变已确认产品范围或服务契约的方案项；实施记录/研究事实更新应描述这次实际witness，不让旧UNKNOWN注释继续假装真实端口缺失，也不能把计划/合成回归写成真人完成。本报告只确认设计覆盖关系与实施所需边界，不是新的reviewctl收据或整体T1110验收。

当前审阅源码SHA：browser-source.ts 13b8006988bd09ac05c8e6b7d7ba6fa3b44eae7627e147a2b4d136e2e6dc7e48；parser.ts a0a24e154e7c2028174575d1a44f2c14af1595acddc54ce1dee5ddad038c15a9。
