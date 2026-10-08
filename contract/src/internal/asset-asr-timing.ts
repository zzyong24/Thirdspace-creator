import {z} from 'zod';
const count=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positive=count.refine(n=>n>0);
const id=z.string().min(1).max(256);
const digest=z.string().regex(/^sha256:[a-f0-9]{64}$/);
// Provider timing is evidence, not a client claim of editing eligibility.
export const assetAsrSampleRange=z.object({id,text:z.string(),startSample:count,endSample:positive}).strict().refine(r=>r.endSample>r.startSample);
export const assetAsrActualProviderTiming=z.object({
 granularity:z.enum(['segment','word']),units:z.literal('audio_samples'),
 callId:id,durableReceiptId:id,audioDigest:digest,rawResponseDigest:digest,
 sampleRate:z.number().int().min(1).max(384000),validSampleCount:positive,
 ranges:z.array(assetAsrSampleRange).min(1).max(20000),
}).strict().superRefine((v,c)=>{
 const ids=new Set<string>();let previousEnd=0;
 v.ranges.forEach((r,i)=>{if(ids.has(r.id)||r.startSample<previousEnd||r.endSample>v.validSampleCount)c.addIssue({code:'custom',path:['ranges',i],message:'真实时间码身份重复、顺序重叠或超出有效音频样本'});ids.add(r.id);previousEnd=r.endSample;});
});
const rational=z.object({num:z.string().regex(/^-?(0|[1-9][0-9]{0,39})$/),den:z.string().regex(/^[1-9][0-9]{0,39}$/)}).strict().refine(v=>{if(v.num==='-0')return false;let n=BigInt(v.num);if(n<BigInt(0))n=-n;let d=BigInt(v.den);while(d){const r=n%d;n=d;d=r;}return n===BigInt(1);},{message:'时钟有理数必须规范化且不得负零'});
export const assetAsrPcmTimingWitness=z.object({
 protocol:z.literal('asset-asr-pcm-mapping/v1'),assetId:id,assetFileId:id,fileDigest:digest,probeDigest:digest,
 streamIndex:count,ptsUnits:z.literal('source_ticks'),sourceSampleRate:z.number().int().min(1).max(384000),sourceDecodedSampleCount:positive,sourceTimebase:z.object({num:positive,den:positive}).strict(),sourceDurationTicks:positive,
 sourceFirstEffectiveSamplePts:rational,firstOutputSampleSourcePts:rational,
 outputEncoding:z.literal('pcm_s16le'),outputSampleRate:z.number().int().min(1).max(384000),outputValidSampleCount:positive,outputDecodedSampleCount:positive,
 sourceSkipSamples:count,sourceDiscardPadding:count,outputTrimStartSamples:count,outputTrimEndSamples:count,
 actualExtractionReceiptId:id,actualExtractionDigest:digest,audioDigest:digest,
}).strict().superRefine((v,c)=>{if(BigInt(v.sourceSkipSamples)+BigInt(v.sourceDiscardPadding)>=BigInt(v.sourceDecodedSampleCount))c.addIssue({code:'custom',message:'原音轨有效样本为空'});if(BigInt(v.outputTrimStartSamples)+BigInt(v.outputTrimEndSamples)+BigInt(v.outputValidSampleCount)!==BigInt(v.outputDecodedSampleCount))c.addIssue({code:'custom',message:'实际输出裁切与有效样本数不一致'});});
export type AssetAsrActualProviderTiming=z.infer<typeof assetAsrActualProviderTiming>;
export type AssetAsrPcmTimingWitness=z.infer<typeof assetAsrPcmTimingWitness>;
export const assetAsrProviderTiming=z.object({granularity:z.enum(['segment','word']),units:z.literal('audio_samples'),originalUnits:z.enum(['seconds','milliseconds','audio_samples']),originalRanges:z.array(z.object({id,text:z.string(),start:z.string().min(1).max(64),end:z.string().min(1).max(64)}).strict()).min(1).max(20000),audioDigest:digest,rawResponseDigest:digest,sampleRate:z.number().int().min(1).max(384000),validSampleCount:positive,ranges:z.array(assetAsrSampleRange).min(1).max(20000)}).strict().superRefine((v,c)=>{if(v.originalRanges.length!==v.ranges.length||v.originalRanges.some((r,i)=>r.id!==v.ranges[i]?.id||r.text!==v.ranges[i]?.text))c.addIssue({code:'custom',message:'供应商原单位明细与样本身份不符'});let end=0;const ids=new Set<string>();for(const [i,r] of v.ranges.entries()){if(ids.has(r.id)||r.startSample<end||r.endSample>v.validSampleCount)c.addIssue({code:'custom',path:['ranges',i],message:'供应商真实时间码范围或身份无效'});ids.add(r.id);end=r.endSample;}});
export const assetAsrPcmMappingReceipt=z.object({...assetAsrPcmTimingWitness.shape,sourceClockOriginSeconds:rational,sourceProbeDigest:digest,outputProbeDigest:digest,decodedFramesDigest:digest,extractorArgumentsDigest:digest,
 sourceFrames:z.array(z.object({frameIndex:count,sourceStartTicks:rational,validSampleCount:positive}).strict()).min(1).max(1000000),outputFrames:z.array(z.object({frameIndex:count,startSample:count,validSampleCount:positive}).strict()).min(1).max(1000000),
 mappingSegments:z.array(z.object({outputStartSample:count,outputEndSample:positive,sourceStartTicks:rational,sourceEndTicks:rational}).strict()).min(1).max(1000000),mappingDigest:digest,
}).strict().superRefine((v,c)=>{const issue=(message:string)=>c.addIssue({code:'custom',message});const witness=assetAsrPcmTimingWitness.safeParse(Object.fromEntries(Object.keys(assetAsrPcmTimingWitness.shape).map(k=>[k,(v as Record<string,unknown>)[k]])));if(!witness.success)issue('PCM元数据不完整');if(v.sourceSampleRate!==v.outputSampleRate||v.sourceSkipSamples!==0||v.sourceDiscardPadding!==0||v.outputTrimStartSamples!==0||v.outputTrimEndSamples!==0||v.sourceDecodedSampleCount!==v.outputValidSampleCount)issue('当前真实映射只支持原生PCM同采样率完整样本');let output=0,source=0;for(const [i,f] of v.outputFrames.entries()){if(f.frameIndex!==i||f.startSample!==output)issue('输出实际帧必须覆盖全部样本');output+=f.validSampleCount;}for(const [i,f] of v.sourceFrames.entries()){if(f.frameIndex!==i)issue('源实际帧顺序不符');source+=f.validSampleCount;}if(output!==v.outputDecodedSampleCount||source!==v.sourceDecodedSampleCount)issue('完整实际帧样本数不符');let sample=0;for(const s of v.mappingSegments){if(s.outputStartSample!==sample||s.outputEndSample<=sample)issue('映射段没有覆盖全部有效样本');sample=s.outputEndSample;}if(sample!==v.outputValidSampleCount)issue('完整映射范围不符');});
export type AssetAsrProviderTiming=z.infer<typeof assetAsrProviderTiming>;
export type AssetAsrPcmMappingReceipt=z.infer<typeof assetAsrPcmMappingReceipt>;

