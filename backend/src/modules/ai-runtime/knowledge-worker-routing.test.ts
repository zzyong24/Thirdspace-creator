import {expect,it,vi} from 'vitest';
import {runKnowledgeClassify} from './knowledge-classify-runner';
import {runKnowledgeDistill} from './knowledge-distill-runner';
import {runKnowledgeRelate} from './knowledge-relate-runner';
import {runCommentQaSift} from './comment-qa-sift-runner';
const context={userId:'knowledge-user',accountId:'knowledge-account',source:'user' as const,requestId:'request'};
it.each([
 {skillId:'knowledge.classify',run:runKnowledgeClassify,input:{content:'原始材料'},output:{knowledgeType:'note',title:'标题',tags:[],summary:'摘要'}},
 {skillId:'knowledge.distill',run:runKnowledgeDistill,input:{content:'原始材料'},output:{atoms:[{type:'claim',title:'观点',note:'',sourceNote:''}],suggestedTags:[],coverage:{inputChars:4,processedChars:4,truncatedChars:0,chunkCount:1}}},
 {skillId:'knowledge.relate',run:runKnowledgeRelate,input:{atoms:[{id:'a',title:'甲',knowledgeType:'note',sourceNote:null},{id:'b',title:'乙',knowledgeType:'note',sourceNote:null}]},output:{candidates:[]}},
 {skillId:'comment.qa-sift',run:runCommentQaSift,input:{comments:[{signalId:'signal',rawText:'如何操作？',likeCount:1}]},output:{candidates:[]}},
])('同步 $skillId 必须经持久Worker端口而不在宿主调用API',{timeout:120000,retry:0},async({skillId,run,input,output})=>{
 const runKnowledgeGeneration=vi.fn().mockResolvedValue(output),resolveModelSpec=vi.fn(()=>{throw Error('HOST_API_FORBIDDEN');});
 const signal=new AbortController().signal;
 const result=await (run as Function)(context,{...input,signal},{runKnowledgeGeneration,resolveModelSpec});
 expect(result).toEqual(output);expect(runKnowledgeGeneration).toHaveBeenCalledWith(context,{skillId,inputData:input},signal);expect(resolveModelSpec).not.toHaveBeenCalled();
});
it('空材料及不足两节点保持原空态，不创建执行',{timeout:120000,retry:0},async()=>{
 const runKnowledgeGeneration=vi.fn();
 await expect(runKnowledgeClassify(context,{content:'  '},{runKnowledgeGeneration} as never)).rejects.toThrow('原文为空');
 await expect(runKnowledgeDistill(context,{content:'  '},{runKnowledgeGeneration} as never)).rejects.toThrow('原文为空');
 expect(await runKnowledgeRelate(context,{atoms:[]},{runKnowledgeGeneration} as never)).toEqual({candidates:[]});
 expect(await runCommentQaSift(context,{comments:[]},{runKnowledgeGeneration} as never)).toEqual({candidates:[]});
 expect(runKnowledgeGeneration).not.toHaveBeenCalled();
});
