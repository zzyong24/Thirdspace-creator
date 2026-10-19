// 只读验证已发生的中性实验，不执行模型、FFmpeg、数据库或生产操作。
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const manifest = JSON.parse(fs.readFileSync(new URL('./raw-evidence.json', import.meta.url), 'utf8'));
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const files = new Map();
for (const record of manifest.files) {
  assert(!files.has(record.key));
  const bytes = fs.readFileSync(record.path);
  assert.equal(bytes.length, record.bytes);
  assert.equal(hash(bytes), record.sha256, record.key);
  files.set(record.key, bytes);
}
const bytes = k => { assert(files.has(k), k); return files.get(k); };
const json = k => JSON.parse(bytes(k));
const text = k => bytes(k).toString('utf8');
const report = n => json('reports/' + n);
const command = process.argv[2];
assert(['cause', 'physics'].includes(command));
if (command === 'cause') {
  const pub = json('public/public-timing-diagnostic.json');
  const diagnosis = json('public/diagnostic-report.json');
  const integrity = json('public/after-integrity.json');
  assert.equal(pub.tasks.length, 2);
  assert.equal(integrity.writer795_drift.length, 0);
  assert.equal(integrity.original_db_drift.length, 0);
  assert.equal(integrity.original_db_opened, false);
  assert.equal(integrity.user_db_opened, false);
  assert.equal(diagnosis.counts.model_or_asr_calls, 0);
  assert.equal(diagnosis.counts.pass, 1);
  assert.equal(diagnosis.counts.fail, 0);
  assert.equal(diagnosis.counts.skip, 0);
  for (const task of pub.tasks) {
    assert.equal(task.inputTimestampMode, 'word');
    assert.equal(task.persistent_public_fields.status, 'succeeded');
    assert.equal(task.task_public_fields.status, 'awaiting_confirmation');
    assert.equal(task.aggregate.length, 1);
    const a = task.aggregate[0];
    assert.equal(a.effectiveAsrPlan.timestampMode, 'word');
    assert.equal(a.granularity, 'text');
    assert.equal(a.hasTiming, false);
    assert.equal(a.timing, null);
    assert.equal(a.tokens, null);
    assert(a.text.length > 20);
    assert.equal(a.orderedCalls.length, 1);
    assert.deepEqual(a.requiredCallIds, [a.orderedCalls[0].callId]);
    const actual = diagnosis.actual_audio_evidence.audio.find(x => 'sha256:' + x.sha256 === a.effectiveAsrPlan.audioDigest);
    assert(actual);
    const audio = bytes('actual-mp3/' + actual.path.split('/').at(-1));
    assert.equal(hash(audio), actual.sha256);
    assert.equal(audio.length, a.effectiveAsrPlan.audioByteLength);
    assert.equal(audio.subarray(0, 3).toString(), 'ID3');
    assert.equal(a.orderedCalls[0].chunkDigest, a.effectiveAsrPlan.audioDigest);
  }
  for (const source of json('public/source-read-hash-manifest.json').files) {
    assert.equal(hash(bytes('source-baseline/' + source.path)), source.sha256);
  }
  const pcm = text('source-baseline/backend/src/modules/production/production-asr-pcm.ts');
  const media = text('source-baseline/backend/src/modules/production/production-asset-asr-media.ts');
  const worker = text('source-baseline/ai-worker/src/execution/asset-asr-worker-run.ts');
  const adapter = text('source-baseline/ai-worker/src/runtime/multimodal-whisper-local.ts');
  assert(pcm.includes('pcm_') && pcm.includes('return null'));
  assert(media.includes("mappingStatus:'unverified'") || media.includes("mappingStatus: 'unverified'"));
  assert(media.includes('mp3'));
  assert(/mappingStatus\s*===\s*['"]verified['"]/.test(worker));
  assert(worker.includes('mappingReceipt') && worker.includes('timingAudio'));
  assert(adapter.includes('wordTimingValidated') && adapter.includes('decodedSampleCount'));
  console.log(JSON.stringify({result:'PASS_RECORDED_PUBLIC_ROOT_CAUSE', tasks:2, source_baselines:11, model_calls:0, production_or_acceptance_pass:false}));
} else {
  const prefix = 't1062-aac-physical-mapping-experiment-r2/';
  const m = json(prefix + 'manifest.json');
  assert.deepEqual(m.source_drift, []);
  assert.equal(m.commands.length, 9);
  for (const c of m.commands) {
    assert.equal(c.exit, 0);
    bytes(prefix + c.stdout); bytes(prefix + c.stderr);
  }
  for (const [name, original] of Object.entries(m.inputs_before)) {
    assert.deepEqual(m.inputs_after[name], original);
    assert.equal(hash(bytes('inputs/' + original.path.split('/').at(-1))), original.sha256);
  }
  for (const [name, output] of Object.entries(m.outputs)) {
    assert.equal(hash(bytes(prefix + name + '-16k.wav')), output.sha256);
  }
  const original = json(prefix + 'normal-probe.stdout');
  const packets = original.packets_and_frames.filter(x => x.type === 'packet');
  const decoded = original.packets_and_frames.filter(x => x.type === 'frame');
  assert.equal(original.streams[0].codec_name, 'aac');
  assert.equal(original.streams[0].sample_rate, '48000');
  assert.equal(original.streams[0].start_pts, 0);
  assert.equal(packets[0].pts, -1024);
  assert.equal(packets[0].duration, 1024);
  assert.equal(packets[0].side_data_list[0].skip_samples, 1024);
  const last = packets.at(-1);
  const S = last.pts + last.duration;
  assert.equal(last.side_data_list[0].discard_padding, 1024 - last.duration);
  for (let i = 1; i < packets.length; i++) assert.equal(packets[i].pts, packets[i - 1].pts + packets[i - 1].duration);
  function continuous(frames, start = 0) {
    let n = start;
    for (const f of frames) { assert.equal(f.pts, n); assert(Number.isSafeInteger(f.nb_samples) && f.nb_samples > 0); n += f.nb_samples; }
    return n - start;
  }
  assert.equal(continuous(decoded), S);
  const log = text(prefix + 'normal-decode16k.stderr');
  const resampled = [...log.matchAll(/n:(\d+) pts:(-?\d+).*?rate:(\d+) nb_samples:(\d+)/g)].map((x, i) => {
    assert.equal(Number(x[1]), i); assert.equal(Number(x[3]), 16000);
    return {pts:Number(x[2]), nb_samples:Number(x[4])};
  });
  assert(resampled.length > decoded.length);
  const N = continuous(resampled);
  assert.equal(N, Math.ceil(S / 3));
  const output = json(prefix + 'normal-output-probe.stdout');
  assert.equal(output.streams[0].codec_name, 'pcm_s16le');
  assert.equal(output.streams[0].sample_rate, '16000');
  assert.equal(continuous(output.frames), N);
  assert.notEqual(output.frames.length, resampled.length);
  const wav = bytes(prefix + 'normal-16k.wav');
  assert.equal(wav.subarray(0, 4).toString(), 'RIFF');
  assert.equal(wav.subarray(8, 12).toString(), 'WAVE');
  let dataSamples = null;
  for (let i = 12; i + 8 <= wav.length;) {
    const tag = wav.subarray(i, i + 4).toString(), size = wav.readUInt32LE(i + 4), start = i + 8;
    assert(start + size <= wav.length);
    if (tag === 'fmt ') { assert.equal(wav.readUInt16LE(start), 1); assert.equal(wav.readUInt16LE(start + 2), 1); assert.equal(wav.readUInt32LE(start + 4), 16000); assert.equal(wav.readUInt16LE(start + 14), 16); }
    if (tag === 'data') dataSamples = size / 2;
    i = start + size + size % 2;
  }
  assert.equal(dataSamples, N);
  const iso = report('t1062-mp4-edit-list-readonly.json');
  for (const [name, evidence] of Object.entries(iso.files)) {
    const raw = bytes('inputs/' + evidence.path.split('/').at(-1));
    assert.equal(hash(raw), evidence.sha256);
    for (const b of evidence.relevant) {
      assert(b.offset + b.size <= raw.length);
      assert.equal(raw.readUInt32BE(b.offset), b.size);
      assert.equal(raw.subarray(b.offset + 4, b.offset + 8).toString(), b.type);
      const z = b.offset + 8;
      if (b.version !== undefined) assert.equal(raw[z], b.version);
      if (b.type === 'mvhd' || b.type === 'mdhd') assert.equal(raw.readUInt32BE(z + 12), b.timescale);
      if (b.type === 'tkhd') assert.equal(raw.readUInt32BE(z + 12), b.track_id);
      if (b.type === 'hdlr') assert.equal(raw.subarray(z + 8, z + 12).toString(), b.handler);
      if (b.type === 'elst') {
        assert.equal(raw[z], 0); assert.equal(raw.readUInt32BE(z + 4), b.entries.length);
        b.entries.forEach((e, i) => { const j = z + 8 + i * 12; assert.equal(raw.readUInt32BE(j), e.segment_duration); assert.equal(raw.readInt32BE(j + 4), e.media_time); assert.equal(raw.readInt16BE(j + 8), e.media_rate_integer); assert.equal(raw.readInt16BE(j + 10), e.media_rate_fraction); });
      }
    }
  }
  const audioEdit = iso.files.normal.relevant.filter(x => x.type === 'elst').at(-1).entries;
  assert.deepEqual(audioEdit, [{segment_duration:S,media_time:1024,media_rate_integer:1,media_rate_fraction:0}]);
  assert.equal(iso.files.offset.relevant.filter(x => x.type === 'elst').at(-1).entries[0].media_time, -1);
  const offset = json(prefix + 'offset-probe.stdout');
  assert.notEqual(offset.streams[0].start_pts, 0);
  const control = json(prefix + 'pcm_control-probe.stdout');
  assert.equal(continuous(control.packets_and_frames.filter(x => x.type === 'frame')), S);
  assert.equal(continuous(json(prefix + 'pcm_control-output-probe.stdout').frames), N);
  assert((N - 1) * 3 <= S && N * 3 > S); // 越界端点必须拒绝，绝不pin或trim。
  assert(S / 48000 > 190976 / 12800); // 两个真实域分别守卫，不裁短完整音频。
  assert.equal(report('t1062-aac-v2-r4-independent-static-review.json').remaining_static_scope_blockers.length, 0);
  console.log(JSON.stringify({result:'PASS_RECORDED_PHYSICAL_MECHANISM', source_frames:decoded.length,resampler_frames:resampled.length,wav_frames:output.frames.length,S,N,offset_supported:false,model_calls:0,production_or_acceptance_pass:false}));
}
