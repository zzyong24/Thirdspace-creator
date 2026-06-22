// Deterministic generator: real Douyin catalog + metrics -> CreatorOS fixture.
// Reads /tmp/douyin-real/{videos,account,works8}.json, emits src/fixtures/douyin-real.ts
import { readFileSync, writeFileSync } from "node:fs";

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const ROOT = dirname(fileURLToPath(import.meta.url));
const videos = JSON.parse(readFileSync(`${ROOT}/videos.json`, "utf8"));
const account = JSON.parse(readFileSync(`${ROOT}/account.json`, "utf8"));
const works8 = JSON.parse(readFileSync(`${ROOT}/works8.json`, "utf8"));

// dir -> index into `videos` for the 6 works that have a matching published row.
// Two works (Obsidian入门指南, vibecoding) have no published Douyin row → null.
const WORK_MATCH = {
  "202605192053-AI时代知识库": 7,
  "202605222300-Markdown不会淘汰HTML也替代不了它": 6,
  "202605231842-video-cut剪口播": 5,
  "202605270046-开源我的Agent-native知识操作系统": 3,
  "202605312030-Obsidian入门指南": null,
  "20260606-3分钟讲清怎么更高效的vibecoding": null,
  "20260612-1v1卖的是服务不是软件": 1,
  "20260618-AI产出差不是工具的锅": 0,
};
// reverse: videoIndex -> work8
const idxToWork = {};
for (const w of works8) {
  const i = WORK_MATCH[w.dir];
  if (i != null) idxToWork[i] = w;
}

