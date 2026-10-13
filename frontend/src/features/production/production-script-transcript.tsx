"use client";
import * as React from "react";

export type ScriptTranscriptLocation = {
  elementId: string;
  sourceTick: number;
  nativeTick: number;
  tokenId?: string;
};
export type ScriptTranscriptToken = {
  mediaId: string;
  assetId: string;
  segmentId: number;
  elementId: string;
  sourceStart: number;
  sourceEnd: number;
  rate: number;
  nativeStart: number;
};
type Props = {
  markdown: string;
  onChange: (markdown: string) => void;
  onLocate: (position: ScriptTranscriptLocation) => void;
  disabled?: boolean;
  resolveToken?: (
    token: ScriptTranscriptToken,
  ) => { sourceTick: number; nativeTick: number; tokenId: string } | null;
};
type Line = { raw: string; text: string; ending: string };
type Source = {
  raw: string;
  mediaId: string;
  assetId: string;
  ordinal: number;
};
type Token = {
  line: number;
  segmentId: number;
  text: string;
  dropped: boolean;
};
type Group = {
  start: number;
  end: number;
  track: number;
  ordinal: number;
  elementId: string;
  source: Source;
  sourceStart: number;
  sourceEnd: number;
  duration: number;
  rate: number;
  nativeStart: number | null;
  dropped: boolean;
  tokens: Token[];
  silences: number[];
};
type Track = { ordinal: number; label: string; groups: Group[] };
const TICKS_PER_SECOND = 120000;
const control =
  "rounded-control border border-border px-3 py-2 text-sm disabled:opacity-40";
const integer = (value: number) => Number.isSafeInteger(value) && value >= 0;
function identity(value: string) {
  try {
    const decoded = decodeURIComponent(value);
    return decoded || null;
  } catch {
    return null;
  }
}
function unstrike(line: string) {
  const text = line.trim(),
    match = /^~~(.+)~~$/.exec(text);
  return { text: match?.[1] ?? text, dropped: Boolean(match) };
}
function splitLines(markdown: string): Line[] {
  return (markdown.match(/[^\n]*(?:\n|$)/g) ?? [])
    .filter(Boolean)
    .map((raw) => {
      const ending = raw.endsWith("\r\n")
        ? "\r\n"
        : raw.endsWith("\n")
          ? "\n"
          : "";
      return { raw, text: ending ? raw.slice(0, -ending.length) : raw, ending };
    });
}
function seconds(ticks: number) {
  return (ticks / TICKS_PER_SECOND).toFixed(6).replace(/\.?0+$/, "") || "0";
}