// SEMANTIC_BOUNDARY_ALLOW: v2仅证明AAC完整解码、重采样和时钟身份，不判断文本或删留。
const sampleFrame = z.object({ frameIndex: count, startSample: count, validSampleCount: positive }).strict();
const aacPacket = z.object({ packetIndex: count, pts: z.number().int().min(-1024).max(Number.MAX_SAFE_INTEGER), dts: z.number().int().min(-1024).max(Number.MAX_SAFE_INTEGER), duration: positive, sideData: z.array(z.object({ side_data_type: z.literal('Skip Samples'), skip_samples: count, discard_padding: count, skip_reason: z.literal(0), discard_reason: z.literal(0) }).strict()).max(1) }).strict();
const toolIdentity = z.object({ realpath: id, binaryDigest: digest, versionOutput: z.string().min(1).max(131072), versionOutputDigest: digest, versionArguments: z.tuple([z.literal('-version')]), platform: id, arch: id }).strict();
export const assetAsrAacMappingReceipt = z.object({
    protocol: z.literal('asset-asr-pcm-mapping/v2'), assetId: id, assetFileId: id, fileDigest: digest, probeDigest: digest, streamIndex: count,
    container: z.enum(['mov', 'mp4']), codec: z.literal('aac'), profile: z.literal('LC'), channelLayout: z.literal('mono'),
    sourceSampleRate: z.literal(48000), sourceTimebase: z.object({ num: positive, den: positive }).strict(), videoTimebase: z.object({ num: positive, den: positive }).strict(), sourceDurationTicks: positive, sourceClockOriginTicks: z.literal(0), sourceClockOriginSeconds: rational,
    sourceFirstEffectiveSamplePts: rational, firstOutputSampleSourcePts: rational, ptsUnits: z.literal('source_ticks'),
    sourceProbeDigest: digest, packetEvidenceDigest: digest, editListEvidenceDigest: digest, movieTimescale: z.literal(48000), mediaTimescale: z.literal(48000), audioTrackId: positive,
    editEntries: z.array(z.object({ segmentDuration: positive, mediaTime: z.literal(1024), rateInteger: z.literal(1), rateFraction: z.literal(0) }).strict()).length(1),
    sourcePackets: z.array(aacPacket).min(2).max(1000000), firstPacketPts: z.literal(-1024), sourceSkipSamples: z.literal(1024), lastPacketPts: count, lastPacketDuration: positive.max(1024), sourceDiscardPadding: count.max(1023),
    sourceFrames: z.array(z.object({ frameIndex: count, sourceStartTicks: rational, validSampleCount: positive.max(1024) }).strict()).min(1).max(1000000),
    sourceFramesAlreadySkipApplied: z.literal(true), primingConsumption: z.literal('decoder_applied_once'), sourceDecodedSampleCount: positive, packetEffectiveEndSample: positive, lastPacketEffectiveDuration: positive.max(1024), decodedFramesDigest: digest,
    ffmpeg: toolIdentity, ffprobe: toolIdentity, toolPairDigest: digest, extractorArguments: z.array(z.string()).min(1).max(256), extractorArgumentsDigest: digest,
    probeArguments: z.array(z.array(z.string()).min(1).max(256)).length(3), probeArgumentsDigest: digest,
    outputEncoding: z.literal('pcm_s16le'), outputSampleRate: z.literal(16000), outputValidSampleCount: positive, outputDecodedSampleCount: positive, outputTrimStartSamples: z.literal(0), outputTrimEndSamples: z.literal(0),
    outputFrames: z.array(sampleFrame).min(1).max(1000000), resamplerFlushFrameSampleCount: positive, wavProbeFrames: z.array(sampleFrame).min(1).max(1000000), wavProbeDecodedSampleCount: positive,
    outputProbeDigest: digest, audioDigest: digest, audioPcmDigest: digest, audioPcmByteLength: positive,
    mappingRule: z.literal('zero-origin-rational-resample/v1'), mappingSegments: z.array(z.object({ outputStartSample: count, outputEndSample: positive, sourceStartTicks: rational, sourceEndTicks: rational }).strict()).length(1),
    actualExtractionReceiptId: id, actualExtractionDigest: digest, mappingDigest: digest,
}).strict().superRefine((v, c) => {
    const issue = (message: string) => c.addIssue({ code: 'custom', message });
    const S = BigInt(v.sourceDecodedSampleCount), N = BigInt(v.outputValidSampleCount);
    if (v.sourceFrames.reduce((n, f) => n + BigInt(f.validSampleCount), 0n) !== S || v.sourcePackets.length !== v.sourceFrames.length + 1 || v.packetEffectiveEndSample !== v.sourceDecodedSampleCount || v.editEntries[0]!.segmentDuration !== v.sourceDecodedSampleCount || v.lastPacketDuration !== v.lastPacketEffectiveDuration || v.sourceDiscardPadding !== 1024 - v.lastPacketDuration)
        issue('AAC完整packet、单edit与已解码样本不闭合');
    if (N !== (S + 2n) / 3n || v.outputDecodedSampleCount !== v.outputValidSampleCount || v.wavProbeDecodedSampleCount !== v.outputValidSampleCount || BigInt(v.audioPcmByteLength) !== 2n * N)
        issue('实际完整重采样与PCM总样本不闭合');
    for (const frames of [v.outputFrames, v.wavProbeFrames]) {
        let end = 0n;
        for (const [i, f] of frames.entries()) {
            if (f.frameIndex !== i || BigInt(f.startSample) !== end)
                issue('实际帧身份与样本覆盖不连续');
            end += BigInt(f.validSampleCount);
        }
        if (end !== N)
            issue('实际输出帧覆盖不完整');
    }
});
export type AssetAsrAacMappingReceipt = z.infer<typeof assetAsrAacMappingReceipt>;

