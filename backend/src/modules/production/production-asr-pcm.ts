import {readFile,writeFile,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolveFfmpegPath,resolveFfprobePath} from '@creatoros/ai-worker';
import {assetAsrAacMappingReceipt,assetAsrAacDecodedMappingReceipt,type AssetAsrInput} from '@creatoros/contract/execution-worker';
import {buildChildEnv} from '../execution/child-env';
import {byteHash,hash} from './production-mechanical-digest';
import {rationalTicks,pcmMappingDigests,aacMappingDigests,aacDecodedMappingDigests,verifyPcmMapping} from './production-asr-timing';
const command=promisify(execFile);
const positive=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const clock=(v:unknown)=>{const parts=String(v).split('/').map(Number);return parts.length===2&&positive(parts[0])&&positive(parts[1])?{num:parts[0]!,den:parts[1]!}:null;};
// SEMANTIC_BOUNDARY_ALLOW: 实际native PCM编解码和全部帧时间证据决定映射可验证性；不理解文字，不据首PTS/sampleRate猜连续。
export async function extractVerifiedNativePcm(path:string,root:string,input:AssetAsrInput,signal?:AbortSignal,precisionProbeMaxBufferBytes=128*1024*1024){const ffprobe=resolveFfprobePath(),ffmpeg=resolveFfmpegPath(),options={signal,env:buildChildEnv(),windowsHide:true,maxBuffer:precisionProbeMaxBufferBytes};const probe=async(file:string)=>JSON.parse((await command(ffprobe,['-v','error','-show_streams','-show_frames','-of','json',file],options)).stdout);const source=await probe(path),video=source.streams?.find((s:any)=>s.codec_type==='video'),audioStream=source.streams?.find((s:any)=>s.codec_type==='audio'),videoFrames=source.frames?.filter((f:any)=>f.media_type==='video'&&f.stream_index===video?.index),frames=source.frames?.filter((f:any)=>f.media_type==='audio'&&f.stream_index===audioStream?.index),tb=clock(video?.time_base),audioTb=clock(audioStream?.time_base),rate=Number(audioStream?.sample_rate);
 if(audioStream?.codec_name==='aac')return extractVerifiedAac(path,root,input,source,ffmpeg,ffprobe,options);
 if(!video||!audioStream||!tb||!audioTb||!positive(rate)||!/^pcm_(s|u|f)\d+(le|be)$/.test(String(audioStream.codec_name))||tb.num!==input.source.timebase.num||tb.den!==input.source.timebase.den||video.duration_ts!==input.source.durationTicks||!Number.isSafeInteger(video.start_pts)||!videoFrames?.length||videoFrames[0].pts!==video.start_pts||!Number.isSafeInteger(audioStream.index)||!frames?.length||frames.some((f:any)=>!Number.isSafeInteger(f.pts)||!positive(f.nb_samples)||(f.side_data_list??[]).some((d:any)=>d.skip_samples!==undefined&&d.skip_samples!==0||d.discard_padding!==undefined&&d.discard_padding!==0)))return null;
 const sourceFrames=frames.map((f:any,i:number)=>({frameIndex:i,sourceStartTicks:rationalTicks(BigInt(f.pts)*BigInt(audioTb.num)*BigInt(tb.den)-BigInt(video.start_pts)*BigInt(tb.num)*BigInt(audioTb.den),BigInt(audioTb.den)*BigInt(tb.num)),validSampleCount:f.nb_samples})),count=sourceFrames.reduce((n:number,f:any)=>n+f.validSampleCount,0);if(!positive(count))return null;
 for(let i=1;i<sourceFrames.length;i++){const a=sourceFrames[i-1]!,b=sourceFrames[i]!,expected=rationalTicks(BigInt(a.sourceStartTicks.num)*BigInt(rate)*BigInt(tb.num)+BigInt(a.validSampleCount)*BigInt(tb.den)*BigInt(a.sourceStartTicks.den),BigInt(a.sourceStartTicks.den)*BigInt(rate)*BigInt(tb.num));if(expected.num!==b.sourceStartTicks.num||expected.den!==b.sourceStartTicks.den)return null;}
 const audioPath=join(root,'verified-audio.wav'),args=['-v','error','-i',path,'-map',`0:${audioStream.index}`,'-vn','-ac','1','-c:a','pcm_s16le','-f','wav','-y',audioPath];await command(ffmpeg,args,options);const bytes=await readFile(audioPath),output=await probe(audioPath),stream=output.streams?.find((s:any)=>s.codec_type==='audio'),outFrames=output.frames?.filter((f:any)=>f.media_type==='audio'),outTb=clock(stream?.time_base);if(stream?.codec_name!=='pcm_s16le'||Number(stream.sample_rate)!==rate||!outTb||outTb.num!==1||outTb.den!==rate||!outFrames?.length||outFrames.some((f:any)=>!Number.isSafeInteger(f.pts)||!positive(f.nb_samples)))return null;
 const outputFrames=outFrames.map((f:any,i:number)=>({frameIndex:i,startSample:f.pts,validSampleCount:f.nb_samples})),outputCount=outputFrames.reduce((n:number,f:any)=>n+f.validSampleCount,0);if(outputCount!==count)return null;const start=sourceFrames[0]!.sourceStartTicks,end=rationalTicks(BigInt(start.num)*BigInt(rate)*BigInt(tb.num)+BigInt(count)*BigInt(tb.den)*BigInt(start.den),BigInt(start.den)*BigInt(rate)*BigInt(tb.num));const audioDigest=`sha256:${byteHash(bytes)}`,sourceProbeDigest=`sha256:${hash(source)}`,outputProbeDigest=`sha256:${hash(output)}`,extractorArgumentsDigest=`sha256:${hash(args.map(v=>v===path?'exact-original':v===audioPath?'verified-audio-output':v))}`,body={protocol:'asset-asr-pcm-mapping/v1' as const,assetId:input.source.assetId,assetFileId:input.source.assetFileId,fileDigest:`sha256:${input.source.fileDigest}`,probeDigest:`sha256:${input.source.probeDigest}`,streamIndex:audioStream.index,ptsUnits:'source_ticks' as const,sourceSampleRate:rate,sourceDecodedSampleCount:count,sourceTimebase:tb,sourceDurationTicks:input.source.durationTicks,sourceFirstEffectiveSamplePts:start,firstOutputSampleSourcePts:start,outputEncoding:'pcm_s16le' as const,outputSampleRate:rate,outputValidSampleCount:count,outputDecodedSampleCount:outputCount,sourceSkipSamples:0,sourceDiscardPadding:0,outputTrimStartSamples:0,outputTrimEndSamples:0,actualExtractionReceiptId:`asset-asr-extraction:${hash({sourceIdentity:input.source,sourceProbeDigest,outputProbeDigest,extractorArgumentsDigest,audioDigest})}`,audioDigest,sourceClockOriginSeconds:rationalTicks(BigInt(video.start_pts)*BigInt(tb.num),BigInt(tb.den)),sourceProbeDigest,outputProbeDigest,decodedFramesDigest:`sha256:${hash({sourceFrames,outputFrames})}`,extractorArgumentsDigest,sourceFrames,outputFrames,mappingSegments:[{outputStartSample:0,outputEndSample:count,sourceStartTicks:start,sourceEndTicks:end}]};const mappingReceipt={...body,...pcmMappingDigests(body)};if(!verifyPcmMapping(mappingReceipt,input.source))return null;return{bytes,evidence:{schemaVersion:1,assetFileId:input.source.assetFileId,fileDigest:input.source.fileDigest,sourceStreamIndex:audioStream.index,sourceClockOrigin:rationalTicks(BigInt(video.start_pts)*BigInt(tb.num),BigInt(tb.den)),firstDecodedSamplePts:rationalTicks(BigInt(frames[0].pts)*BigInt(audioTb.num),BigInt(audioTb.den)),sampleRate:rate,decodedValidSampleCount:count,initialSkipSamples:0,trailingDiscardSamples:0,probeEvidenceDigest:hash({source,output}),extractorArgumentsDigest:extractorArgumentsDigest.slice(7),audioDigest,audioByteLength:bytes.length,mappingStatus:'verified' as const,mappingReceipt,reason:'原生PCM与输出WAV全部实际帧、时钟原点、偏移和样本覆盖已冻结'}};}


