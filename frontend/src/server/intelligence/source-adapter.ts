import { createHash } from "node:crypto";

import type { RequestContext } from "@creatoros/contract";
import {
  detectDarkhorse,
  type DarkhorseTier,
} from "@creatoros/backend/modules/benchmark";
import type {
  IntelligenceSourceAdapterPort,
} from "@creatoros/backend/modules/intelligence";

type SourceInput = Parameters<IntelligenceSourceAdapterPort["run"]>[1];
type AdapterEnvelope = Awaited<
  ReturnType<IntelligenceSourceAdapterPort["run"]>
>;
type AdapterItem = AdapterEnvelope["items"][number];

export interface ProfileWork {
  awemeId: string;
  description: string;
  diggCount: number;
  commentCount: number;
  collectCount: number;
  shareCount: number;
  durationSec: number;
  createTime: number;
}

export interface FavoriteWork {
  awemeId: string;
  description: string;
  diggCount: number;
  commentCount: number;
  collectCount: number;
  shareCount: number;
  durationMs: number;
  createTime: number;
  authorSecUid: string;
  authorNickname: string;
}

export interface DouhotCandidate {
  itemId: string;
  itemUrl: string;
  title: string;
  coverUrl: string | null;
  durationMs: number | null;
  authorId: string | null;
  authorName: string | null;
  followerCount: number | null;
  playCount: number | null;
  likeCount: number;
  commentCount: number | null;
  collectCount: number | null;
  shareCount: number | null;
  publishTime: number | null;
  officialRank: number | null;
  officialScore: number | null;
}

export interface DouhotBatch {
  listValid: boolean;
  officialWindow: string;
  responseShape: string;
  candidates: DouhotCandidate[];
}

export interface ReadWebResult {
  text: string;
  title: string;
  finalUrl: string;
  extractor: string;
}

export interface FeedItem {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
  siteName?: string;
}

export interface IntelligenceSourceAdapterDeps {
  now?: () => string;
  fetchProfileWorks(input: {
    ctx: RequestContext;
    collectorAccountId: string;
    externalAccountId: string;
  }): Promise<ProfileWork[]>;
  fetchFavoriteWorks(input: {
    ctx: RequestContext;
    collectorAccountId: string;
    folderId: string;
  }): Promise<FavoriteWork[]>;
  readWeb(input: {
    ctx: RequestContext;
    url: string;
  }): Promise<ReadWebResult>;
  fetchFeed(input: {
    ctx: RequestContext;
    url: string;
  }): Promise<{ xml: string; finalUrl: string }>;
  parseFeed(xml: string, siteName: string): FeedItem[];
  fetchDouhot?(input: {
    ctx: RequestContext;
    collectorAccountId: string;
    keyword: string;
    board: "low_follower_breakout";
  }): Promise<DouhotBatch>;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function unixIso(value: number | null): string | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000).toISOString();
}

function parsedIso(value: string | undefined): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function safeTitle(value: string, fallback: string): string {
  return value.trim().slice(0, 240) || fallback;
}

function snapshot(
  finalUrl: string,
  title: string,
  safeExtract: string | null,
): NonNullable<AdapterItem["snapshot"]> {
  return {
    finalUrl,
    title,
    contentHash: digest(`${title}\n${safeExtract ?? ""}`),
    safeExtract,
    storageRef: null,
    retentionUntil: null,
    privacyClass: "public",
  };
}

function success(
  adapter: AdapterEnvelope["upstreamEvidence"]["adapter"],
  responseShape: string,
  capturedAt: string,
  items: AdapterItem[],
  diagnostics: AdapterEnvelope["safeDiagnostics"],
  extraEvidence: Partial<AdapterEnvelope["upstreamEvidence"]> = {},
): AdapterEnvelope {
  return {
    adapterStatus:
      items.length > 0 ? "succeeded_with_items" : "succeeded_no_change",
    upstreamEvidence: {
      adapter,
      responseShape,
      capturedAt,
      listValid: true,
      ...extraEvidence,
    },
    items,
    checkpoint: null,
    errorCode: null,
    safeDiagnostics: diagnostics,
  };
}

function failure(
  adapter: AdapterEnvelope["upstreamEvidence"]["adapter"],
  capturedAt: string,
  errorCode: string,
  responseShape: string,
): AdapterEnvelope {
  return {
    adapterStatus:
      errorCode === "LOGIN_REQUIRED" ||
      errorCode === "LOGIN_WALL" ||
      errorCode === "CAPTCHA"
        ? "blocked"
        : "failed",
    upstreamEvidence: {
      adapter,
      responseShape,
      capturedAt,
      listValid: false,
    },
    items: [],
    checkpoint: null,
    errorCode,
    safeDiagnostics: {},
  };
}