function isoOf(pd) {
  // Input is Shanghai wall-clock ("2026-06-18 01:10:30"); the contract's iso8601
  // primitive requires UTC Z form (/^...T..:..:..(\.\d+)?Z$/). Convert +08:00→UTC.
  if (!pd) return "2026-01-01T00:00:00.000Z";
  let s = pd.trim().replace(" ", "T");
  if (!/T/.test(s)) s += "T12:00:00";
  if (s.split("T")[1].length === 5) s += ":00";
  return new Date(s + "+08:00").toISOString();
}
const ZDATE = (shanghai) => isoOf(shanghai); // alias for fixed dates
function cleanTitle(raw) {
  let t = (raw || "").split("\n")[0].trim();
  t = t.replace(/\s*#[^\s#]+/g, " ").replace(/\s+/g, " ").trim();
  if (!t) t = (raw || "").replace(/\n/g, " ").replace(/\s*#[^\s#]+/g, " ").replace(/\s+/g, " ").trim();
  if (t.length > 46) t = t.slice(0, 44) + "…";
  return t || "未命名作品";
}
function briefOf(raw) {
  let t = (raw || "").replace(/\n/g, " ").replace(/\s*#[^\s#]+/g, " ").replace(/\s+/g, " ").trim();
  if (t.length > 100) t = t.slice(0, 98) + "…";
  return t || "抖音作品";
}
function categoryOf(raw) {
  const s = raw || "";
  if (/(知识库|Obsidian|第二大脑|知识管理|笔记)/i.test(s)) return "知识管理";
  if (/(Agent|Hermes|OpenClaw|claude|codex|MCP|模型|vibe)/i.test(s)) return "AI工作流";
  if (/(开源|工具|剪辑|终端|dashboard|skill)/i.test(s)) return "工具教程";
  if (/(变现|副业|1v1|服务|产品)/i.test(s)) return "商业变现";
  return "AI内容";
}
const J = (v) => JSON.stringify(v);

// ── accumulate rows ────────────────────────────────────────────────────────
const projects = [], projectStages = [], contentOutputs = [], outputStages = [];
const publications = [], publicationRevisions = [];
const metricSnapshots = [], metricValues = [], audienceSnapshots = [];
const artifacts = [], artifactVersions = [], knowledgeItems = [], knowledgeRevisions = [];

const CAPTURED = isoOf("2026-06-21 16:15:49"); // latest account snapshot (UTC Z)

let seq = 0;
videos.forEach((v, i) => {
  if ((v.title || "").trim() === "无标题") return; // drop untitled drafts
  const n = String(i).padStart(2, "0");
  const work = idxToWork[i] || null;
  const pubAt = isoOf(v.publish_date);
  const title = work ? work.cleanTitle : cleanTitle(v.title);
  const brief = work ? work.brief : briefOf(v.title);
  const category = work ? (work.contentCategory || categoryOf(v.title)) : categoryOf(v.title);
  const published = true; // every catalog row is live on the account
  seq++;

  const projId = `dy-proj-${n}`;
  const outId = `dy-out-${n}`;
  const pubId = `dy-pub-${n}`;

  projects.push({
    id: projId, userId: "USER", title, brief, contentCategory: category,
    creationMode: "freeform", status: "completed", currentStage: "review",
    progressPct: 100, starred: v.plays >= 20000,
    startedAt: pubAt, targetCompletedAt: pubAt, completedAt: pubAt,
    archivedAt: null, createdAt: pubAt, updatedAt: CAPTURED,
  });
  // A published work has walked the full pipeline — seed ALL 6 stage rows as
  // completed (matches createProject, which inserts every stage). Without the
  // full set the stepper can't show / navigate earlier stages and a transition
  // 404s ("Stage not found").
  for (const stg of ["research", "planning", "script", "production", "publishing", "review"]) {
    projectStages.push({
      id: `dy-stage-${n}-${stg}`, projectId: projId, stage: stg,
      status: "completed", progressPct: 100, skipped: false,
      startedAt: pubAt, completedAt: pubAt, updatedAt: pubAt,
    });
  }

  contentOutputs.push({
    id: outId, projectId: projId, title: title,
    contentType: "video", format: "mp4", aspectRatio: "9:16",
    targetDurationSeconds: v.avg_duration_sec && v.avg_duration_sec > 0 ? v.avg_duration_sec : 180,
    status: "published", primaryAssetId: null,
    createdAt: pubAt, updatedAt: CAPTURED,
  });
  outputStages.push({
    id: `dy-ostage-${n}-publishing`, contentOutputId: outId, stage: "publishing",
    status: "completed", progressPct: 100, skipped: false,
    startedAt: pubAt, completedAt: pubAt, updatedAt: pubAt,
  });

  const revId = `dy-prev-${n}`;
  publications.push({
    id: pubId, contentOutputId: outId, platform: "douyin",
    accountReference: "@抖音创作者", status: "published", currentRevisionId: revId,
    externalId: null, externalUrl: null, scheduledAt: null,
    publishedAt: pubAt, removedAt: null, createdAt: pubAt, updatedAt: CAPTURED,
  });
  publicationRevisions.push({
    id: revId, publicationId: pubId, revisionNumber: 1,
    title, description: brief, coverAssetId: null,
    category, series: "", platformTags: work ? (work.hashtags || []) : [],
    platformSettings: {}, createdAt: pubAt,
  });

  // ── real metrics snapshot ──
  const msId = `dy-ms-${n}`;
  metricSnapshots.push({
    id: msId, publicationId: pubId, ingestionRunId: null,
    capturedAt: CAPTURED, source: "manual_entry",
    // rawMetrics is the self-describing payload the analytics read op returns
    // (it surfaces snapshots, not the child metricValues) — carry every real
    // counter so the 发布中心 表现列 can show plays + engagement without a join.
    rawMetrics: {
      plays: v.plays, ctr: v.ctr, finish_rate: v.finish_rate,
      avg_duration_sec: v.avg_duration_sec, likes: v.likes, comments: v.comments,
      shares: v.shares, favorites: v.favorites, follower_gain: v.follower_gain,
    },
    createdAt: CAPTURED,
  });
  const mv = (key, val, unit) => metricValues.push({
    id: `dy-mv-${n}-${key}`, metricSnapshotId: msId, metricKey: key,
    numericValue: val, unit, dimensions: { platform: "douyin" },
  });
  mv("views", v.plays, "count");
  mv("likes", v.likes, "count");
  mv("comments", v.comments, "count");
  mv("shares", v.shares, "count");
  mv("favorites", v.favorites, "count");
  if (v.ctr != null) mv("ctr", v.ctr, "percent");
  if (v.finish_rate != null) mv("finish_rate", v.finish_rate, "percent");
  if (v.profile_visits) mv("profile_visits", v.profile_visits, "count");
  if (v.follower_gain) mv("follower_gain", v.follower_gain, "count");

  // ── enrichment for the matched full works: script artifact + transcript knowledge ──
  if (work && work.scriptExcerpt) {
    const artId = `dy-art-${n}-script`, avId = `dy-av-${n}-script`;
    artifacts.push({
      id: artId, projectId: projId, contentOutputId: outId, currentVersionId: avId,
      stage: "script", artifactType: "master_script", title: `${title} · 口播脚本`,
      status: "approved", createdAt: pubAt, updatedAt: pubAt, archivedAt: null,
    });
    artifactVersions.push({
      id: avId, artifactId: artId, versionNumber: 1,
      contentText: work.scriptExcerpt,
      contentData: { hook: work.hook || "", cta: work.cta || "", coreQuotes: work.coreQuotes || [] },
      changeSummary: "从知识库口播稿初始化", createdByType: "user", aiTaskId: null, createdAt: pubAt,
    });
    const kId = `dy-know-${n}`, krId = `dy-krev-${n}`;
    knowledgeItems.push({
      id: kId, userId: "USER", currentRevisionId: krId, knowledgeType: "transcript",
      title: `${title} · 文案`, sourceType: "manual", sourceUrl: null,
      sourceMetadata: { dir: work.dir, hashtags: work.hashtags || [] },
      status: "active", createdAt: pubAt, updatedAt: pubAt, archivedAt: null,
    });
    knowledgeRevisions.push({
      id: krId, knowledgeItemId: kId, revisionNumber: 1,
      content: work.scriptExcerpt,
      structuredData: { coreQuotes: work.coreQuotes || [], cta: work.cta || "" },
      createdAt: pubAt,
    });
  }
});

// ── audience portrait (real fan snapshot 2026-05-14) ──
// Geography → audienceSnapshots (dimensionType "region" is a valid enum member).
// Interests + hot keywords → a knowledge note (the dimensionType enum has no
// "interest" bucket, so encoding them as audience rows would be invalid).
const topIdx = videos.reduce((best, v, i) => (v.plays > (videos[best]?.plays ?? -1) ? i : best), 0);
const topN = String(topIdx).padStart(2, "0");
const topPubId = `dy-pub-${topN}`;
const interests = [
  ["随拍", 0.29], ["科技", 0.20], ["社会时政", 0.12], ["体育", 0.09], ["财经", 0.08],
  ["二次元", 0.05], ["游戏", 0.05], ["美食", 0.04], ["亲子", 0.04], ["动物", 0.04],
];
const regions = [
  ["广东", 0.19], ["上海", 0.10], ["浙江", 0.09], ["江苏", 0.08], ["北京", 0.07],
  ["湖北", 0.06], ["四川", 0.05], ["山东", 0.04], ["福建", 0.04], ["湖南", 0.03],
];
const hotKeywords = ["ai", "漫画解说", "二次元", "deepseek", "codex", "openclaw", "agent", "claudecode", "claude"];
const FANS = 2217;
regions.forEach(([val, pct], k) => audienceSnapshots.push({
  id: `dy-aud-reg-${k}`, publicationId: topPubId, capturedAt: isoOf("2026-05-14 12:00:00"),
  dimensionType: "region", dimensionValue: val, percentage: pct, audienceCount: Math.round(FANS * pct),
}));
// fan-portrait knowledge note (interests + regions + hot keywords + total fans)
knowledgeItems.push({
  id: "dy-know-fanportrait", userId: "USER", currentRevisionId: "dy-krev-fanportrait",
  knowledgeType: "reference", title: "抖音粉丝画像 · 2026-05-14",
  sourceType: "manual", sourceUrl: null,
  sourceMetadata: { fans: FANS, capturedAt: "2026-05-14", source: "抖音创作者中心·粉丝分析" },
  status: "active", createdAt: isoOf("2026-05-14 12:00:00"), updatedAt: CAPTURED, archivedAt: null,
});
knowledgeRevisions.push({
  id: "dy-krev-fanportrait", knowledgeItemId: "dy-know-fanportrait", revisionNumber: 1,
  content: `粉丝总数 ${FANS}（2026-06-21）。\n兴趣分布：${interests.map(([k, p]) => `${k} ${Math.round(p * 100)}%`).join("、")}。\n地域分布：${regions.map(([k, p]) => `${k} ${Math.round(p * 100)}%`).join("、")}。\n关注热词 Top：${hotKeywords.join("、")}。\nAI 相关词（ai/deepseek/codex/claude/agent）高度突出，泛二次元（漫画解说/短剧）是重要兴趣纽带。`,
  structuredData: { interests, regions, hotKeywords, fans: FANS },
  createdAt: isoOf("2026-05-14 12:00:00"),
});

// account follower history (real)
const accountHistory = account.map((a) => ({
  timestamp: isoOf(a.timestamp), totalFans: a.total_fans, todayNewFans: a.today_new_fans,
}));

// ── emit TS ──
const banner = `// AUTO-GENERATED by /tmp/douyin-real/gen.mjs — real Douyin catalog + metrics.
// Source of truth: ~/.hermes/douyin_stats.db (creator-center scrape) + vault 04-项目/内容创作/创作.
// ${seq} published works · account ${FANS} fans (2026-06-21) · DO NOT hand-edit; regenerate instead.
/* eslint-disable */
`;
const block = (name, arr) => `export const ${name} = ${J(arr)} as const;\n`;
const out = banner +
  block("douyinProjects", projects) +
  block("douyinProjectStages", projectStages) +
  block("douyinContentOutputs", contentOutputs) +
  block("douyinOutputStages", outputStages) +
  block("douyinPublications", publications) +
  block("douyinPublicationRevisions", publicationRevisions) +
  block("douyinMetricSnapshots", metricSnapshots) +
  block("douyinMetricValues", metricValues) +
  block("douyinAudienceSnapshots", audienceSnapshots) +
  block("douyinArtifacts", artifacts) +
  block("douyinArtifactVersions", artifactVersions) +
  block("douyinKnowledgeItems", knowledgeItems) +
  block("douyinKnowledgeRevisions", knowledgeRevisions) +
  block("douyinAccountHistory", accountHistory) +
  `export const DOUYIN_FAN_TOTAL = ${FANS};\n` +
  `export const douyinRealStats = { works: ${seq}, totalPlays: ${videos.reduce((s, v) => s + (v.plays || 0), 0)}, fans: ${FANS} } as const;\n`;

const DEST = process.argv[2];
writeFileSync(DEST, out);
console.log(`emitted ${seq} works -> ${DEST}`);
console.log(`projects=${projects.length} pubs=${publications.length} metricValues=${metricValues.length} artifacts=${artifacts.length} knowledge=${knowledgeItems.length} audience=${audienceSnapshots.length}`);
console.log(`topPublication(byPlays)=${topPubId} plays=${videos[topIdx].plays}`);
