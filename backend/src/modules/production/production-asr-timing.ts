import {assetAsrActualProviderTiming,assetAsrPcmMappingReceipt,assetAsrAacMappingReceipt,assetAsrAacDecodedMappingReceipt,type AssetAsrAacDecodedMappingReceipt,type AssetAsrAacMappingReceipt,type AssetAsrPcmMappingReceipt,type AssetAsrActualProviderTiming} from '@creatoros/contract/execution-worker';
import type {ProductionMainTrack} from '@creatoros/contract';
import {hash} from './production-mechanical-digest';
type R={num:string;den:string};
const gcd=(a:bigint,b:bigint):bigint=>{a=a<BigInt(0)?-a:a;while(b){const r=a%b;a=b;b=r;}return a;};
export const rationalTicks=(num:bigint,den:bigint):R=>{if(den<=BigInt(0))throw Error('真实时钟分母无效');const g=gcd(num,den);return{num:String(num/g),den:String(den/g)};};
const add=(a:R,b:R)=>rationalTicks(BigInt(a.num)*BigInt(b.den)+BigInt(b.num)*BigInt(a.den),BigInt(a.den)*BigInt(b.den));
const equal=(a:R,b:R)=>BigInt(a.num)*BigInt(b.den)===BigInt(b.num)*BigInt(a.den);
const samples=(n:number,p:AssetAsrPcmMappingReceipt|AssetAsrAacMappingReceipt|AssetAsrAacDecodedMappingReceipt)=>rationalTicks(BigInt(n)*BigInt(p.sourceTimebase.den),BigInt(p.outputSampleRate)*BigInt(p.sourceTimebase.num));
export function pcmMappingDigests(p:Omit<AssetAsrPcmMappingReceipt,'mappingDigest'|'actualExtractionDigest'>){return{mappingDigest:`sha256:${hash({sourceFrames:p.sourceFrames,outputFrames:p.outputFrames,mappingSegments:p.mappingSegments,sourceTimebase:p.sourceTimebase,outputSampleRate:p.outputSampleRate})}`,actualExtractionDigest:`sha256:${hash(p)}`};}
// SEMANTIC_BOUNDARY_ALLOW: 只核真实全部decoded帧/原始时钟/样本覆盖和不可变证据，不判断文字语义或作剪辑取舍。
export function verifyPcmMapping(raw:unknown,source:ProductionMainTrack['sources'][number]):AssetAsrPcmMappingReceipt|AssetAsrAacMappingReceipt|AssetAsrAacDecodedMappingReceipt|null{if(typeof raw==='object'&&raw!==null&&'protocol' in raw&&raw.protocol==='asset-asr-pcm-mapping/v2')return 'decodedDomainProtocol' in raw?verifyAacDecodedMapping(raw,source):verifyAacMapping(raw,source);const parsed=assetAsrPcmMappingReceipt.safeParse(raw);if(!parsed.success)return null;const p=parsed.data,{mappingDigest,actualExtractionDigest,...body}=p,expected=pcmMappingDigests(body);if(p.assetId!==source.assetId||p.assetFileId!==source.assetFileId||p.fileDigest!==`sha256:${source.fileDigest}`||p.probeDigest!==`sha256:${source.probeDigest}`||p.sourceDurationTicks!==source.durationTicks||p.sourceTimebase.num!==source.timebase.num||p.sourceTimebase.den!==source.timebase.den||p.actualExtractionReceiptId!==`asset-asr-extraction:${hash({sourceIdentity:source,sourceProbeDigest:p.sourceProbeDigest,outputProbeDigest:p.outputProbeDigest,extractorArgumentsDigest:p.extractorArgumentsDigest,audioDigest:p.audioDigest})}`||mappingDigest!==expected.mappingDigest||actualExtractionDigest!==expected.actualExtractionDigest||p.decodedFramesDigest!==`sha256:${hash({sourceFrames:p.sourceFrames,outputFrames:p.outputFrames})}`)return null;
 let expectedStart=p.sourceFrames[0]!.sourceStartTicks;for(const frame of p.sourceFrames){if(!equal(frame.sourceStartTicks,expectedStart))return null;expectedStart=add(frame.sourceStartTicks,samples(frame.validSampleCount,p));}if(!equal(p.firstOutputSampleSourcePts,p.sourceFrames[0]!.sourceStartTicks)||!equal(p.sourceFirstEffectiveSamplePts,p.sourceFrames[0]!.sourceStartTicks))return null;
 let offset=0;for(const segment of p.mappingSegments){const start=add(p.firstOutputSampleSourcePts,samples(offset,p)),end=add(start,samples(segment.outputEndSample-segment.outputStartSample,p));if(segment.outputStartSample!==offset||!equal(segment.sourceStartTicks,start)||!equal(segment.sourceEndTicks,end))return null;offset=segment.outputEndSample;}if(offset!==p.outputValidSampleCount||!equal(expectedStart,add(p.firstOutputSampleSourcePts,samples(offset,p))))return null;if(BigInt(p.firstOutputSampleSourcePts.num)<BigInt(0)||BigInt(expectedStart.num)>BigInt(p.sourceDurationTicks)*BigInt(expectedStart.den))return null;return p;}