const WEB_FAILURE_CODES = new Set([
  "LOGIN_REQUIRED",
  "LOGIN_WALL",
  "UNSAFE_URL",
  "HTTP_ERROR",
  "EMPTY_BODY",
  "PARSE_FAILED",
  "RESPONSE_TOO_LARGE",
  "TIMEOUT",
]);

/** 浏览器层异常只投影稳定分类；message 可能含 URL/query，禁止进运行记录。 */
function webFailureCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const record = error as {
    name?: unknown;
    code?: unknown;
    status?: unknown;
  };
  if (
    typeof record.code === "string" &&
    WEB_FAILURE_CODES.has(record.code)
  ) {
    return record.code;
  }
  if (record.name === "WebReaderLoginRequiredError") return "LOGIN_WALL";
  if (
    record.name === "WebCaptureError" &&
    typeof record.status === "number" &&
    record.status >= 400
  ) {
    return "HTTP_ERROR";
  }
  return null;
}

function profileItems(source: SourceInput["source"], rows: ProfileWork[]) {
  return rows.map(
    (row): AdapterItem => {
      const url = `https://www.douyin.com/video/${row.awemeId}`;
      const title = safeTitle(
        row.description,
        `抖音作品 ${row.awemeId.slice(-8)}`,
      );
      return {
        type: "video",
        platform: "douyin",
        externalId: row.awemeId,
        canonicalUrl: url,
        authorId: source.externalKey,
        authorName: source.displayName,
        title,
        summary: row.description.trim() || null,
        coverUrl: null,
        publishedAt: unixIso(row.createTime),
        durationMs:
          row.durationSec > 0 ? Math.round(row.durationSec * 1000) : null,
        metrics: {
          likeCount: row.diggCount,
          commentCount: row.commentCount,
          collectCount: row.collectCount,
          shareCount: row.shareCount,
          followerCount: null,
          metricSource: "douyin_profile",
          qualityFlags: [],
        },
        snapshot: snapshot(url, title, row.description.slice(0, 2_000) || null),
      };
    },
  );
}

function favoriteItems(rows: FavoriteWork[]): AdapterItem[] {
  return rows.map((row) => {
    const url = `https://www.douyin.com/video/${row.awemeId}`;
    const title = safeTitle(
      row.description,
      `收藏作品 ${row.awemeId.slice(-8)}`,
    );
    return {
      type: "video",
      platform: "douyin",
      externalId: row.awemeId,
      canonicalUrl: url,
      authorId: row.authorSecUid || null,
      authorName: row.authorNickname || null,
      title,
      summary: row.description.trim() || null,
      coverUrl: null,
      publishedAt: unixIso(row.createTime),
      durationMs: row.durationMs > 0 ? row.durationMs : null,
      metrics: {
        likeCount: row.diggCount,
        commentCount: row.commentCount,
        collectCount: row.collectCount,
        shareCount: row.shareCount,
        followerCount: null,
        metricSource: "douyin_favorites",
        qualityFlags: [],
      },
      snapshot: snapshot(url, title, row.description.slice(0, 2_000) || null),
    };
  });
}

function douhotItems(
  rows: DouhotCandidate[],
  nowSec: number,
): { items: AdapterItem[]; tiers: Record<DarkhorseTier, number> } {
  const verdicts = detectDarkhorse(
    rows.map((row) => ({
      awemeId: row.itemId,
      diggCount: row.likeCount,
      authorFollowerCount: row.followerCount,
      createTime: row.publishTime,
    })),
    nowSec,
  );
  const rowById = new Map(rows.map((row) => [row.itemId, row]));
  const tiers: Record<DarkhorseTier, number> = {
    strong: 0,
    niche: 0,
    mid: 0,
  };
  const items = verdicts.flatMap((verdict): AdapterItem[] => {
    const row = rowById.get(verdict.awemeId);
    if (!row) return [];
    tiers[verdict.tier] += 1;
    const title = safeTitle(row.title, `低粉爆款 ${row.itemId.slice(-8)}`);
    return [
      {
        type: "video",
        platform: "douyin",
        externalId: row.itemId,
        canonicalUrl: row.itemUrl,
        authorId: row.authorId,
        authorName: row.authorName,
        title,
        summary: `热点宝低粉爆款 · ${verdict.tier}`,
        coverUrl: row.coverUrl,
        publishedAt: unixIso(row.publishTime),
        durationMs: row.durationMs,
        metrics: {
          likeCount: row.likeCount,
          commentCount: row.commentCount,
          collectCount: row.collectCount,
          shareCount: row.shareCount,
          followerCount: row.followerCount,
          metricSource: "douhot_low_follower_breakout",
          qualityFlags: [
            `tier:${verdict.tier}`,
            ...(verdict.likeFollowerRatio === null
              ? ["like_follower_ratio:unknown"]
              : []),
          ],
        },
        snapshot: snapshot(row.itemUrl, title, null),
      },
    ];
  });
  return { items, tiers };
}

