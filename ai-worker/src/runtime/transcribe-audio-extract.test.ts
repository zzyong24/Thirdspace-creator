import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createTranscribeAudioExtractor, streamAudioFromVideo, TranscribeAudioExtractError } from "./transcribe-audio-extract";
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture() {
  const children: FakeChild[] = [];
  const spawn = vi.fn(() => { const child = new FakeChild(); children.push(child); return child; });
  const deps = { spawn, ffmpegPath: "fake-ffmpeg" };
  return { children, spawn, deps, extract: createTranscribeAudioExtractor(deps) };
}
class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn((_signal?: NodeJS.Signals) => true);
  succeed() { this.stdout.emit("data", new Uint8Array([1, 2])); this.stdout.emit("data", new Uint8Array([3])); this.emit("close", 0); }
}
describe("Worker 独立抽音", () => {
  it("保留 Referer、16kHz、单声道、64k mp3 与 shell-free argv", async () => {
    const f = fixture(); const url = "https://example.invalid/video?a=1&b=2";
    const run = f.extract(url); f.children[0]!.succeed();
    expect(Array.from(await run)).toEqual([1, 2, 3]);
    expect(f.spawn).toHaveBeenCalledWith("fake-ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-headers", "Referer: https://www.douyin.com/\r\n", "-i", url, "-vn", "-ar", "16000", "-ac", "1", "-b:a", "64k", "-f", "mp3", "pipe:1"]);
  });
  it("预取消不解析、不 spawn", async () => {
    const f = fixture(); const resolveFfmpeg = vi.fn(() => "fake"); const c = new AbortController(); c.abort("用户取消");
    const extract = createTranscribeAudioExtractor({ spawn: f.spawn, resolveFfmpeg });
    await expect(extract("fake-url", c.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(resolveFfmpeg).not.toHaveBeenCalled(); expect(f.spawn).not.toHaveBeenCalled();
  }, 1000);
  it("取消 kill 后等 close，期间 error 与输出不能提前结算", async () => {
    const f = fixture(); const c = new AbortController(); let done = false;
    const run = f.extract("fake-url", c.signal).catch(error => { done = true; return error; });
    const child = f.children[0]!; c.abort(); await tick();
    expect(child.kill).toHaveBeenCalledWith("SIGKILL"); expect(done).toBe(false);
    child.emit("error", new Error("进程终止中")); child.stdout.emit("data", new Uint8Array([9])); await tick(); expect(done).toBe(false);
    child.emit("close", null); expect(await run).toMatchObject({ name: "AbortError" });
    const next = f.extract("another-url"); f.children[1]!.succeed(); await next;
  });
  it.each(["throw", "false"])("kill %s 后本次拒绝，旧 close 前阻止新 spawn，随后恢复", async mode => {
    const f = fixture(); const c = new AbortController();
    const run = streamAudioFromVideo("fake-url", f.deps, c.signal).catch(error => error);
    f.children[0]!.kill.mockImplementation(() => { if (mode === "throw") throw new Error("kill 失败"); return false; });
    c.abort(); expect(await run).toMatchObject({ name: "AbortError" });
    await expect(streamAudioFromVideo("next-url", f.deps)).rejects.toThrow("尚未确认退出"); expect(f.spawn).toHaveBeenCalledTimes(1);
    f.children[0]!.emit("close", null);
    const next = streamAudioFromVideo("next-url", f.deps); f.children[1]!.succeed(); await next;
  }, 1000);
  it("完成后移除取消监听器，后续 abort 不 kill 已结束进程", async () => {
    const f = fixture(); const c = new AbortController(); const remove = vi.spyOn(c.signal, "removeEventListener");
    const run = f.extract("fake-url", c.signal); f.children[0]!.succeed(); await run; c.abort();
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function)); expect(f.children[0]!.kill).not.toHaveBeenCalled();
  });
  it("解析器惰性执行，解析错误和 spawn 错误保持旧文字", async () => {
    const f = fixture(); const resolver = vi.fn(() => { throw new Error("未找到 ffmpeg"); });
    const extract = createTranscribeAudioExtractor({ spawn: f.spawn, resolveFfmpeg: resolver }); expect(resolver).not.toHaveBeenCalled();
    await expect(extract("fake-url")).rejects.toThrow("streamAudioFromVideo: 未找到 ffmpeg"); expect(f.spawn).not.toHaveBeenCalled();
    const cannotSpawn = createTranscribeAudioExtractor({ ffmpegPath: "fake", spawn: () => { throw new Error("ENOENT"); } });
    await expect(cannotSpawn("fake-url")).rejects.toThrow("streamAudioFromVideo: 无法启动 ffmpeg(fake): ENOENT");
  });
  it.each(["nonzero", "empty", "error"])("普通 %s 失败保持错误类型且后续抽音能恢复", async mode => {
    const f = fixture(); const run = f.extract("fake-url").catch(error => error); const child = f.children[0]!;
    if (mode === "error") child.emit("error", new Error("进程错误"));
    child.stderr.emit("data", Buffer.from("诊断")); child.emit("close", mode === "nonzero" ? 1 : 0);
    expect(await run).toBeInstanceOf(TranscribeAudioExtractError);
    expect((await run).message).toContain(mode === "nonzero" ? "非 0 退出" : mode === "empty" ? "未产出音频字节" : "进程错误");
    const next = f.extract("fake-url"); f.children[1]!.succeed(); await next;
  });
  it("并发抽音各自归属，两个 kill 失败必须各自 close 后才恢复", async () => {
    const f = fixture(); const a = new AbortController(); const b = new AbortController();
    const first = f.extract("first", a.signal).catch(error => error);
    const second = f.extract("second", b.signal).catch(error => error);
    expect(f.spawn).toHaveBeenCalledTimes(2); // 正常抽音没有新增全局串行队列。
    f.children.forEach(child => child.kill.mockReturnValue(false));
    a.abort(); b.abort(); await first; await second;
    f.children[0]!.emit("close", 0);
    await expect(f.extract("third")).rejects.toThrow("尚未确认退出");
    expect(f.spawn).toHaveBeenCalledTimes(2);
    f.children[1]!.emit("close", 0);
    const next = f.extract("third"); f.children[2]!.succeed(); await next;
  });
  it("spawn 内发生取消仍能捕获并等 close；显式路径短路解析器", async () => {
    const c = new AbortController(); const child = new FakeChild(); const resolver = vi.fn(() => "unused");
    const extract = createTranscribeAudioExtractor({ ffmpegPath: "explicit", resolveFfmpeg: resolver, spawn: () => { c.abort(); return child; } });
    const result = extract("fake-url", c.signal).catch(error => error);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL"); expect(resolver).not.toHaveBeenCalled();
    child.emit("close", 0); expect(await result).toMatchObject({ name: "AbortError" });
  });
  it("普通进程 error 也等待 close，保留原始错误而非返回成功字节", async () => {
    const f = fixture(); let done = false;
    const result = f.extract("fake-url").catch(error => { done = true; return error; });
    f.children[0]!.emit("error", new Error("spawn 错误")); await tick(); expect(done).toBe(false);
    f.children[0]!.succeed(); expect((await result).message).toBe("streamAudioFromVideo: ffmpeg 进程错误: spawn 错误");
  });

});
