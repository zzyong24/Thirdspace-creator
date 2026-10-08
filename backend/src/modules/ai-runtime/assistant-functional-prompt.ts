import { CHAT_TOOL_LABELS } from "@creatoros/contract";
/** 方法指导只引用当轮真实工具；原effective Skill/overlay仍由原装配路径保留。 */
export function buildAssistantFunctionalPrompt(names:readonly string[]){
  const has=(name:string)=>names.includes(name);
  const methods=[
    "以用户目标推进具体可检查结果。先读真实内容，再提出候选；候选、已采用、任务已受理和实际完成必须分别说明。",
    "遇到缺输入、权限、登录、未装配端口或版本冲突，引用真实原因并给出可执行的下一步与原入口，不用泛称系统无法完成结束工作。结果未知先核对原任务/原操作，不默认重新提交。",
    has("system.features")?"跨页面目标先用system.features发现功能入口与前置条件，再选择真实读取和单个具体操作候选。目录不是执行授权。":"",
    has("system.read")?"用system.read的固定功能分支读取真实ID与当前版本。按返回的分页继续读取；长正文用原window/result reader，不把第一页冒充全部。":"",
    has("system.action.propose")?"项目、选题、素材、知识、定位、账号组、发布准备、排期、自动化和偏好用system.action.propose生成具体候选。解释目标、内容与影响，用户采用后以正式回执/读回确认。":"",
    has("work.editor.propose")?"精调当前作品先work.editor.read，复制真实base/digest/选区。文章/图文保未改字段；原生视频用真实track/element/media、120000 ticks/秒和typed_patch，分别落实删除、顺序、变速、音量、字幕及素材替换。需要按说话内容取舍时先读真实时间戳转写；缺转写说明原转写步骤，不猜文件名。候选由用户预览采用，再沿原工程保存/导出。":"",
    has("work.creation.propose")?"确认脚本后work.creation.read，再work.creation.propose一次生成同源文章与图文，两份作品分别预览采用和继续精调。用户已明确不自动生成视频初稿。":"",
    has("canvas.create.propose")?"用canvas.create.propose准备完整节点与布局候选，用户采用后打开正式画布继续调整；不要先创建空画布再声称已完成。":"",
    has("canvas.generate.propose")?"画布生图先canvas.read核已保存节点和真实参考图，再canvas.generate.propose；卡片中的确认生成才预约原任务。观察原任务进度和精确结果，用户保留/放到画布后才能称已采用。":"",
  ].filter(Boolean);
  return ["【本轮实际工具目录】",...names.map(name=>{const label=CHAT_TOOL_LABELS[name];return `${label?.name??name}(${name}):${label?.purpose??"具体参数以本轮工具定义为准"}`;}),"【工具目录结束】","【功能执行方法】",...methods].join("\n");
}
