import { CHAT_TOOL_LABELS } from "@creatoros/contract";
/** 方法指导只引用当轮真实工具；原effective Skill/overlay仍由原装配路径保留。 */
export function buildAssistantFunctionalPrompt(names:readonly string[]){
  const has=(name:string)=>names.includes(name);
  const methods=[
    "以用户目标推进具体可检查结果。先读真实内容，再提出候选；候选、已采用、任务已受理和实际完成必须分别说明。逐项核对用户要求，只按真实返回说明结果；未调用或失败的项不得称完成，也不得说成用户没有要求。",
    "遇到缺输入、权限、登录、未装配端口或版本冲突，引用真实原因并给出可执行的下一步与原入口，不用泛称系统无法完成结束工作。结果未知先核对原任务/原操作，不默认重新提交。",
    has("system.features")?"跨页面目标先不传feature，用system.features按页发现真实功能入口与前置条件；再用返回的feature域、完整读取ID或动作kind精确查找，不能当关键词搜索。目录为空先移除筛选读取完整目录，不据空筛选断言功能缺失。目录不是执行授权。":"",
    has("system.read")?'用system.read的固定功能分支读取真实ID与当前版本。外层request和request.kind必填，例如{"request":{"kind":"projects.list","query":{"page":1,"pageSize":20}}}；不能只传limit或把kind放在外层。按返回的分页继续读取；长正文用原window/result reader，不把第一页冒充全部。':"",
    has("system.action.propose")?'项目、选题、素材、知识、定位、账号组、发布准备、排期、自动化和偏好用system.action.propose生成具体候选。外层action和action.kind必填，例如{"action":{"kind":"project.create","title":"用户确认的标题"}}；其它字段按所选kind的严格合同填写。解释目标、内容与影响，用户采用后以正式回执/读回确认。':"",
    has("system.read")&&has("system.action.propose")?"素材打标签先读取assets.get，逐项复制assets.get返回的tagTarget作为asset.tag的targets；标签由用户目标与真实素材内容决定。不猜expectedVersion，不拿fileId或updatedAt代替版本，也不要求用户查找内部值。缺tagTarget先核对素材状态与实际动作目录；版本冲突重新读取原目标并准备新的候选。":"",
    has("work.editor.propose")?"精调当前作品先work.editor.read，复制真实base/digest/选区。文章/图文保未改字段；原生视频用真实track/element/media、120000 ticks/秒和typed_patch，分别落实删除、顺序、变速、音量、字幕及素材替换。需要按说话内容取舍时先读真实时间戳转写；缺转写说明原转写步骤，不猜文件名。候选由用户预览采用，再沿原工程保存/导出。":"",
    has("work.creation.propose")?"确认脚本后work.creation.read，再work.creation.propose一次生成同源文章与图文，两份作品分别预览采用和继续精调。用户已明确不自动生成视频初稿。":"",
    has("canvas.create.propose")?"用canvas.create.propose准备完整节点与布局候选，用户采用后打开正式画布继续调整；不要先创建空画布再声称已完成。":"",
    has("canvas.generate.propose")?"画布生图先canvas.read核已保存节点和真实参考图，再canvas.generate.propose；卡片中的确认生成才预约原任务。观察原任务进度和精确结果，用户保留/放到画布后才能称已采用。":"",
  ].filter(Boolean);
  return ["【本轮实际工具目录】",...names.map(name=>{const label=CHAT_TOOL_LABELS[name];return `${label?.name??name}(${name}):${label?.purpose??"具体参数以本轮工具定义为准"}`;}),"【工具目录结束】","【功能执行方法】",...methods].join("\n");
}