// SEMANTIC_BOUNDARY_ALLOW: 仅投影既有04协议、真实ID与时间单位，落实用户明确操作；不理解内容、选择素材或按文字猜词时码。
function project(markdown: string) {
  const lines = splitLines(markdown),
    tracks: Track[] = [],
    sources = new Map<string, number>();
  let track: Track | null = null,
    source: Source | null = null,
    group: Group | null = null,
    cursor: number | null = 0,
    ordinal = 0;
  const close = (index: number) => {
    if (group) group.end = index;
    group = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!.text.trim(),
      row = unstrike(raw),
      trackMatch =
        /^##\s+([VAP])([1-9]\d*)(?:\s+—\s+.*?)?(?:\s+<!--.*-->)?\s*$/.exec(raw);
    if (raw.startsWith("## ")) {
      close(i);
      source = null;
      cursor = 0;
      track = null;
      if (trackMatch) {
        track = {
          ordinal: tracks.length,
          label: `${trackMatch[1] === "V" ? "视频" : trackMatch[1] === "A" ? "音频" : "其他"}轨 ${trackMatch[2]}`,
          groups: [],
        };
        tracks.push(track);
      }
      continue;
    }
    if (!track) continue;
    if (raw.startsWith("### ")) {
      close(i);
      source = null;
      const match =
        /^###\s+.+?\s+<!-- markdown-state:source:([^:]+):([^ ]+) -->\s*$/.exec(
          raw,
        );
      if (match) {
        const mediaId = identity(match[1]!),
          assetId = identity(match[2]!);
        if (mediaId && assetId) {
          const key = JSON.stringify([mediaId, assetId]);
          if (!sources.has(key)) sources.set(key, sources.size + 1);
          source = {
            raw: lines[i]!.raw,
            mediaId,
            assetId,
            ordinal: sources.get(key)!,
          };
        }
      }
      continue;
    }
    const gap = /^\[gap\s+(~~)?(\d+)t(~~)?\]\s*$/.exec(row.text);
    if (gap) {
      close(i);
      const duration = Number(gap[2]);
      if (!integer(duration) || Boolean(gap[1]) !== Boolean(gap[3]))
        cursor = null;
      else if (cursor !== null && !row.dropped && !gap[1])
        cursor = integer(cursor + duration) ? cursor + duration : null;
      continue;
    }
    const clip =
      /^\[c(\d+)\]\s+(\d+)t\s+source=(\d+)\.\.(\d+)t\s+rate=(\d+(?:\.\d+)?)\s+<!-- markdown-state:item:([^ ]+) -->\s*$/.exec(
        row.text,
      );
    if (clip) {
      close(i);
      const duration = Number(clip[2]),
        start = Number(clip[3]),
        end = Number(clip[4]),
        rate = Number(clip[5]),
        elementId = identity(clip[6]!);
      const valid =
        [duration, start, end].every(integer) &&
        duration > 0 &&
        end > start &&
        rate >= 0.01 &&
        rate <= 5 &&
        Math.round((end - start) / rate) === duration;
      if (source && elementId && valid) {
        group = {
          start: i,
          end: lines.length,
          track: track.ordinal,
          ordinal: ++ordinal,
          elementId,
          source,
          sourceStart: start,
          sourceEnd: end,
          duration,
          rate,
          nativeStart: cursor,
          dropped: row.dropped,
          tokens: [],
          silences: [],
        };
        track.groups.push(group);
      }
      if (!valid) cursor = null;
      else if (cursor !== null && !row.dropped)
        cursor = integer(cursor + duration) ? cursor + duration : null;
      continue;
    }
    if (/^\[(?:c\d+|clip|gap)\b/.test(row.text)) {
      close(i);
      cursor = null;
      continue;
    }
    if (!group) continue;
    const token = /^\[s(\d+)\]\s+(.*)$/.exec(row.text);
    if (token && integer(Number(token[1]))) {
      group.tokens.push({
        line: i,
        segmentId: Number(token[1]),
        text: token[2]!.replace(/\\n/g, "\n"),
        dropped: row.dropped,
      });
      continue;
    }
    const silence =
      /^\[silence=(\d+)t\]\s+<!-- markdown-state:range:(\d+)\.\.(\d+) -->\s*$/.exec(
        row.text,
      );
    if (silence) {
      const duration = Number(silence[1]),
        a = Number(silence[2]),
        b = Number(silence[3]);
      if ([duration, a, b].every(integer) && b > a && b - a === duration)
        group.silences.push(duration);
    }
  }
  return { lines, tracks };
}
function markedLine(line: Line, dropped: boolean) {
  const leading = /^\s*/.exec(line.text)![0],
    trailing = /\s*$/.exec(line.text)![0],
    plain = unstrike(line.text).text;
  return leading + (dropped ? `~~${plain}~~` : plain) + trailing + line.ending;
}
function rawGroup(group: Group, lines: Line[]) {
  return lines
    .slice(group.start, group.end)
    .map((line) => line.raw)
    .join("");
}
function block(group: Group, lines: Line[], newline: string) {
  const header = group.source.raw.endsWith("\n")
      ? group.source.raw
      : group.source.raw + newline,
    body = rawGroup(group, lines);
  return header + body + (body.endsWith("\n") ? "" : newline);
}

