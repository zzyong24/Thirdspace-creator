import {expect,it} from 'vitest';
import {productionPlanV2} from '@creatoros/contract';
import {validateRoughSuggestions,applyRoughSuggestions} from './production-rough-cut-touch';
const plan=()=>productionPlanV2.parse({editorVersion:2,mainTrack:{sources:[{sourceId:'s',assetId:'a',assetFileId:'f',fileDigest:'a'.repeat(64),probeDigest:'b'.repeat(64),timebase:{num:1,den:1000},durationTicks:1000,hasAudio:false}],clips:[{clipId:'c',sourceId:'s',sourceInTicks:0,sourceOutTicks:1000}]},overlayDraft:{meta:{},scenes:[],captions:[],broll:[],delivery:{width:1920,height:1080,fps:30}},sourceTranscripts:[{transcriptId:'t',sourceId:'s',assetFileId:'f',audioDigest:'c'.repeat(64),providerReceiptId:'receipt',text:'甲😀乙',providerEvidence:{},granularity:'text'}]});
const suggestion=(target:unknown)=>({suggestionId:'suggestion',decision:'remove',target,reason:'用户选择',uncertainty:''});
it('全文选区严格UTF16真实冻结范围；无时间码不能精剪',()=>{
 const p=plan(),selected={transcriptId:'t',textSelection:{start:0,end:4,offsetEncoding:'utf16'}};
 const value=validateRoughSuggestions(p,['c'],selected,{summary:'',suggestions:[suggestion({kind:'unlocated_text',transcriptId:'t',textSelection:{start:1,end:3,offsetEncoding:'utf16'}})]});
 expect(()=>applyRoughSuggestions(p,value.suggestions,()=> 'unused')).toThrow('不能据文字猜');
 expect(()=>validateRoughSuggestions(p,['c'],selected,{summary:'',suggestions:[suggestion({kind:'unlocated_text',transcriptId:'t',textSelection:{start:1,end:2,offsetEncoding:'utf16'}})]})).toThrow('UTF16');
 expect(()=>validateRoughSuggestions(p,['c'],{transcriptId:'t',tokenIds:['fake']},{summary:'',suggestions:[suggestion({kind:'tokens',clipId:'c',transcriptId:'t',tokenIds:['fake']})]})).toThrow('真实词句时间码');
});
it('同源另一clip不在冻结选择；明确选中同触点两整片建议一次删除',()=>{
 const p=plan();p.mainTrack.clips.push({...p.mainTrack.clips[0]!,clipId:'other'});
 expect(()=>validateRoughSuggestions(p,['c'],undefined,{summary:'',suggestions:[suggestion({kind:'clip',clipId:'other'})]})).toThrow('冻结片段');
 const first=suggestion({kind:'clip',clipId:'c'}),value=validateRoughSuggestions(p,['c'],undefined,{summary:'',suggestions:[first,{...first,suggestionId:'second'}]});
 expect(applyRoughSuggestions(p,value.suggestions,()=> 'unused').mainTrack.clips.map(c=>c.clipId)).toEqual(['other']);expect(p.mainTrack.clips).toHaveLength(2);
});
