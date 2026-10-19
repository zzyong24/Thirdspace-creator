import {expect,it} from 'vitest';
import {assistantReadInputSchema,assistantActionProposeInputSchema} from '@creatoros/contract';
import {buildAssistantFunctionalPrompt} from './assistant-functional-prompt';

it('功能方法明确发现步骤与有效严格参数，不能把未执行的用户子目标说成完成',()=>{
 const prompt=buildAssistantFunctionalPrompt(['system.features','system.read','system.action.propose']);
 expect(prompt).toContain('先不传feature');
 expect(prompt).toContain('完整读取ID或动作kind精确查找');
 expect(prompt).toContain('目录为空先移除筛选');
 const readExample={request:{kind:'projects.list',query:{page:1,pageSize:20}}};
 const actionExample={action:{kind:'project.create',title:'用户确认的标题'}};
 expect(assistantReadInputSchema.safeParse(readExample).success).toBe(true);
 expect(assistantActionProposeInputSchema.safeParse(actionExample).success).toBe(true);
 expect(prompt).toContain(JSON.stringify(readExample));
 expect(prompt).toContain(JSON.stringify(actionExample));
 expect(prompt).toContain('逐项核对用户要求');
 expect(prompt).toContain('未调用或失败的项不得称完成');
});

it('未装配系统工具时不出现它们的调用示例，保持原任务工具边界',()=>{
 const prompt=buildAssistantFunctionalPrompt(['canvas.create.propose']);
 expect(prompt).not.toContain('先不传feature');
 expect(prompt).not.toContain('"request":');
 expect(prompt).not.toContain('"action":');
 expect(prompt).toContain('用户采用后打开正式画布');
});

it('素材标签版本只沿原读取观察，指导复制target而不是猜版本或要求用户找内部值',()=>{
 const prompt=buildAssistantFunctionalPrompt(['system.read','system.action.propose']);
 expect(prompt).toContain('assets.get返回的tagTarget');expect(prompt).toContain('不猜expectedVersion');
 expect(buildAssistantFunctionalPrompt(['system.action.propose'])).not.toContain('assets.get返回的tagTarget');
 expect(buildAssistantFunctionalPrompt(['system.read'])).not.toContain('assets.get返回的tagTarget');
});


it('T1086 指引沿当前项目作品和原工程读取，如实说明状态与版本；只读不产生候选',()=>{
 const prompt=buildAssistantFunctionalPrompt(['system.features','system.read']);
 for(const fragment of ['projects.outputs.list','outputs.production.editor.get','context.project.lifecycle','observedRevision','window.expectedRevision','empty','legacy','editable','unsupportedFields','多个video逐个核对','只读请求不得提出候选、生成或渲染','没有真实冻结editorTarget'])expect(prompt).toContain(fragment);
 expect(prompt).not.toContain('用system.action.propose生成');
 for(const input of [{request:{kind:'projects.outputs.list',params:{projectId:'真实当前ID'}}},{request:{kind:'outputs.production.editor.get',params:{outputId:'真实作品ID'}}}]){expect(prompt).toContain(JSON.stringify(input));expect(assistantReadInputSchema.safeParse(input).success).toBe(true);}
 expect(buildAssistantFunctionalPrompt(['system.features'])).not.toContain('outputs.production.editor.get');
 expect(buildAssistantFunctionalPrompt([])).not.toContain('observedRevision');
});