export function mapAssetAsrTiming(raw:unknown,witness:unknown,source:ProductionMainTrack['sources'][number],aggregateReceiptId:string){const proof=verifyPcmMapping(witness,source),parsed=assetAsrActualProviderTiming.safeParse(raw);if(!proof||!parsed.success)return null;const timing=parsed.data;if(timing.audioDigest!==proof.audioDigest||timing.sampleRate!==proof.outputSampleRate||timing.validSampleCount!==proof.outputValidSampleCount)return null;
 const boundary=(sample:number)=>{if(proof.protocol==='asset-asr-pcm-mapping/v2'&&BigInt(sample)*BigInt(proof.sourceSampleRate)>BigInt('decodedDomainProtocol' in proof?proof.sourcePresentationSampleCount:proof.sourceDecodedSampleCount)*BigInt(proof.outputSampleRate))return null;const v=add(proof.firstOutputSampleSourcePts,samples(sample,proof));if(BigInt(v.num)%BigInt(v.den))return null;const n=BigInt(v.num)/BigInt(v.den);return n>=BigInt(0)&&n<=BigInt(source.durationTicks)&&n<=BigInt(Number.MAX_SAFE_INTEGER)?Number(n):null;};const tokens=[];for(const unit of timing.ranges){const startTicks=boundary(unit.startSample),endTicks=boundary(unit.endSample);if(startTicks===null||endTicks===null||endTicks<=startTicks)return null;tokens.push({tokenId:`asr-token-${hash({aggregateReceiptId,callId:timing.callId,providerUnitId:unit.id})}`,text:unit.text,startTicks,endTicks});}return{granularity:timing.granularity,tokens,timingReceipt:{callId:timing.callId,durableReceiptId:timing.durableReceiptId,rawResponseDigest:timing.rawResponseDigest,extractionReceiptId:proof.actualExtractionReceiptId,extractionDigest:proof.actualExtractionDigest,mappingDigest:proof.mappingDigest}};}


