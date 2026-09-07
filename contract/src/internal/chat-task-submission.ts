/** 经审计的纯事务工具与真实子任务类型。提交和租约恢复必须使用同一映射。 */
const taskTypes:Readonly<Record<string,string>>=Object.freeze({
 "planning.thesis":"planning.thesis",
 "material.generate":"asset.generate",
 "publish.package":"publish.platform_adapt",
 "script.draft":"script.draft",
 "review.script":"script.review",
});
// SEMANTIC_BOUNDARY_ALLOW: 工具协议映射不理解内容或决定创作取舍，也不允许任意任务类型。
export function chatSubmittedTaskType(toolName:string):string|null{
 return Object.hasOwn(taskTypes,toolName)?taskTypes[toolName]!:null;
}

/** 结果卡沿用既有 UI 协议，工具名与卡片名不必相同。 */
export function chatSubmittedTaskResultKind(toolName:string):string|null{
 return chatSubmittedTaskType(toolName)?toolName==="review.script"?"review.report":toolName:null;
}
