import {afterEach,it,expect,vi} from 'vitest';
import {POSITIONING_GENERATE_TEMPLATE} from '../prompt/templates/positioning-generate';
import {modelFor} from '../runtime/provider-factory';
import {runStructuredNode} from './structured-node';
import {createDurableGenerationModel} from '../execution/durable-generation-model';
afterEach(()=>vi.unstubAllGlobals());
it('DeepSeek text_compat 使用真实适配器与账本成功',async()=>{
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({id:'fixture',object:'chat.completion',created:1,model:'deepseek-flash',choices:[{index:0,message:{role:'assistant',content:'{"persona":"定位"}'},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}}),{headers:{'content-type':'application/json'}}));
 vi.stubGlobal('fetch',fetcher);
 const settle=vi.fn();
 const model=createDurableGenerationModel({model:modelFor({apiFormat:'openai_chat',baseUrl:'https://api.deepseek.com',model:'deepseek-flash',token:'synthetic-fixture'}),operationKey:'structured:child:hash',ports:{reserve:async()=>({callId:'child',status:'reserved'}),start:async()=>{},settle}});
 const result=await runStructuredNode({model,template:POSITIONING_GENERATE_TEMPLATE,facets:{current:'帮我梳理账号定位'}});
 expect(result.object).toMatchObject({persona:'定位'});expect(fetcher).toHaveBeenCalledTimes(1);expect(settle).toHaveBeenCalledWith('child',expect.objectContaining({status:'settled'}));
});

it('发送前 payload 构造异常结算 rejected，保留脱敏原因且 fetch 为零',async()=>{
 const codec=await import('../runtime/pi-provider-codec');
 const spy=vi.spyOn(codec,'piPayload').mockImplementation(()=>{throw new ReferenceError('choice is not defined token=synthetic-secret');});
 const fetcher=vi.fn(()=>{throw new Error('禁止网络');});vi.stubGlobal('fetch',fetcher);
 const settle=vi.fn();
 const model=createDurableGenerationModel({model:modelFor({apiFormat:'openai_chat',baseUrl:'https://api.deepseek.com',model:'deepseek-flash',token:'synthetic-fixture'}),operationKey:'structured:child:hash',ports:{reserve:async()=>({callId:'child',status:'reserved'}),start:async()=>{},settle}});
 const {generateText}=await import('ai');
 try{
 await expect(generateText({model,prompt:'定位',maxRetries:0})).rejects.toMatchObject({outcome:'failed',errorCode:'MODEL_REQUEST_BUILD_FAILED',message:expect.stringContaining('ReferenceError: choice is not defined')});
 expect(fetcher).not.toHaveBeenCalled();expect(settle).toHaveBeenCalledWith('child',{status:'rejected',errorDetail:expect.stringContaining('ReferenceError: choice is not defined')});expect(JSON.stringify(settle.mock.calls)).not.toContain('synthetic-secret');
 }finally{spy.mockRestore();}
});