// SEMANTIC_BOUNDARY_ALLOW: R6完整解码覆盖与编辑表呈现域分别验证，不把域外样本判断为静音或作创作选择。
export const assetAsrAacDecodedMappingReceipt=z.object({
 ...assetAsrAacMappingReceipt.shape,
 decodedDomainProtocol:z.literal('full-decoded-presentation-boundary/v1'),
 sourcePresentationSampleCount:positive,sourceAudioDurationSamples:positive,sourceDecodedEndSample:positive,decodedOutOfPresentationSampleCount:count.max(1023),
 sourceDiscardPadding:z.null(),
 tailEvidence:z.object({kind:z.literal('single-frame-outside-edit'),packetDiscardSideData:z.literal('absent')}).strict(),
 outputRetainedSampleCount:positive,
}).strict().superRefine((v,c)=>{
 const issue=(message:string)=>c.addIssue({code:'custom',message});const S=BigInt(v.sourcePresentationSampleCount),D=BigInt(v.sourceDecodedSampleCount),N=BigInt(v.outputRetainedSampleCount);
 if(v.sourceFrames.reduce((n,f)=>n+BigInt(f.validSampleCount),0n)!==D||v.sourcePackets.length!==v.sourceFrames.length+1||v.packetEffectiveEndSample!==v.sourcePresentationSampleCount||v.sourceAudioDurationSamples!==v.sourcePresentationSampleCount||v.editEntries[0]!.segmentDuration!==v.sourcePresentationSampleCount||v.lastPacketDuration!==v.lastPacketEffectiveDuration||D-S!==BigInt(v.decodedOutOfPresentationSampleCount)||v.decodedOutOfPresentationSampleCount!==1024-v.lastPacketDuration||v.sourceDecodedEndSample!==v.sourceDecodedSampleCount)issue('完整解码与有效呈现只能在最后单帧分歧');
 if(N!==(D+2n)/3n||v.outputDecodedSampleCount!==v.outputRetainedSampleCount||v.outputValidSampleCount!==v.outputRetainedSampleCount||v.wavProbeDecodedSampleCount!==v.outputRetainedSampleCount||BigInt(v.audioPcmByteLength)!==2n*N)issue('实际完整重采样与PCM总样本不闭合');
 for(const frames of [v.outputFrames,v.wavProbeFrames]){let end=0n;for(const [i,f] of frames.entries()){if(f.frameIndex!==i||BigInt(f.startSample)!==end)issue('实际帧身份与样本覆盖不连续');end+=BigInt(f.validSampleCount);}if(end!==N)issue('实际输出帧覆盖不完整');}
});
export type AssetAsrAacDecodedMappingReceipt=z.infer<typeof assetAsrAacDecodedMappingReceipt>;
