import {expect,it} from 'vitest';
import {isAssistantEngineToolAllowed} from '../src/assistant-operation-catalog';
const names=['cover.generate','research.autonomous','planning.thesis','material.generate','review.script','publish.package'];
it.each(names)('Codex已登记原子提交%s保留精确execution/effect门',name=>{
 expect(isAssistantEngineToolAllowed('codex',{name,execution:'host.task-submit',effect:'committed'})).toBe(true);
 expect(isAssistantEngineToolAllowed('codex',{name,execution:'host',effect:'committed'})).toBe(false);
 expect(isAssistantEngineToolAllowed('codex',{name,execution:'host.task-submit',effect:'none'})).toBe(false);
 expect(isAssistantEngineToolAllowed('codebuddy',{name,execution:'host.task-submit',effect:'committed'})).toBe(false);
});
it.each(['topic.enrich','positioning.generate','calibration.diagnose','topic.generate','review.analyze','knowledge.distill'])('Codex已登记专属生成%s只准原worker节点',name=>{
 expect(isAssistantEngineToolAllowed('codex',{name,execution:'worker.structured-node',effect:'proposal'})).toBe(true);
 expect(isAssistantEngineToolAllowed('codex',{name,execution:'host',effect:'proposal'})).toBe(false);
 expect(isAssistantEngineToolAllowed('codex',{name,execution:'worker.structured-node',effect:'committed'})).toBe(false);
});
it('开场、脚本与浏览器搜索仅开放已登记原宿主边界',()=>{
 expect(isAssistantEngineToolAllowed('codex',{name:'script.hooks',execution:'worker.script-hooks',effect:'proposal'})).toBe(true);
 expect(isAssistantEngineToolAllowed('codex',{name:'script.draft',execution:'worker.script-draft',effect:'committed'})).toBe(true);
 expect(isAssistantEngineToolAllowed('codex',{name:'material.gather',execution:'worker.research',effect:'none'})).toBe(true);
 expect(isAssistantEngineToolAllowed('codex',{name:'arbitrary.tool',execution:'worker.structured-node',effect:'proposal'})).toBe(false);
 expect(isAssistantEngineToolAllowed('codex',{name:'files.delete',execution:'host',effect:'committed'})).toBe(false);
 expect(isAssistantEngineToolAllowed('pi',{name:'existing.pi.tool',execution:'host',effect:'committed'})).toBe(true);
});
it.each([['web.read','worker.web-read'],['redfox.query','worker.redfox']])('Codex既有%s只复用精确已登记提交边界', (name,execution)=>{
 expect(isAssistantEngineToolAllowed('codex',{name:name!,execution:execution!,effect:'committed'})).toBe(true);
 expect(isAssistantEngineToolAllowed('codex',{name:name!,execution:'host',effect:'committed'})).toBe(false);
 expect(isAssistantEngineToolAllowed('codebuddy',{name:name!,execution:execution!,effect:'committed'})).toBe(false);
});

it.each(['project.transcribe','material.screenshot','intelligence.douyin.share','local.read'])('Codex既有%s只准原Host提交与审批',name=>{expect(isAssistantEngineToolAllowed('codex',{name,effect:'committed'})).toBe(true);expect(isAssistantEngineToolAllowed('codebuddy',{name,effect:'committed'})).toBe(false);});
it.each(['local.tools','local.workspace'])('Codex已登记本地短读%s仍保原Host无副作用',name=>{expect(isAssistantEngineToolAllowed('codex',{name,effect:'none'})).toBe(true);expect(isAssistantEngineToolAllowed('codex',{name,effect:'committed'})).toBe(false);});
it('Codex只开放真实冻结Workbench descriptor匹配的原Host效果，目录本身不替代授权',()=>{
 const descriptor={name:'files.read',effects:['read' as const]};
 expect(isAssistantEngineToolAllowed('codex',{name:'files.read',effect:'none'},descriptor)).toBe(true);
 expect(isAssistantEngineToolAllowed('codex',{name:'files.read',effect:'none'})).toBe(false);
 expect(isAssistantEngineToolAllowed('codex',{name:'files.write',effect:'none'},descriptor)).toBe(false);
 expect(isAssistantEngineToolAllowed('codex',{name:'files.read',effect:'committed'},descriptor)).toBe(false);
 expect(isAssistantEngineToolAllowed('codebuddy',{name:'files.read',effect:'none'},descriptor)).toBe(false);
});
it('Codex原计划工具保持Host任务写入效果',()=>{expect(isAssistantEngineToolAllowed('codex',{name:'plan.update',effect:'proposal'})).toBe(false);expect(isAssistantEngineToolAllowed('codex',{name:'plan.update',effect:'committed'})).toBe(true);});