export function aacMappingDigests(p: Omit<AssetAsrAacMappingReceipt, 'mappingDigest' | 'actualExtractionDigest'>) { return { mappingDigest: `sha256:${hash({ mappingRule: p.mappingRule, sourceFrames: p.sourceFrames, outputFrames: p.outputFrames, mappingSegments: p.mappingSegments, sourceTimebase: p.sourceTimebase, sourceDecodedSampleCount: p.sourceDecodedSampleCount, outputSampleRate: p.outputSampleRate })}`, actualExtractionDigest: `sha256:${hash(p)}` }; }
// SEMANTIC_BOUNDARY_ALLOW: 参数化packet/edit/decoded/resampler/WAV闭合；不作创作选择或猜词。
export function verifyAacMapping(raw: unknown, source: ProductionMainTrack['sources'][number]): AssetAsrAacMappingReceipt | null {
    const parsed = assetAsrAacMappingReceipt.safeParse(raw);
    if (!parsed.success)
        return null;
    const p = parsed.data, { mappingDigest, actualExtractionDigest, ...body } = p, expected = aacMappingDigests(body), S = BigInt(p.sourceDecodedSampleCount), N = BigInt(p.outputValidSampleCount);
    if (p.assetId !== source.assetId || p.assetFileId !== source.assetFileId || p.fileDigest !== `sha256:${source.fileDigest}` || p.probeDigest !== `sha256:${source.probeDigest}` || p.sourceDurationTicks !== source.durationTicks || p.sourceTimebase.num !== source.timebase.num || p.sourceTimebase.den !== source.timebase.den || p.videoTimebase.num !== source.timebase.num || p.videoTimebase.den !== source.timebase.den || !equal(p.sourceClockOriginSeconds, { num: '0', den: '1' }) || !equal(p.sourceFirstEffectiveSamplePts, { num: '0', den: '1' }) || !equal(p.firstOutputSampleSourcePts, { num: '0', den: '1' }) || mappingDigest !== expected.mappingDigest || actualExtractionDigest !== expected.actualExtractionDigest)
        return null;
    const originalPath = p.extractorArguments[5], outputPath = p.extractorArguments.at(-1);
    if (!originalPath || !outputPath || hash(p.extractorArguments) !== hash(['-nostdin', '-hide_banner', '-loglevel', 'info', '-i', originalPath, '-map', `0:${p.streamIndex}`, '-af', 'aresample=16000,ashowinfo', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-y', outputPath]) || hash(p.probeArguments) !== hash([['-v', 'error', '-show_streams', '-show_frames', '-of', 'json', originalPath], ['-v', 'error', '-select_streams', String(p.streamIndex), '-show_streams', '-show_packets', '-show_frames', '-of', 'json', originalPath], ['-v', 'error', '-show_streams', '-show_frames', '-of', 'json', outputPath]]))
        return null;
    const tools = [p.ffmpeg, p.ffprobe];
    if (tools.some(t => t.versionOutputDigest !== `sha256:${hash(t.versionOutput)}`) || p.toolPairDigest !== `sha256:${hash({ ffmpeg: p.ffmpeg, ffprobe: p.ffprobe })}` || p.extractorArgumentsDigest !== `sha256:${hash(p.extractorArguments)}` || p.probeArgumentsDigest !== `sha256:${hash(p.probeArguments)}` || p.actualExtractionReceiptId !== `asset-asr-extraction:${hash({ sourceIdentity: source, sourceProbeDigest: p.sourceProbeDigest, outputProbeDigest: p.outputProbeDigest, extractorArgumentsDigest: p.extractorArgumentsDigest, probeArgumentsDigest: p.probeArgumentsDigest, toolPairDigest: p.toolPairDigest, audioDigest: p.audioDigest })}`)
        return null;
    if (p.packetEvidenceDigest !== `sha256:${hash(p.sourcePackets)}` || p.editListEvidenceDigest !== `sha256:${hash({ movieTimescale: p.movieTimescale, mediaTimescale: p.mediaTimescale, audioTrackId: p.audioTrackId, editEntries: p.editEntries })}` || p.decodedFramesDigest !== `sha256:${hash(p.sourceFrames)}`)
        return null;
    let packetEnd = BigInt(-1024);
    for (const [i, packet] of p.sourcePackets.entries()) {
        const first = i === 0, last = i === p.sourcePackets.length - 1, side = packet.sideData[0];
        if (packet.packetIndex !== i || BigInt(packet.pts) !== packetEnd || packet.dts !== packet.pts || (!last && packet.duration !== 1024) || (!first && !last && packet.sideData.length !== 0) || first && (!side || side.skip_samples !== 1024 || side.discard_padding !== 0) || last && (packet.duration !== p.lastPacketDuration || packet.pts !== p.lastPacketPts || p.sourceDiscardPadding !== 1024 - packet.duration || p.sourceDiscardPadding > 0 && (!side || side.skip_samples !== 0 || side.discard_padding !== p.sourceDiscardPadding)) || last && side && (side.skip_samples !== 0 || side.discard_padding !== p.sourceDiscardPadding))
            return null;
        packetEnd += BigInt(packet.duration);
    }
    if (packetEnd !== S || p.packetEffectiveEndSample !== p.sourceDecodedSampleCount || p.lastPacketEffectiveDuration !== p.lastPacketDuration || p.editEntries[0]!.segmentDuration !== p.sourceDecodedSampleCount || p.sourcePackets.length !== p.sourceFrames.length + 1)
        return null;
    let decoded = BigInt(0);
    for (const [i, f] of p.sourceFrames.entries()) {
        const tick = rationalTicks(decoded * BigInt(p.sourceTimebase.den), BigInt(48000) * BigInt(p.sourceTimebase.num));
        if (f.frameIndex !== i || !equal(f.sourceStartTicks, tick) || f.validSampleCount !== (i === p.sourceFrames.length - 1 ? p.lastPacketEffectiveDuration : 1024))
            return null;
        decoded += BigInt(f.validSampleCount);
    }
    if (decoded !== S || N !== (S + BigInt(2)) / BigInt(3) || p.outputDecodedSampleCount !== p.outputValidSampleCount || p.wavProbeDecodedSampleCount !== p.outputValidSampleCount || BigInt(p.audioPcmByteLength) !== N * BigInt(2))
        return null;
    for (const frames of [p.outputFrames, p.wavProbeFrames]) {
        let end = BigInt(0);
        for (const [i, f] of frames.entries()) {
            if (f.frameIndex !== i || BigInt(f.startSample) !== end)
                return null;
            end += BigInt(f.validSampleCount);
        }
        if (end !== N)
            return null;
    }
    if (p.resamplerFlushFrameSampleCount !== p.outputFrames.at(-1)!.validSampleCount)
        return null;
    const segment = p.mappingSegments[0]!;
    if (segment.outputStartSample !== 0 || segment.outputEndSample !== p.outputValidSampleCount || !equal(segment.sourceStartTicks, { num: '0', den: '1' }) || !equal(segment.sourceEndTicks, samples(p.outputValidSampleCount, p)))
        return null;
    return p;
}

// SEMANTIC_BOUNDARY_ALLOW: 只核完整现场输出N与精确整数区间，不生成、裁剪或补齐音频样本，也不判断词边界。
export function aacDecodedOutputCountEvidence(decodedSampleCount:number,sourceSampleRate:number,outputSampleRate:number,retainedSampleCount:number){
 const values=[decodedSampleCount,sourceSampleRate,outputSampleRate,retainedSampleCount];
 if(values.some(n=>!Number.isSafeInteger(n)||n<=0))throw Error('实际完整输出计数或采样率无效');
 const A=BigInt(decodedSampleCount)*BigInt(outputSampleRate),B=BigInt(sourceSampleRate),lower=A/B,upper=(A+B-1n)/B,N=BigInt(retainedSampleCount);
 if(N<lower||N>upper||upper>BigInt(Number.MAX_SAFE_INTEGER))throw Error('实际完整输出超出精确计数区间');
 return{scaledDecodedSampleCount:rationalTicks(A,B),lowerSampleCount:Number(lower),upperSampleCount:Number(upper),retainedSampleCount};
}

// SEMANTIC_BOUNDARY_ALLOW: 完整解码D与呈现S独立绑定；不把域外样本判断为无意义或静音。
export function aacDecodedMappingDigests(p:Omit<AssetAsrAacDecodedMappingReceipt,'mappingDigest'|'actualExtractionDigest'>){return {mappingDigest:`sha256:${hash({mappingRule:p.mappingRule,decodedDomainProtocol:p.decodedDomainProtocol,outputCountPolicy:p.outputCountPolicy,outputCountEvidence:p.outputCountEvidence,sourceFrames:p.sourceFrames,outputFrames:p.outputFrames,mappingSegments:p.mappingSegments,sourceTimebase:p.sourceTimebase,sourcePresentationSampleCount:p.sourcePresentationSampleCount,sourceDecodedSampleCount:p.sourceDecodedSampleCount,outputRetainedSampleCount:p.outputRetainedSampleCount,outputSampleRate:p.outputSampleRate})}`,actualExtractionDigest:`sha256:${hash(p)}`};}
export function verifyAacDecodedMapping(raw: unknown, source: ProductionMainTrack['sources'][number]): AssetAsrAacDecodedMappingReceipt | null {
    const parsed = assetAsrAacDecodedMappingReceipt.safeParse(raw);
    if (!parsed.success)
        return null;
    const p = parsed.data, { mappingDigest, actualExtractionDigest, ...body } = p, expected = aacDecodedMappingDigests(body), S = BigInt(p.sourcePresentationSampleCount), D = BigInt(p.sourceDecodedSampleCount), N = BigInt(p.outputValidSampleCount);
    if (p.assetId !== source.assetId || p.assetFileId !== source.assetFileId || p.fileDigest !== `sha256:${source.fileDigest}` || p.probeDigest !== `sha256:${source.probeDigest}` || p.sourceDurationTicks !== source.durationTicks || p.sourceTimebase.num !== source.timebase.num || p.sourceTimebase.den !== source.timebase.den || p.videoTimebase.num !== source.timebase.num || p.videoTimebase.den !== source.timebase.den || !equal(p.sourceClockOriginSeconds, { num: '0', den: '1' }) || !equal(p.sourceFirstEffectiveSamplePts, { num: '0', den: '1' }) || !equal(p.firstOutputSampleSourcePts, { num: '0', den: '1' }) || mappingDigest !== expected.mappingDigest || actualExtractionDigest !== expected.actualExtractionDigest)
        return null;
    if (hash(p.outputCountEvidence) !== hash(aacDecodedOutputCountEvidence(p.sourceDecodedSampleCount,p.sourceSampleRate,p.outputSampleRate,p.outputRetainedSampleCount)))
        return null;
    const originalPath = p.extractorArguments[5], outputPath = p.extractorArguments.at(-1);
    if (!originalPath || !outputPath || hash(p.extractorArguments) !== hash(['-nostdin', '-hide_banner', '-loglevel', 'info', '-i', originalPath, '-map', `0:${p.streamIndex}`, '-af', 'aresample=16000,ashowinfo', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-y', outputPath]) || hash(p.probeArguments) !== hash([['-v', 'error', '-show_streams', '-show_frames', '-of', 'json', originalPath], ['-v', 'error', '-select_streams', String(p.streamIndex), '-show_streams', '-show_packets', '-show_frames', '-of', 'json', originalPath], ['-v', 'error', '-show_streams', '-show_frames', '-of', 'json', outputPath]]))
        return null;
    const tools = [p.ffmpeg, p.ffprobe];
    if (tools.some(t => t.versionOutputDigest !== `sha256:${hash(t.versionOutput)}`) || p.toolPairDigest !== `sha256:${hash({ ffmpeg: p.ffmpeg, ffprobe: p.ffprobe })}` || p.extractorArgumentsDigest !== `sha256:${hash(p.extractorArguments)}` || p.probeArgumentsDigest !== `sha256:${hash(p.probeArguments)}` || p.actualExtractionReceiptId !== `asset-asr-extraction:${hash({ sourceIdentity: source, sourceProbeDigest: p.sourceProbeDigest, outputProbeDigest: p.outputProbeDigest, extractorArgumentsDigest: p.extractorArgumentsDigest, probeArgumentsDigest: p.probeArgumentsDigest, toolPairDigest: p.toolPairDigest, audioDigest: p.audioDigest })}`)
        return null;
    if (p.packetEvidenceDigest !== `sha256:${hash(p.sourcePackets)}` || p.editListEvidenceDigest !== `sha256:${hash({ movieTimescale: p.movieTimescale, mediaTimescale: p.mediaTimescale, audioTrackId: p.audioTrackId, editEntries: p.editEntries })}` || p.decodedFramesDigest !== `sha256:${hash(p.sourceFrames)}`)
        return null;
    let packetEnd = BigInt(-1024);
    for (const [i, packet] of p.sourcePackets.entries()) {
        const first = i === 0, last = i === p.sourcePackets.length - 1, side = packet.sideData[0];
        if (packet.packetIndex !== i || BigInt(packet.pts) !== packetEnd || packet.dts !== packet.pts || (!last && packet.duration !== 1024) || (!first && !last && packet.sideData.length !== 0) || first && (!side || side.skip_samples !== 1024 || side.discard_padding !== 0) || last && (packet.duration !== p.lastPacketDuration || packet.pts !== p.lastPacketPts || packet.sideData.length !== 0))
            return null;
        packetEnd += BigInt(packet.duration);
    }
    if (packetEnd !== S || p.packetEffectiveEndSample !== p.sourcePresentationSampleCount || p.sourceAudioDurationSamples !== p.sourcePresentationSampleCount || p.lastPacketEffectiveDuration !== p.lastPacketDuration || p.editEntries[0]!.segmentDuration !== p.sourcePresentationSampleCount || p.sourcePackets.length !== p.sourceFrames.length + 1)
        return null;
    let decoded = BigInt(0);
    for (const [i, f] of p.sourceFrames.entries()) {
        const tick = rationalTicks(decoded * BigInt(p.sourceTimebase.den), BigInt(48000) * BigInt(p.sourceTimebase.num));
        if (f.frameIndex !== i || !equal(f.sourceStartTicks, tick) || f.validSampleCount !== 1024 || !equal(f.sourceStartTicks,rationalTicks(BigInt(p.sourcePackets[i+1]!.pts)*BigInt(p.sourceTimebase.den),BigInt(48000)*BigInt(p.sourceTimebase.num))))
            return null;
        decoded += BigInt(f.validSampleCount);
    }
    if (decoded !== D || D-S !== BigInt(1024-p.lastPacketDuration) || p.sourceDecodedEndSample !== p.sourceDecodedSampleCount || p.outputDecodedSampleCount !== p.outputValidSampleCount || p.wavProbeDecodedSampleCount !== p.outputValidSampleCount || BigInt(p.audioPcmByteLength) !== N * BigInt(2))
        return null;
    for (const frames of [p.outputFrames, p.wavProbeFrames]) {
        let end = BigInt(0);
        for (const [i, f] of frames.entries()) {
            if (f.frameIndex !== i || BigInt(f.startSample) !== end)
                return null;
            end += BigInt(f.validSampleCount);
        }
        if (end !== N)
            return null;
    }
    if (p.resamplerFlushFrameSampleCount !== p.outputFrames.at(-1)!.validSampleCount)
        return null;
    const segment = p.mappingSegments[0]!;
    if (segment.outputStartSample !== 0 || segment.outputEndSample !== p.outputValidSampleCount || !equal(segment.sourceStartTicks, { num: '0', den: '1' }) || !equal(segment.sourceEndTicks, samples(p.outputValidSampleCount, p)))
        return null;
    return p;
}
