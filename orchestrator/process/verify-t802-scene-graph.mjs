#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const requireFromFrontend = createRequire(path.join(ROOT, "frontend/package.json"));
const { chromium } = requireFromFrontend("@playwright/test");
const sampleRoot = path.join(ROOT, "output/content-samples/composable-scene-graph-loop");
const candidates = JSON.parse(readFileSync(path.join(sampleRoot, "candidates.json"), "utf8"));
const winnerMap = JSON.parse(readFileSync(path.join(sampleRoot, "winner-map.json"), "utf8")).winners;
const judge = JSON.parse(readFileSync(path.join(sampleRoot, "judge-results.json"), "utf8"));
assert.equal(candidates.skill, "video.cards@v4");
assert.equal(judge.cases.length, 6);
for (const item of judge.cases) {
  const winner = item.candidates.find((candidate) => candidate.candidateIndex === item.winner);
  assert.ok(winner, `${item.id} missing judged winner`);
  assert.equal(winner.hardFail, false, `${item.id} winner hard failed`);
  assert.ok(winner.total >= 78, `${item.id} winner total ${winner.total} < 78`);
  assert.ok(winner.nonTemplate >= 12, `${item.id} winner non-template ${winner.nonTemplate} < 12`);
}
const themes = candidates.results.map((result) => result.id);
const orientations = [
  { name: "portrait", width: 1080, height: 1920 },
  { name: "landscape", width: 1920, height: 1080 },
];
const outputFps = 24;
const durationSec = 12;
// 与真实样片同为 24fps，覆盖每一个输出帧，而不是只抽关键帧。
const times = Array.from(
  { length: outputFps * durationSec },
  (_, index) => Number(((index + 0.5) / outputFps).toFixed(4)),
);

const browser = await chromium.launch({ headless: true });
const audits = [];
const hardFailures = [];
try {
  for (const theme of themes) {
    for (const orientation of orientations) {
      const file = path.join(sampleRoot, `${theme}.${orientation.name}.html`);
      const page = await browser.newPage({ viewport: orientation });
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.goto(`file://${file}`);
      await page.waitForTimeout(160);
      const staticAudit = await page.evaluate(() => ({
        duration: window.__timelines?.main?.duration?.() ?? 0,
        width: Number(document.querySelector("[data-composition-id]")?.getAttribute("data-width")),
        height: Number(document.querySelector("[data-composition-id]")?.getAttribute("data-height")),
        sceneCount: document.querySelectorAll(".visual-scene-graph").length,
        fallbackCount: document.querySelectorAll(".visual-sentence:not(.visual-scene-graph)").length,
        layouts: [...document.querySelectorAll(".visual-scene-graph")].map((node) => node.dataset.sceneLayout),
        objectKinds: [...document.querySelectorAll(".scene-entity")].map((node) => node.dataset.entityKind).sort(),
        motionTraces: [...document.querySelectorAll("[data-motion-trace]")].map((node) => node.dataset.motionTrace).sort(),
      }));
      assert.equal(staticAudit.duration, 12);
      assert.equal(staticAudit.width, orientation.width);
      assert.equal(staticAudit.height, orientation.height);
      if (staticAudit.sceneCount === 0) hardFailures.push({ theme, orientation: orientation.name, type: "fallback" });

      const frames = [];
      for (const time of times) {
        const frame = await page.evaluate((t) => {
          window.__timelines.main.seek(t).pause();
          const active = (element) => {
            const clip = element.closest(".clip");
            if (!clip) return false;
            const style = getComputedStyle(clip);
            return Number(style.opacity) > 0.05 && style.visibility !== "hidden";
          };
          const visible = (element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return active(element) && Number(style.opacity) > 0.05 && style.visibility !== "hidden" && rect.width > 2 && rect.height > 2;
          };
          const overlap = (a, b) => {
            const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            return width > 8 && height > 8 ? Math.round(width * height) : 0;
          };
          const collisions = [];
          for (const text of [...document.querySelectorAll("[data-text-safe]")].filter(visible)) {
            for (const moving of [...document.querySelectorAll("[data-text-avoid]")].filter(visible)) {
              if (text.closest(".scene-entity") === moving.closest(".scene-entity")) continue;
              if (text.closest(".clip") !== moving.closest(".clip")) continue;
              const area = overlap(text.getBoundingClientRect(), moving.getBoundingClientRect());
              if (area > 0) collisions.push({ text: text.textContent?.trim(), moving: moving.parentElement?.dataset.entityId, area });
            }
          }
          const outOfBounds = [...document.querySelectorAll(".scene-entity")]
            .filter(visible)
            .flatMap((entity) => {
              const rect = entity.getBoundingClientRect();
              const root = document.querySelector("[data-composition-id]").getBoundingClientRect();
              return rect.left < root.left - 1 || rect.top < root.top - 1 || rect.right > root.right + 1 || rect.bottom > root.bottom + 1
                ? [{ id: entity.dataset.entityId, rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } }]
                : [];
            });
          return {
            time: t,
            collisions,
            outOfBounds,
            activeSceneCount: [...document.querySelectorAll(".visual-scene-graph")].filter(visible).length,
          };
        }, time);
        if (frame.collisions.length) hardFailures.push({ theme, orientation: orientation.name, type: "collision", ...frame });
        if (frame.outOfBounds.length) hardFailures.push({ theme, orientation: orientation.name, type: "out_of_bounds", ...frame });
        frames.push(frame);
      }
      if (pageErrors.length) hardFailures.push({ theme, orientation: orientation.name, type: "page_error", pageErrors });
      audits.push({ theme, orientation: orientation.name, staticAudit, frames, pageErrors });
      await page.close();
    }
  }
} finally {
  await browser.close();
}