// ISO BMFF直接读取完整elst；未知结构不猜。只读字节身份，不创建第二个媒体入口。
type Box = {
    type: string;
    start: number;
    end: number;
    data: number;
};
function boxes(bytes: Buffer, start = 0, end = bytes.length): Box[] { const result: Box[] = []; while (start < end) {
    if (end - start < 8)
        throw Error('ISO box不完整');
    let size = bytes.readUInt32BE(start), header = 8;
    if (size === 1) {
        if (end - start < 16)
            throw Error('ISO large box不完整');
        const n = bytes.readBigUInt64BE(start + 8);
        if (n > BigInt(Number.MAX_SAFE_INTEGER))
            throw Error('ISO box过大');
        size = Number(n);
        header = 16;
    }
    else if (size === 0)
        size = end - start;
    if (size < header || start + size > end)
        throw Error('ISO box越界');
    result.push({ type: bytes.toString('ascii', start + 4, start + 8), start, end: start + size, data: start + header });
    start += size;
} return result; }
function editEvidence(bytes: Buffer, trackId: number) {
    const top = boxes(bytes), one = (xs: Box[], type: string) => { const found = xs.filter(x => x.type === type); if (found.length !== 1)
        throw Error('ISO box缺失或重复'); return found[0]!; }, children = (b: Box) => boxes(bytes, b.data, b.end), moov = one(top, 'moov'), mvhd = one(children(moov), 'mvhd'), ftyp = one(top, 'ftyp');
    const brand = bytes.toString('ascii', ftyp.data, ftyp.data + 4);
    if (ftyp.end - ftyp.data < 8 || !['qt  ', 'isom', 'iso2', 'mp41', 'mp42', 'avc1'].includes(brand))
        throw Error('未知MOV/MP4品牌');
    const timescale = (b: Box) => { const version = bytes[b.data]; if (version !== 0 && version !== 1)
        throw Error('ISO未知时钟版本'); return bytes.readUInt32BE(b.data + (version === 1 ? 20 : 12)); }, movieTimescale = timescale(mvhd);
    let selected: Box | undefined;
    for (const trak of children(moov).filter(b => b.type === 'trak')) {
        const tkhd = one(children(trak), 'tkhd'), version = bytes[tkhd.data];
        if (version !== 0 && version !== 1)
            throw Error('ISO未知track版本');
        const id = bytes.readUInt32BE(tkhd.data + (version === 1 ? 20 : 12));
        if (id === trackId) {
            if (selected)
                throw Error('ISO重复音轨');
            selected = trak;
        }
    }
    if (!selected)
        throw Error('ISO音轨身份缺失');
    const mdia = one(children(selected), 'mdia'), hdlr = one(children(mdia), 'hdlr');
    if (bytes.toString('ascii', hdlr.data + 8, hdlr.data + 12) !== 'soun')
        throw Error('ISO音轨类型不符');
    const mediaTimescale = timescale(one(children(mdia), 'mdhd')), elst = one(children(one(children(selected), 'edts')), 'elst'), version = bytes[elst.data], entries = bytes.readUInt32BE(elst.data + 4);
    if (bytes.readUIntBE(elst.data + 1, 3) !== 0 || (version !== 0 && version !== 1) || entries !== 1 || elst.end - elst.data !== 8 + (version === 1 ? 20 : 12))
        throw Error('ISO只支持单完整priming edit');
    const at = elst.data + 8, segment = version === 1 ? bytes.readBigUInt64BE(at) : BigInt(bytes.readUInt32BE(at)), media = version === 1 ? bytes.readBigInt64BE(at + 8) : BigInt(bytes.readInt32BE(at + 4)), rate = at + (version === 1 ? 16 : 8);
    if (segment > BigInt(Number.MAX_SAFE_INTEGER) || media !== BigInt(1024))
        throw Error('ISO edit不闭合');
    return { container: brand === 'qt  ' ? 'mov' as const : 'mp4' as const, movieTimescale, mediaTimescale, audioTrackId: trackId, editEntries: [{ segmentDuration: Number(segment), mediaTime: Number(media), rateInteger: bytes.readInt16BE(rate), rateFraction: bytes.readInt16BE(rate + 2) }] };
}
function wavPcm(bytes: Buffer): Buffer | null { if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE' || bytes.readUInt32LE(4) + 8 !== bytes.length)
    return null; let at = 12, format = false, data: Buffer | undefined; while (at + 8 <= bytes.length) {
    const n = bytes.readUInt32LE(at + 4), end = at + 8 + n;
    if (end > bytes.length)
        return null;
    const tag = bytes.toString('ascii', at, at + 4);
    if (tag === 'fmt ') {
        if (format || n < 16 || bytes.readUInt16LE(at + 8) !== 1 || bytes.readUInt16LE(at + 10) !== 1 || bytes.readUInt32LE(at + 12) !== 16000 || bytes.readUInt16LE(at + 20) !== 2 || bytes.readUInt16LE(at + 22) !== 16)
            return null;
        format = true;
    }
    if (tag === 'data') {
        if (data)
            return null;
        data = bytes.subarray(at + 8, end);
    }
    at = end + (n % 2);
} return at === bytes.length && format && data && data.length % 2 === 0 ? data : null; }
// SEMANTIC_BOUNDARY_ALLOW: AAC物理证据参数化闭合；不按版本白名单或总秒数猜时码。
async function extractVerifiedAac(path: string, root: string, input: AssetAsrInput, source: any, ffmpeg: string, ffprobe: string, options: Parameters<typeof command>[2]) {
    const video = source.streams?.find((s: any) => s.codec_type === 'video'), audio = source.streams?.find((s: any) => s.codec_type === 'audio'), tb = clock(video?.time_base), audioTb = clock(audio?.time_base), videoFrames = source.frames?.filter((f: any) => f.media_type === 'video' && f.stream_index === video?.index), frames = source.frames?.filter((f: any) => f.media_type === 'audio' && f.stream_index === audio?.index);
    if (source.streams?.filter((s: any) => s.codec_type === 'audio').length !== 1 || !video || !audio || !tb || !audioTb || tb.num !== input.source.timebase.num || tb.den !== input.source.timebase.den || video.duration_ts !== input.source.durationTicks || video.start_pts !== 0 || videoFrames?.[0]?.pts !== 0 || audio.start_pts !== 0 || audio.codec_name !== 'aac' || audio.profile !== 'LC' || audio.channels !== 1 || audio.channel_layout !== 'mono' || Number(audio.sample_rate) !== 48000 || audioTb.num !== 1 || audioTb.den !== 48000 || !frames?.length || frames.some((f: any) => !Number.isSafeInteger(f.pts) || !positive(f.nb_samples) || (f.side_data_list ?? []).length))
        return null;
    const original = await readFile(path);
    if (byteHash(original) !== input.source.fileDigest)
        return null;
    const trackId = Number(audio.id), edit = editEvidence(original, trackId);
    if (edit.movieTimescale !== 48000 || edit.mediaTimescale !== 48000 || edit.editEntries[0]!.rateInteger !== 1 || edit.editEntries[0]!.rateFraction !== 0)
        return null;
    const identity = async (binary: string) => { const resolved = await realpath(binary), before = byteHash(await readFile(resolved)), versionOutput = (await command(resolved, ['-version'], options)).stdout.toString(); if (before !== byteHash(await readFile(resolved)))
        throw Error('工具执行身份改变'); return { realpath: resolved, binaryDigest: `sha256:${before}`, versionOutput, versionOutputDigest: `sha256:${hash(versionOutput)}`, versionArguments: ['-version'], platform: process.platform, arch: process.arch }; };
    const ffmpegIdentity = await identity(ffmpeg), ffprobeIdentity = await identity(ffprobe);
    const sourceArgs = ['-v', 'error', '-show_streams', '-show_frames', '-of', 'json', path], packetArgs = ['-v', 'error', '-select_streams', String(audio.index), '-show_streams', '-show_packets', '-show_frames', '-of', 'json', path], sourceBound = JSON.parse((await command(ffprobeIdentity.realpath, sourceArgs, options)).stdout.toString()), packetProbe = JSON.parse((await command(ffprobeIdentity.realpath, packetArgs, options)).stdout.toString()), mixed = packetProbe.packets_and_frames, packets = mixed?.filter((p: any) => p.type === 'packet') ?? packetProbe.packets, decoded = mixed?.filter((p: any) => p.type === 'frame') ?? packetProbe.frames;
    if (hash(sourceBound) !== hash(source) || !packets?.length || !decoded?.length || decoded.length !== frames.length || decoded.some((f: any, i: number) => f.pts !== frames[i].pts || f.nb_samples !== frames[i].nb_samples))
        return null;
    const sourcePackets = packets.map((p: any, i: number) => ({ packetIndex: i, pts: p.pts, dts: p.dts, duration: p.duration, sideData: p.side_data_list ?? [] })), sourceFrames = frames.map((f: any, i: number) => ({ frameIndex: i, sourceStartTicks: rationalTicks(BigInt(f.pts) * BigInt(tb.den), BigInt(48000) * BigInt(tb.num)), validSampleCount: f.nb_samples })), S = sourceFrames.reduce((n: number, f: any) => n + f.validSampleCount, 0), last = sourcePackets.at(-1)!;
    const effectiveCount=last.pts+last.duration,r6=last.sideData.length===0&&frames.at(-1).nb_samples===1024;
    if (!positive(S) || audio.duration_ts !== (r6?effectiveCount:S))
        return null;
    const audioPath = join(root, 'verified-audio.wav'), args = ['-nostdin', '-hide_banner', '-loglevel', 'info', '-i', path, '-map', `0:${audio.index}`, '-af', 'aresample=16000,ashowinfo', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-y', audioPath], extracted = await command(ffmpegIdentity.realpath, args, options), bytes = await readFile(audioPath), pcm = wavPcm(bytes);
    if (!pcm)
        return null;
    const outputFrames = [];
    for (const line of extracted.stderr.toString().split(/\r?\n/)) {
        if (!line.includes('Parsed_ashowinfo_'))
            continue;
        const m = /n:(\d+) pts:(-?\d+).*fmt:s16 channels:1 chlayout:mono rate:16000 nb_samples:(\d+)/.exec(line);
        if (!m)
            return null;
        outputFrames.push({ frameIndex: Number(m[1]), startSample: Number(m[2]), validSampleCount: Number(m[3]) });
    }
    if (!outputFrames.length)
        return null;
    const outputArgs = ['-v', 'error', '-show_streams', '-show_frames', '-of', 'json', audioPath], output = JSON.parse((await command(ffprobeIdentity.realpath, outputArgs, options)).stdout.toString()), out = output.streams?.find((s: any) => s.codec_type === 'audio'), wavFrames = output.frames?.filter((f: any) => f.media_type === 'audio');
    if (out?.codec_name !== 'pcm_s16le' || out.channels !== 1 || Number(out.sample_rate) !== 16000 || out.time_base !== '1/16000' || out.start_pts !== undefined && out.start_pts !== 0 || !wavFrames?.length)
        return null;
    const wavProbeFrames = wavFrames.map((f: any, i: number) => ({ frameIndex: i, startSample: f.pts, validSampleCount: f.nb_samples })), N = outputFrames.reduce((n, f) => n + f.validSampleCount, 0), wavCount = wavProbeFrames.reduce((n: number, f: any) => n + f.validSampleCount, 0), audioDigest = `sha256:${byteHash(bytes)}`, sourceProbeDigest = `sha256:${hash(source)}`, outputProbeDigest = `sha256:${hash(output)}`, extractorArgumentsDigest = `sha256:${hash(args)}`, probeArguments = [sourceArgs, packetArgs, outputArgs], probeArgumentsDigest = `sha256:${hash(probeArguments)}`, toolPairDigest = `sha256:${hash({ ffmpeg: ffmpegIdentity, ffprobe: ffprobeIdentity })}`;
    if (byteHash(await readFile(ffmpegIdentity.realpath)) !== ffmpegIdentity.binaryDigest.slice(7) || byteHash(await readFile(ffprobeIdentity.realpath)) !== ffprobeIdentity.binaryDigest.slice(7))
        return null;
    const body = { protocol: 'asset-asr-pcm-mapping/v2' as const, assetId: input.source.assetId, assetFileId: input.source.assetFileId, fileDigest: `sha256:${input.source.fileDigest}`, probeDigest: `sha256:${input.source.probeDigest}`, streamIndex: audio.index, container: edit.container, codec: 'aac' as const, profile: 'LC' as const, channelLayout: 'mono' as const, sourceSampleRate: 48000 as const, sourceTimebase: tb, videoTimebase: tb, sourceDurationTicks: input.source.durationTicks, sourceClockOriginTicks: 0 as const, sourceClockOriginSeconds: { num: '0', den: '1' }, sourceFirstEffectiveSamplePts: { num: '0', den: '1' }, firstOutputSampleSourcePts: { num: '0', den: '1' }, ptsUnits: 'source_ticks' as const, sourceProbeDigest, packetEvidenceDigest: `sha256:${hash(sourcePackets)}`, editListEvidenceDigest: `sha256:${hash({ movieTimescale: edit.movieTimescale, mediaTimescale: edit.mediaTimescale, audioTrackId: edit.audioTrackId, editEntries: edit.editEntries })}`, movieTimescale: 48000 as const, mediaTimescale: 48000 as const, audioTrackId: edit.audioTrackId, editEntries: edit.editEntries, sourcePackets, firstPacketPts: -1024 as const, sourceSkipSamples: 1024 as const, lastPacketPts: last.pts, lastPacketDuration: last.duration, sourceDiscardPadding: 1024 - last.duration, sourceFrames, sourceFramesAlreadySkipApplied: true as const, primingConsumption: 'decoder_applied_once' as const, sourceDecodedSampleCount: S, packetEffectiveEndSample: last.pts + last.duration, lastPacketEffectiveDuration: last.duration, decodedFramesDigest: `sha256:${hash(sourceFrames)}`, ffmpeg: ffmpegIdentity, ffprobe: ffprobeIdentity, toolPairDigest, extractorArguments: args, extractorArgumentsDigest, probeArguments, probeArgumentsDigest, outputEncoding: 'pcm_s16le' as const, outputSampleRate: 16000 as const, outputValidSampleCount: N, outputDecodedSampleCount: N, outputTrimStartSamples: 0 as const, outputTrimEndSamples: 0 as const, outputFrames, resamplerFlushFrameSampleCount: outputFrames.at(-1)!.validSampleCount, wavProbeFrames, wavProbeDecodedSampleCount: wavCount, outputProbeDigest, audioDigest, audioPcmDigest: `sha256:${byteHash(pcm)}`, audioPcmByteLength: pcm.length, mappingRule: 'zero-origin-rational-resample/v1' as const, mappingSegments: [{ outputStartSample: 0, outputEndSample: N, sourceStartTicks: { num: '0', den: '1' }, sourceEndTicks: rationalTicks(BigInt(N) * BigInt(tb.den), BigInt(16000) * BigInt(tb.num)) }], actualExtractionReceiptId: `asset-asr-extraction:${hash({ sourceIdentity: input.source, sourceProbeDigest, outputProbeDigest, extractorArgumentsDigest, probeArgumentsDigest, toolPairDigest, audioDigest })}` };
    if(r6){
      const candidate=assetAsrAacDecodedMappingReceipt.safeParse({...body,decodedDomainProtocol:'full-decoded-presentation-boundary/v1',sourcePresentationSampleCount:effectiveCount,sourceAudioDurationSamples:audio.duration_ts,sourceDecodedEndSample:frames.at(-1).pts+frames.at(-1).nb_samples,decodedOutOfPresentationSampleCount:S-effectiveCount,sourceDiscardPadding:null,tailEvidence:{kind:'single-frame-outside-edit',packetDiscardSideData:'absent'},outputRetainedSampleCount:N,mappingDigest:'sha256:'+'0'.repeat(64),actualExtractionDigest:'sha256:'+'0'.repeat(64)});
      if(!candidate.success)return null;const {mappingDigest:_mapping,actualExtractionDigest:_extraction,...strictBody}=candidate.data;const mappingReceipt=verifyPcmMapping({...strictBody,...aacDecodedMappingDigests(strictBody)},input.source);if(!mappingReceipt)return null;
      return{bytes,evidence:{schemaVersion:1 as const,assetFileId:input.source.assetFileId,fileDigest:input.source.fileDigest,sourceStreamIndex:audio.index,sourceClockOrigin:{num:'0',den:'1'},firstDecodedSamplePts:{num:'0',den:'1'},sampleRate:16000,decodedValidSampleCount:N,initialSkipSamples:1024,trailingDiscardSamples:null,probeEvidenceDigest:hash({source,packetProbe,output}),extractorArgumentsDigest:extractorArgumentsDigest.slice(7),audioDigest,audioByteLength:bytes.length,mappingStatus:'verified' as const,mappingReceipt,reason:'完整解码、实际重采样与WAV覆盖冻结；单帧呈现域外样本保留，词边界另受呈现与视频双域限制'}};
    }
    const candidate = assetAsrAacMappingReceipt.safeParse({ ...body, mappingDigest: 'sha256:' + '0'.repeat(64), actualExtractionDigest: 'sha256:' + '0'.repeat(64) });
    if (!candidate.success)
        return null;
    const { mappingDigest: _mapping, actualExtractionDigest: _extraction, ...strictBody } = candidate.data;
    const proof = { ...strictBody, ...aacMappingDigests(strictBody) };
    const mappingReceipt = verifyPcmMapping(proof, input.source);
    if (!mappingReceipt)
        return null;
    return { bytes, evidence: { schemaVersion: 1 as const, assetFileId: input.source.assetFileId, fileDigest: input.source.fileDigest, sourceStreamIndex: audio.index, sourceClockOrigin: { num: '0', den: '1' }, firstDecodedSamplePts: { num: '0', den: '1' }, sampleRate: 16000, decodedValidSampleCount: N, initialSkipSamples: 1024, trailingDiscardSamples: 1024 - last.duration, probeEvidenceDigest: hash({ source, packetProbe, output }), extractorArgumentsDigest: extractorArgumentsDigest.slice(7), audioDigest, audioByteLength: bytes.length, mappingStatus: 'verified' as const, mappingReceipt, reason: 'AAC单priming edit、完整packet/已消费priming帧、实际resampler与WAV总样本闭合；逐词另核音频及视频双域' } };
}