/** 普通转录控件只产生文字草稿；父级形成候选并负责正式保存。 */
export function ProductionScriptTranscript({
  markdown,
  onChange,
  onLocate,
  disabled = false,
  resolveToken,
}: Props) {
  const projection = React.useMemo(() => project(markdown), [markdown]);
  const [disclosure, setDisclosure] = React.useState<{
    markdown: string;
    groups: number;
    tokens: Record<number, number>;
  }>(() => ({ markdown, groups: 50, tokens: {} }));
  const shown =
    disclosure.markdown === markdown
      ? disclosure
      : { markdown, groups: 50, tokens: {} };
  const reveal = (start?: number) => {
    if (disabled) return;
    setDisclosure((previous) => {
      const current =
        previous.markdown === markdown
          ? previous
          : { markdown, groups: 50, tokens: {} };
      return start === undefined
        ? { ...current, groups: current.groups + 50 }
        : {
            ...current,
            tokens: {
              ...current.tokens,
              [start]: (current.tokens[start] ?? 100) + 100,
            },
          };
    });
  };
  const [selection, setSelection] = React.useState<{
    markdown: string;
    lines: Set<number>;
  }>(() => ({ markdown, lines: new Set() }));
  const selected =
      selection.markdown === markdown ? selection.lines : new Set<number>(),
    newline = markdown.includes("\r\n") ? "\r\n" : "\n";
  const emit = (next: string) => {
    if (disabled) return;
    onChange(next);
    setSelection({ markdown: next, lines: new Set() });
  };
  function deleteTokens() {
    if (disabled || !selected.size) return;
    const known = new Set(
      projection.tracks.flatMap((track) =>
        track.groups
          .filter((group) => !group.dropped)
          .flatMap((group) =>
            group.tokens
              .filter((token) => !token.dropped)
              .map((token) => token.line),
          ),
      ),
    );
    emit(
      projection.lines
        .map((line, index) =>
          selected.has(index) && known.has(index)
            ? markedLine(line, true)
            : line.raw,
        )
        .join(""),
    );
  }
  function toggleClip(group: Group) {
    if (disabled) return;
    emit(
      projection.lines
        .map((line, index) =>
          index === group.start ? markedLine(line, !group.dropped) : line.raw,
        )
        .join(""),
    );
  }
  function duplicate(group: Group) {
    if (disabled || group.dropped) return;
    const before = projection.lines
        .slice(0, group.end)
        .map((line) => line.raw)
        .join(""),
      after = projection.lines
        .slice(group.end)
        .map((line) => line.raw)
        .join("");
    emit(
      before +
        (before.endsWith("\n") ? "" : newline) +
        block(group, projection.lines, newline) +
        after,
    );
  }
  function move(group: Group, delta: number) {
    if (disabled || group.dropped) return;
    const groups = projection.tracks[group.track]!.groups,
      index = groups.indexOf(group),
      other = groups[index + delta];
    if (!other || other.dropped) return;
    // 每个组都带回自身精确source；原header/gap/未知行留原位，避免A-B-A重排后后续同源组借错header。
    const replacements = new Map<number, { end: number; value: string }>();
    for (const slot of groups) {
      const content = slot === group ? other : slot === other ? group : slot;
      replacements.set(slot.start, {
        end: slot.end,
        value: block(content, projection.lines, newline),
      });
    }
    let result = "";
    for (let i = 0; i < projection.lines.length; ) {
      const replacement = replacements.get(i);
      if (replacement) {
        result += replacement.value;
        i = replacement.end;
      } else result += projection.lines[i++]!.raw;
    }
    emit(result);
  }
  function locate(group: Group, location?: ScriptTranscriptLocation) {
    if (disabled || group.dropped || group.nativeStart === null) return;
    onLocate(
      location ?? {
        elementId: group.elementId,
        sourceTick: group.sourceStart,
        nativeTick: group.nativeStart,
      },
    );
  }
  const groups = projection.tracks.flatMap((track) => track.groups),
    visibleGroups = new Set(groups.slice(0, shown.groups));
  return (
    <section aria-label="按转录调整剪辑" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">转录与片段</h3>
        <button
          type="button"
          className={control}
          disabled={disabled || !selected.size}
          onClick={deleteTokens}
        >
          删除所选词句
        </button>
      </div>
      {!groups.length ? (
        <p className="text-sm text-muted-foreground">
          暂无可操作的转录片段，请先读取当前时间轴。
        </p>
      ) : (
        projection.tracks
          .filter((track) =>
            track.groups.some((group) => visibleGroups.has(group)),
          )
          .map((track) => (
            <section
              key={track.ordinal}
              className="space-y-3"
              aria-label={track.label}
            >
              <h4 className="text-sm font-medium">{track.label}</h4>
              {track.groups
                .filter((group) => visibleGroups.has(group))
                .map((group) => {
                  const index = track.groups.indexOf(group),
                    tokens = group.tokens.slice(
                      0,
                      shown.tokens[group.start] ?? 100,
                    );
                  const fallback = {
                    elementId: group.elementId,
                    sourceTick: group.sourceStart,
                    nativeTick: group.nativeStart ?? 0,
                  };
                  const locations = tokens.map((token) => {
                    if (!resolveToken || group.nativeStart === null)
                      return null;
                    let value: ReturnType<NonNullable<Props["resolveToken"]>>;
                    try {
                      value = resolveToken({
                        mediaId: group.source.mediaId,
                        assetId: group.source.assetId,
                        segmentId: token.segmentId,
                        elementId: group.elementId,
                        sourceStart: group.sourceStart,
                        sourceEnd: group.sourceEnd,
                        rate: group.rate,
                        nativeStart: group.nativeStart,
                      });
                    } catch {
                      return null;
                    }
                    return value &&
                      integer(value.sourceTick) &&
                      integer(value.nativeTick) &&
                      value.sourceTick >= group.sourceStart &&
                      value.sourceTick < group.sourceEnd &&
                      value.nativeTick >= group.nativeStart &&
                      value.nativeTick < group.nativeStart + group.duration &&
                      typeof value.tokenId === "string" &&
                      value.tokenId
                      ? { elementId: group.elementId, ...value }
                      : null;
                  });
                  return (
                    <article
                      key={group.start}
                      aria-label={`片段 ${group.ordinal}`}
                      className="min-w-0 space-y-3 rounded-card border border-border p-3"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-medium">
                          片段 {group.ordinal} · 原片 {group.source.ordinal}
                          {group.dropped ? " · 已删除" : ""}
                        </p>
                        <p className="text-sm tabular-nums text-muted-foreground">
                          {group.nativeStart === null
                            ? "成片位置需重新核对"
                            : `成片 ${seconds(group.nativeStart)}–${seconds(group.nativeStart + (group.dropped ? 0 : group.duration))} 秒`}{" "}
                          · 原片 {seconds(group.sourceStart)}–
                          {seconds(group.sourceEnd)} 秒
                        </p>
                      </div>
                      {group.tokens.length ? (
                        <>
                          <ul className="space-y-2">
                            {tokens.map((token, tokenIndex) => (
                              <li
                                key={token.line}
                                className="flex min-w-0 flex-wrap items-start gap-2 text-sm"
                              >
                                <label className="flex min-w-0 flex-1 items-start gap-2">
                                  <input
                                    type="checkbox"
                                    aria-label={`选择片段 ${group.ordinal} 的词句 ${tokenIndex + 1}`}
                                    checked={selected.has(token.line)}
                                    disabled={
                                      disabled || group.dropped || token.dropped
                                    }
                                    onChange={(event) =>
                                      setSelection((previous) => {
                                        const next = new Set(
                                          previous.markdown === markdown
                                            ? previous.lines
                                            : [],
                                        );
                                        if (event.target.checked)
                                          next.add(token.line);
                                        else next.delete(token.line);
                                        return { markdown, lines: next };
                                      })
                                    }
                                  />
                                  <span
                                    className={`min-w-0 whitespace-pre-wrap break-words${token.dropped ? " line-through text-muted-foreground" : ""}`}
                                  >
                                    {token.text || "（该词句没有文字）"}
                                  </span>
                                </label>
                                {token.dropped ? (
                                  <button
                                    type="button"
                                    className={control}
                                    disabled={disabled || group.dropped}
                                    aria-label={`恢复片段 ${group.ordinal} 的词句 ${tokenIndex + 1}`}
                                    onClick={() =>
                                      emit(
                                        projection.lines
                                          .map((line, i) =>
                                            i === token.line
                                              ? markedLine(line, false)
                                              : line.raw,
                                          )
                                          .join(""),
                                      )
                                    }
                                  >
                                    恢复词句
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className={control}
                                    disabled={
                                      disabled ||
                                      group.dropped ||
                                      group.nativeStart === null
                                    }
                                    aria-label={`定位片段 ${group.ordinal} 的词句 ${tokenIndex + 1}${locations[tokenIndex] ? "" : " 所在片段"}`}
                                    onClick={() =>
                                      locate(
                                        group,
                                        locations[tokenIndex] ?? fallback,
                                      )
                                    }
                                  >
                                    {locations[tokenIndex]
                                      ? "定位词句"
                                      : "定位所在片段"}
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                          {tokens.length < group.tokens.length && (
                            <button
                              type="button"
                              className={control}
                              disabled={disabled}
                              aria-label={`显示片段 ${group.ordinal} 的更多词句`}
                              onClick={() => reveal(group.start)}
                            >
                              显示更多词句 · 还有{" "}
                              {group.tokens.length - tokens.length} 项
                            </button>
                          )}
                          {locations.some((value) => !value) && (
                            <p className="text-sm text-muted-foreground">
                              没有可验证的词句定位，定位按钮打开所在片段。
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          暂无词句转录，可按片段范围操作。
                        </p>
                      )}
                      {group.silences.map((duration, i) => (
                        <p key={i} className="text-sm text-muted-foreground">
                          未转录区间 · {seconds(duration)} 秒
                        </p>
                      ))}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={control}
                          aria-label={`定位片段 ${group.ordinal}`}
                          disabled={
                            disabled ||
                            group.dropped ||
                            group.nativeStart === null
                          }
                          onClick={() => locate(group)}
                        >
                          定位片段
                        </button>
                        <button
                          type="button"
                          className={control}
                          aria-label={`上移片段 ${group.ordinal}`}
                          disabled={
                            disabled ||
                            group.dropped ||
                            index === 0 ||
                            track.groups[index - 1]?.dropped
                          }
                          onClick={() => move(group, -1)}
                        >
                          上移
                        </button>
                        <button
                          type="button"
                          className={control}
                          aria-label={`下移片段 ${group.ordinal}`}
                          disabled={
                            disabled ||
                            group.dropped ||
                            index === track.groups.length - 1 ||
                            track.groups[index + 1]?.dropped
                          }
                          onClick={() => move(group, 1)}
                        >
                          下移
                        </button>
                        <button
                          type="button"
                          className={control}
                          aria-label={`重复片段 ${group.ordinal}`}
                          disabled={disabled || group.dropped}
                          onClick={() => duplicate(group)}
                        >
                          重复
                        </button>
                        <button
                          type="button"
                          className={control}
                          aria-label={`${group.dropped ? "恢复" : "删除"}片段 ${group.ordinal}`}
                          disabled={disabled}
                          onClick={() => toggleClip(group)}
                        >
                          {group.dropped ? "恢复片段" : "删除片段"}
                        </button>
                      </div>
                    </article>
                  );
                })}
            </section>
          ))
      )}
      {shown.groups < groups.length && (
        <button
          type="button"
          className={control}
          disabled={disabled}
          onClick={() => reveal()}
        >
          显示更多片段 · 还有 {groups.length - shown.groups} 段
        </button>
      )}
    </section>
  );
}