export function createIntelligenceSourceAdapter(
  deps: IntelligenceSourceAdapterDeps,
): IntelligenceSourceAdapterPort {
  const now = deps.now ?? (() => new Date().toISOString());
  return {
    async run(ctx, input) {
      const capturedAt = now();
      switch (input.config.type) {
        case "creator_profile": {
          const rows = await deps.fetchProfileWorks({
            ctx,
            collectorAccountId: input.config.collectorAccountId,
            externalAccountId: input.config.externalAccountId,
          });
          return success(
            "douyin_profile",
            "public-profile-work-list",
            capturedAt,
            profileItems(input.source, rows),
            { returnedCount: rows.length },
            { finalUrl: input.config.canonicalUrl },
          );
        }
        case "favorites_folder": {
          const rows = await deps.fetchFavoriteWorks({
            ctx,
            collectorAccountId: input.config.collectorAccountId,
            folderId: input.config.folderId,
          });
          return success(
            "douyin_favorites",
            "collects-video-list",
            capturedAt,
            favoriteItems(rows),
            { returnedCount: rows.length },
          );
        }
        case "web": {
          let read: ReadWebResult;
          try {
            read = await deps.readWeb({ ctx, url: input.config.url });
          } catch (error) {
            const code = webFailureCode(error);
            if (code) {
              return failure(
                "web",
                capturedAt,
                code,
                `web-error:${code.toLowerCase()}`,
              );
            }
            throw error;
          }
          if (!read.text.trim()) {
            return failure("web", capturedAt, "EMPTY_BODY", "readable-empty");
          }
          const title = safeTitle(read.title, read.finalUrl);
          const excerpt = read.text.trim().slice(0, 2_000);
          const item: AdapterItem = {
            type: "article",
            platform: new URL(read.finalUrl).hostname,
            externalId: null,
            canonicalUrl: read.finalUrl,
            authorId: null,
            authorName: null,
            title,
            summary: excerpt.slice(0, 320),
            coverUrl: null,
            publishedAt: null,
            durationMs: null,
            snapshot: snapshot(read.finalUrl, title, excerpt),
          };
          return success(
            "web",
            `readable:${read.extractor}`,
            capturedAt,
            [item],
            { textLength: read.text.length },
            { finalUrl: read.finalUrl },
          );
        }
        case "rss": {
          const fetched = await deps.fetchFeed({ ctx, url: input.config.url });
          if (!/<(?:rss|feed)\b/i.test(fetched.xml)) {
            return failure("rss", capturedAt, "INVALID_FEED", "xml-not-feed");
          }
          let rows: FeedItem[];
          try {
            rows = deps.parseFeed(
              fetched.xml,
              new URL(fetched.finalUrl).hostname,
            );
          } catch {
            return failure(
              "rss",
              capturedAt,
              "PARSE_FAILED",
              "feed-parse-failed",
            );
          }
          const items = rows.map(
            (row): AdapterItem => {
              const title = safeTitle(row.title, row.url);
              return {
                type: "article",
                platform:
                  row.siteName || new URL(row.url).hostname || "rss",
                externalId: null,
                canonicalUrl: row.url,
                authorId: null,
                authorName: row.siteName ?? null,
                title,
                summary: row.snippet.trim().slice(0, 2_000) || null,
                coverUrl: null,
                publishedAt: parsedIso(row.publishedAt),
                durationMs: null,
                snapshot: snapshot(
                  row.url,
                  title,
                  row.snippet.trim().slice(0, 2_000) || null,
                ),
              };
            },
          );
          return success(
            "rss",
            "rss-or-atom-feed",
            capturedAt,
            items,
            { returnedCount: rows.length },
            { finalUrl: fetched.finalUrl },
          );
        }
        case "darkhorse_query": {
          if (!deps.fetchDouhot) {
            return failure(
              "douhot_darkhorse",
              capturedAt,
              "NO_VALID_RESPONSE",
              "douhot-adapter-unavailable",
            );
          }
          const batch = await deps.fetchDouhot({
            ctx,
            collectorAccountId: input.config.collectorAccountId,
            keyword: input.config.keyword,
            board: input.config.board,
          });
          if (
            !batch.listValid ||
            input.config.board !== "low_follower_breakout"
          ) {
            return failure(
              "douhot_darkhorse",
              capturedAt,
              "RESPONSE_SHAPE_CHANGED",
              batch.responseShape,
            );
          }
          const { items, tiers } = douhotItems(
            batch.candidates,
            Math.floor(Date.parse(capturedAt) / 1000),
          );
          return success(
            "douhot_darkhorse",
            batch.responseShape,
            capturedAt,
            items,
            {
              boardReturnedCount: batch.candidates.length,
              matchedCount: items.length,
              strongCount: tiers.strong,
              nicheCount: tiers.niche,
              midCount: tiers.mid,
            },
            { upstreamWindow: batch.officialWindow },
          );
        }
      }
    },
  };
}
