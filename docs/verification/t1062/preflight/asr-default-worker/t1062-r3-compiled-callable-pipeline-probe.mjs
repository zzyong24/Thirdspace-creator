import fs from 'node:fs';
import assert from 'node:assert/strict';
import { AutomaticSpeechRecognitionPipeline, WhisperProcessor } from '/Users/zyongzhu/.codex/worktrees/t1062-migration-convergence/Thirdspace-creator/ai-worker/node_modules/@xenova/transformers/src/transformers.js';

const bundlePath='/tmp/t1062-default-worker-preflight/run-r3.cjs';
const bundle=fs.readFileSync(bundlePath,'utf8');
const start=bundle.indexOf('function guardWhisperPipeline(raw) {');
const end=bundle.indexOf('\nfunction abortError',start);
assert.ok(start>=0&&end>start,'compiled guard function not found');
const compiledSource=bundle.slice(start,end);
assert.match(compiledSource,/Reflect\.apply\(originalProcessor, this, args\)/);
const guardWhisperPipeline=Function(`${compiledSource}; return guardWhisperPipeline;`)();

const samples=[],crops=[],decoded=[];
const model={
  config:{model_type:'whisper',max_source_positions:1500,decoder_layers:2,decoder_attention_heads:4},
  async generate(_feature,options){await this.forward();return{sequences:[[1,2]],token_timestamps:this._extract_token_timestamps({cross_attentions:[[[{dims:[1,4,1,1500]},{dims:[1,4,1,1500]}]]]},[],options.num_frames,0.02)};},
  async forward(){return{encoder_outputs:{dims:[1,1500,768]}};},
  _extract_token_timestamps(_out,_heads,frames,precision){crops.push(frames);return{tolist:()=>[[0,frames*precision]]};}
};
const config={nb_max_frames:3000,n_samples:480000,chunk_length:30,sampling_rate:16000,hop_length:160};
const featureExtractor=Object.assign(async input=>{samples.push(input.length);return{input_features:{dims:[1,80,3000]}};},{config});
const processor=Reflect.construct(WhisperProcessor,[featureExtractor]);
assert.equal(typeof processor,'function');
assert.equal(processor.apply,undefined);
const tokenizer={get_decoder_prompt_ids:()=>[],_decode_asr(chunks,options){decoded.push(...chunks);assert.equal(options.return_timestamps,'word');return['完整原正文',{chunks:[{text:'合成词',timestamp:[0,45]}]}];}};
const raw=Reflect.construct(AutomaticSpeechRecognitionPipeline,[{task:'automatic-speech-recognition',model,tokenizer,processor}]);
const original={processor:raw.processor,generate:model.generate,forward:model.forward,extract:model._extract_token_timestamps,config:processor.feature_extractor.config};
const guarded=guardWhisperPipeline(raw);
const first=await guarded(new Float32Array(720000),{return_timestamps:'word',chunk_length_s:30,stride_length_s:5});
assert.deepEqual(samples,[480000,400000,80000]);
assert.deepEqual(crops,[1500,1250,250]);
assert.deepEqual(decoded.map(x=>x.stride),[[30,0,5],[25,5,5],[5,5,0]]);
assert.equal(first.wordTimingValidated,true);
assert.strictEqual(raw.processor,original.processor);
assert.strictEqual(model.generate,original.generate);
assert.strictEqual(model.forward,original.forward);
assert.strictEqual(model._extract_token_timestamps,original.extract);
assert.strictEqual(processor.feature_extractor.config,original.config);
const second=await guarded(new Float32Array(306587),{return_timestamps:'word',chunk_length_s:30,stride_length_s:5});
assert.equal(second.wordTimingValidated,true);
assert.equal(crops.at(-1),958);
assert.strictEqual(raw.processor,original.processor);
const abort=new AbortController();abort.abort();
await assert.rejects(()=>guarded(new Float32Array(16000),{return_timestamps:'word'},abort.signal),e=>e?.name==='AbortError');
assert.strictEqual(raw.processor,original.processor);
console.log(JSON.stringify({status:'PASS_NO_MODEL',bundlePath,compiledReflectApply:true,processorApply:typeof processor.apply,samples,crops,decodedStrides:decoded.map(x=>x.stride),firstWordTimingValidated:first.wordTimingValidated,secondWordTimingValidated:second.wordTimingValidated,restored:{processor:raw.processor===original.processor,generate:model.generate===original.generate,forward:model.forward===original.forward,extract:model._extract_token_timestamps===original.extract,configIdentity:processor.feature_extractor.config===original.config},modelSessionCalls:0,decodeCalls:0,networkCalls:0},null,2));