const winnerFingerprints = themes.map((theme) => {
  const audit = audits.find((item) => item.theme === theme && item.orientation === "landscape");
  const axes = audit.staticAudit;
  return {
    theme,
    relations: candidates.results
      .find((result) => result.id === theme)
      ?.candidates.find((candidate) => candidate.candidateIndex === winnerMap[theme])
      ?.cards.flatMap((card) => card.visualPlan?.scene ? [card.visualPlan.relation] : []) ?? [],
    objectAxis: [...new Set(axes.objectKinds)].join("+"),
    layoutAxis: [...new Set(axes.layouts)].join("+"),
    motionAxis: [...new Set(axes.motionTraces)].join("+"),
  };
});
const fullFingerprints = winnerFingerprints.map((item) => `${item.objectAxis}::${item.layoutAxis}::${item.motionAxis}`);
const uniqueRate = new Set(fullFingerprints).size / Math.max(1, fullFingerprints.length);
if (uniqueRate !== 1) hardFailures.push({ type: "duplicate_fingerprint", uniqueRate, winnerFingerprints });

const relationDiversity = [...new Set(winnerFingerprints.flatMap((item) => item.relations))]
  .map((relation) => {
    const members = winnerFingerprints.filter((item) => item.relations.includes(relation));
    return {
      relation,
      themes: members.map((item) => item.theme),
      objectAxisCount: new Set(members.map((item) => item.objectAxis)).size,
      layoutAxisCount: new Set(members.map((item) => item.layoutAxis)).size,
      motionAxisCount: new Set(members.map((item) => item.motionAxis)).size,
    };
  })
  .filter((item) => item.themes.length >= 3);
for (const group of relationDiversity) {
  if (group.objectAxisCount < 2 || group.layoutAxisCount < 2 || group.motionAxisCount < 2) {
    hardFailures.push({ type: "same_relation_axis_repetition", ...group });
  }
}

const report = {
  schema: "creatoros-t802-render-audit/v1",
  status: hardFailures.length === 0 ? "pass" : "fail",
  uniqueFingerprintRate: uniqueRate,
  outputFps,
  framesPerOrientation: times.length,
  winnerFingerprints,
  relationDiversity,
  hardFailures,
  audits,
};
writeFileSync(path.join(sampleRoot, "render-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, uniqueFingerprintRate: uniqueRate, hardFailureCount: hardFailures.length }));
if (hardFailures.length) process.exitCode = 1;
