# T1191 第7条独立 SPEC recheck

**PASS，仅content根滚动兜底的实施准入。** SPEC SHA `38bfa86de9ab922f6058bf7d66fd56ca14c4fe8a947268641e36930b0a63e8f9`；宪法SHA `86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`。产品仍 `346cf00843c6f2283ba244c85d8dd41e5e9118645e856df12e9100ce1eda21d0`，未加class。保前轮正式审核及第1–6项实施报告，不补签新增条款的旧前置。

实际Panel为overflow-hidden且max-height=100vh−48px；Dialog为h-full/min-h-0 flex列、header不收缩、内容父flex-1/min-h-0。Content根同为h-full/min-h-0，原消息区min-height120且自身overflow-y-auto，composer shrink-0。只给根加现overflow-y-auto使有限高度可纵滚，保消息下限/自身滚动、composer、字体间距、焦点陷阱/body lock与宿主。现生成utility确为overflow-y:auto，无需新全局CSS。

已实读三份观测JSON/对应日志/manifest、真实driver及宿主，看原200%失败两图、四份滚轮图和100%前后两图。manifest实际产品/测试/两个宿主SHA均匹配；私有候选HTML与原index仅多根overflow-y:auto。使用真实OverlayController/Dialog/Content/SDK；中性Port、引擎及空只读宿主隔离明确，不冒作真实保存/模型/安装。

四场景（prepare/creation×1280×800、900×600）100%已记录控件rect逐项无差；根clientHeight/scrollHeight为651/651、451/451，无额外纵滚。PNG完整字节均不同，不称像素/文件全等。200%由浏览器设置选择2，**仅Tab候选actionReachability仍全部false**，textarea边框未完全入槽；这份原结果保留。一次普通mouse.wheel(0,100)后，四场景textarea完整可见且5点命中，根scrollTop52.5/164、panel0。prepare继续/清空/发送及creation允许的设置入口各自完整可达，禁用项按真实状态为null。不要求长内容同屏，不签仅Tab全部边框入视。

driver未用force、JS scroll/scrollIntoView或改文字/下限；所有checkpoint POST0/pageerror0/外网blocked0。此观测JSON不提供标准wrapper的exitCode/logSha256，核其真实摘要日志一致，不杜撰exit0。逐源/证据/看图SHA与四场景测量见READ_SET。

精确准入只在同文件content根加一个现class。先正式record0，再按最终source跑原前端公共链及真实100%任务/键盘、200%普通滚轮和受影响控件的独立视觉/操作验收；不把私有stylesheet签产品后验。无宿主/全局CSS/字体下限/逻辑/权限/预算/研究范围变更。后端4FAIL、timeout总体1、canonical27ERROR/1WARN保持；不完成任务，不签新包/native/模型/完整Gate/全功能。

仅只读与私有写入；未运行测试/服务/验证器/CLI/浏览器/研究实验。
