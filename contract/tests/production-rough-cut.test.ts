import {it,expect} from 'vitest';
import * as rough from '../src/resources/production-rough-cut';
const old={expectedRevision:0,requestId:'rough-original-request',selection:{clipIds:['real-clip']},instruction:'保留完整表达'};
const pause={suggestionId:'pause-1',decision:'review',target:{kind:'pause_gap',clipId:'real-clip',transcriptId:'real-transcript',gapId:'real-gap',retainedTicks:160},reason:'适当缩短停顿',uncertainty:'需听审呼吸和未识别声音'};
it('旧粗剪请求未带协议时原字节不添加默认，新v3明确选择',()=>{expect(rough.productionRoughCutCreateBody.parse(old)).toEqual(old);expect(rough.productionRoughCutCreateBody.parse({...old,protocolVersion:3})).toEqual({...old,protocolVersion:3});expect(rough.productionRoughCutCreateBody.safeParse({...old,protocolVersion:2}).success).toBe(false);});
it('旧模型冻结schema不接受pause，新v3只接受review与整数retainedTicks',()=>{
 expect(rough.productionRoughCutModelOutput.safeParse({suggestions:[pause],summary:''}).success).toBe(false);
 expect(rough.productionRoughCutModelOutputV3.parse({suggestions:[pause],summary:''})).toEqual({suggestions:[pause],summary:''});
 for(const s of [{...pause,decision:'remove'},{...pause,target:{...pause.target,retainedTicks:0.5}},{...pause,target:{...pause.target,retainedTicks:-1}},{...pause,uncertainty:''},{...pause,target:{...pause.target,start:0}}])expect(rough.productionRoughCutModelOutputV3.safeParse({suggestions:[s],summary:''}).success).toBe(false);
});
it('停顿听审声明仅接受精确唯一entries，原采用请求仍原样',()=>{const oldAdopt={candidateRequestId:'rough-original-request',suggestionIds:['pause-1'],expectedRevision:0,requestId:'rough-original-adopt'},confirmation={entries:[{suggestionId:'pause-1',gapDigest:'sha256:'+'a'.repeat(64)}],acknowledgement:'reviewed_audio_and_ranges'};expect(rough.productionRoughCutAdoptBody.parse(oldAdopt)).toEqual(oldAdopt);expect(rough.productionRoughCutAdoptBody.parse({...oldAdopt,pauseGapConfirmation:confirmation})).toEqual({...oldAdopt,pauseGapConfirmation:confirmation});expect(rough.productionRoughCutAdoptBody.safeParse({...oldAdopt,pauseGapConfirmation:{...confirmation,entries:[...confirmation.entries,...confirmation.entries]}}).success).toBe(false);});
