import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
export function must(ok,message){if(!ok)throw new Error('Unknown: '+message);}
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function fileSHA(p){const h=createHash('sha256');for await(const bytes of createReadStream(p))h.update(bytes);return h.digest('hex');}
export async function checkOriginal(registry){
 must(await fileSHA(path.join(registry.originDirectory,'audio.wav'))===registry.wavSHA256,'same WAV hash mismatch');
 must(await fileSHA(path.join(registry.originDirectory,'source.mov'))===registry.sourceMovSHA256,'original source hash mismatch');
 for(const f of registry.modelFiles)must(await fileSHA(path.join(registry.originDirectory,f.path))===f.sha256,'source model hash mismatch: '+f.path);
 for(const f of registry.sourceFiles)must(await fileSHA(path.join(registry.sourceRoot,f.path))===f.sha256,'source/dependency SHA drift: '+f.path);
}
export function readNativePcmWav(bytes,registry){
 must(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WAVE','native RIFF WAVE required');let fmt,data;
 for(let at=12;at+8<=bytes.length;){const kind=bytes.toString('ascii',at,at+4),length=bytes.readUInt32LE(at+4),next=at+8+length;must(next<=bytes.length,'WAV chunk beyond file');if(kind==='fmt ')fmt=bytes.subarray(at+8,next);if(kind==='data'){must(!data,'single data chunk required');data=bytes.subarray(at+8,next);}at=next+(length%2);}
 must(fmt&&data&&fmt.length>=16,'fmt/data missing');must(fmt.readUInt16LE(0)===1&&fmt.readUInt16LE(2)===1&&fmt.readUInt32LE(4)===registry.sampleRate&&fmt.readUInt16LE(14)===16&&fmt.readUInt16LE(12)===2,'expected native mono16000 s16');
 must(data.length===registry.validSampleCount*2,'valid PCM sample count mismatch');const pcm=new Float32Array(registry.validSampleCount);for(let i=0;i<pcm.length;i++)pcm[i]=data.readInt16LE(i*2)/32768;
 return {pcm,witness:{sampleRate:registry.sampleRate,channels:1,sampleWidthBytes:2,validSampleCount:pcm.length,dataBytes:data.length,pcmFloat32SHA256:sha(new Uint8Array(pcm.buffer)),conversion:'native int16/32768; no ffmpeg/decode/resample/trim/padding'}};
}
export function deriveStride(metadata){
 const feature=metadata.featureDims,encoder=metadata.encoderDims,attn=metadata.attentionDims,pre=metadata.preprocessorConfig,config=metadata.modelConfig;
 must(feature?.length===3&&encoder?.length===3&&attn?.length===4,'actual feature/encoder/attention dims missing');
 must(feature[0]===1&&encoder[0]===1&&attn[0]===1,'single batch only');
 const f=feature[2],e=encoder[1],a=attn[3],stride=f/e;
 must(Number.isInteger(stride)&&stride>0&&a===e,'measured encoder ratio/source attention mismatch');
 must(f===pre.nb_max_frames&&a===config.max_source_positions,'actual/config dimensions disagree');
 must(pre.n_samples===pre.chunk_length*pre.sampling_rate&&pre.n_samples/pre.hop_length===f,'feature config does not prove frame clock');
 const precision=pre.chunk_length/config.max_source_positions;
 must(precision===pre.hop_length*stride/pre.sampling_rate&&precision===metadata.timePrecision,'measured/config time step mismatch');
 must(metadata.numFrames===Math.floor(metadata.validSampleCount/pre.hop_length),'provider num_frames inconsistent with input samples');
 const crop=Math.floor(metadata.validSampleCount*e/(pre.hop_length*f));
 must(crop>0&&crop<=a,'derived physical crop invalid');
 return {featureFrames:f,encoderFrames:e,attentionFrames:a,measuredEncoderStride:stride,featureHopSamples:pre.hop_length,timePrecision:precision,legacyCropRequested:metadata.numFrames,legacyCropEffective:Math.min(metadata.numFrames,a),actualStrideCrop:crop,derivation:'floor(validSampleCount * actualEncoderFrames / (hop_length * actualFeatureFrames)); no guessed divide-by-two'};
}
export function denyNetwork(){let attempts=0;globalThis.fetch=async()=>{attempts++;throw new Error('network denied by bounded offline observation');};return ()=>attempts;}
