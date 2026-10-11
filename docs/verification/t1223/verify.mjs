import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const galleryDir = path.join(root, "docs/verification/t1207");
const generatorPath = path.join(galleryDir, "generate-gallery.mjs");
const indexPath = path.join(galleryDir, "scenario-index.ndjson");
const sourceIndexBytes = fs.readFileSync(indexPath);
const sourceIndexHash = hash(sourceIndexBytes);
const generatorSource = fs.readFileSync(generatorPath, "utf8");
const rows = sourceIndexBytes.toString("utf8").split(/\r?\n/u)
  .flatMap((line, index) => line.trim() ? [{ row: JSON.parse(line), ordinal: index + 1 }] : []);
const statusCounts = rows.reduce((counts, { row }) => {
  counts[row.status] = (counts[row.status] ?? 0) + 1;
  return counts;
}, {});
const uniqueTestIds = new Set(rows
  .map(({ row }) => row.testId)
  .filter((testId) => typeof testId === "string" && testId.length > 0));
const uniqueSpecs = new Set(rows.map(({ row }) => row.spec));

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function decodeHtml(value) {
  return value.replace(/&(?:amp|lt|gt|quot|#39);/gu, (entity) => ({
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
  })[entity]);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/gu, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function statusLabel(status) {
  return ({ passed: "PASS", failed: "FAIL", timedOut: "TIMEOUT", skipped: "SKIP" })[status] ?? status;
}

function parseArticles(html) {
  return [...html.matchAll(/<article class="case ([^"]*)" id="([^"]+)">([\s\S]*?)<\/article>/gu)]
    .map(([, classStatus, id, body]) => {
      const screenshot = body.match(/<a class="thumb" href="([^"]+)"/u)?.[1];
      const title = body.match(/<div class="title">([\s\S]*?)<\/div>/u)?.[1] ?? "";
      const url = body.match(/<div class="url">([\s\S]*?)<\/div>/u)?.[1] ?? "";
      const testId = body.match(/<div class="testid">([\s\S]*?)<\/div>/u)?.[1] ?? "";
      const badge = body.match(/<span class="badge">([\s\S]*?)<\/span>/u)?.[1] ?? "";
      return {
        classStatus,
        id: decodeHtml(id),
        screenshot: screenshot === undefined ? undefined : decodeHtml(screenshot),
        title: decodeHtml(title),
        url: decodeHtml(url),
        testId: decodeHtml(testId),
        badge: decodeHtml(badge),
        body,
      };
    });
}

function runGenerator(directory) {
  const result = spawnSync(process.execPath, [path.join(directory, "generate-gallery.mjs")], {
    cwd: directory,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `gallery generator must exit 0: ${result.stderr || result.stdout}`);
  return {
    stdout: result.stdout.trim(),
    html: fs.readFileSync(path.join(directory, "E2E-GALLERY.html")),
    markdown: fs.readFileSync(path.join(directory, "E2E-CASE-INDEX.md")),
  };
}

function prepareGeneratorDirectory(directory, ndjson) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "generate-gallery.mjs"), generatorSource);
  fs.writeFileSync(path.join(directory, "scenario-index.ndjson"), ndjson);
}

function assertRowMapping(galleryHtml, markdownText, expectedRecords, imageRoot, { verifySummary = true } = {}) {
  const articleRecords = parseArticles(galleryHtml);
  assert.equal(articleRecords.length, expectedRecords.length, "each index row must produce exactly one article");
  const articleIds = articleRecords.map((article) => article.id);
  assert.equal(new Set(articleIds).size, articleRecords.length, "each history row must have one unique article anchor");
  const sectionIds = [...galleryHtml.matchAll(/<section class="group" id="([^"]+)">/gu)].map((match) => decodeHtml(match[1]));
  assert.equal(sectionIds.length, uniqueValue(expectedRecords.map(({ row }) => row.spec)), "every spec section must render once");
  assert.equal(new Set(sectionIds).size, sectionIds.length, "spec navigation anchors must be unique");

  for (const record of expectedRecords) {
    const { row, ordinal } = record;
    const expectedAnchor = `record-${encodeURIComponent(row.spec ?? "")}--${encodeURIComponent(row.testId ?? "")}--${ordinal}`;
    const article = articleRecords.find((candidate) => candidate.id === expectedAnchor);
    assert(article, `row ${ordinal} must map to exactly one article by complete spec, Test ID, and original line ordinal`);
    const status = statusLabel(row.status);
    assert.equal(article.classStatus, row.status, `row ${ordinal} status class must remain ${row.status}`);
    assert.equal(article.badge, status, `row ${ordinal} status badge must remain ${status}`);
    assert.equal(article.title, String(row.title ?? ""), `row ${ordinal} title must be preserved`);
    assert.equal(article.url, String(row.url ?? "页面已关闭，URL不可用"), `row ${ordinal} URL must be preserved`);
    assert.equal(article.testId, String(row.testId ?? ""), `row ${ordinal} Test ID must be preserved`);
    assert.equal(article.screenshot, row.screenshot, `row ${ordinal} screenshot path must be preserved`);
    assert(article.id.startsWith(`record-${encodeURIComponent(row.spec ?? "")}--${encodeURIComponent(row.testId ?? "")}--`), `row ${ordinal} anchor must identify its full spec and Test ID`);
    assert(article.id.endsWith(`--${ordinal}`), `row ${ordinal} anchor must retain its original NDJSON line ordinal`);
    assert(article.body.includes(`第 ${ordinal} 条历史运行`), `row ${ordinal} must be visibly identified as a separate run`);
    assert(article.body.includes(`retry ${row.retry}`), `row ${ordinal} retry count must be preserved`);
    const expectedError = row.errors?.[0]?.message ?? row.screenshotError;
    if (expectedError) assert(article.body.includes(escapeHtml(expectedError)), `row ${ordinal} error evidence must be preserved`);

    let screenshotMarkdown;
    if (row.screenshot) {
      assert(fs.existsSync(path.resolve(imageRoot, row.screenshot)), `row ${ordinal} screenshot file must exist: ${row.screenshot}`);
      screenshotMarkdown = `[查看原图](${row.screenshot})`;
    } else {
      assert(article.body.includes(`截图缺失：${escapeHtml(row.screenshotStatus)}`), `row ${ordinal} missing-image state must remain visible`);
      screenshotMarkdown = `缺失（${row.screenshotStatus}）`;
    }

    const recordLink = `E2E-GALLERY.html#${article.id}`;
    const markdownLines = markdownText.split("\n").filter((line) => line.includes(recordLink));
    assert.equal(markdownLines.length, 1, `row ${ordinal} Markdown index must link once to its unique HTML record`);
    const markdownLine = markdownLines[0];
    const markdownTitle = String(row.title ?? "").replace(/\|/gu, "\\|").replace(/\n/gu, " ");
    const markdownUrl = row.url ? `[${row.url}](${row.url})` : "页面已关闭";
    assert(markdownLine.startsWith(`| ${status} | ${markdownTitle} | ${markdownUrl} | ${screenshotMarkdown} | \`${row.testId ?? ""}\``), `row ${ordinal} Markdown status, title, URL, screenshot, and Test ID must stay paired`);
  }

  const markdownRows = markdownText.match(/^\| (?:PASS|FAIL|TIMEOUT|SKIP) \|/gmu) ?? [];
  assert.equal(markdownRows.length, expectedRecords.length, "Markdown must contain one status row per historical run");

  if (verifySummary) {
    const uniqueTestIdsCount = uniqueValue(expectedRecords
      .map(({ row }) => row.testId)
      .filter((testId) => typeof testId === "string" && testId.length > 0));
    const summary = galleryHtml.match(/<p class="meta" role="note">([\s\S]*?)<\/p>/u)?.[1] ?? "";
    assert(summary.includes(`${expectedRecords.length} 条历史运行记录`), "gallery must label the count as historical run records");
    assert(summary.includes(`${uniqueTestIdsCount} 个独立用例`), "gallery must count distinct Test IDs separately from runs");
    assert(summary.includes(`${uniqueValue(expectedRecords.map(({ row }) => row.spec))} 个 spec`), "gallery must show the distinct spec count");
    assert(summary.includes("不表示全功能通过"), "gallery must not imply the historical suite is currently all green");

    const markdownSummary = markdownText.split("\n", 4).join("\n");
    assert(markdownSummary.includes(`${expectedRecords.length} 条历史运行记录`), "Markdown must label historical run count");
    assert(markdownSummary.includes(`${uniqueTestIdsCount} 个不同 Test ID`), "Markdown must separately count unique Test IDs");
    for (const [statusKey, label] of [["passed", "PASS"], ["failed", "FAIL"], ["timedOut", "TIMEOUT"], ["skipped", "SKIP"]]) {
      assert(markdownSummary.includes(`${statusCountsFor(expectedRecords)[statusKey] ?? 0} ${label}`), `Markdown must retain per-run ${label} count`);
    }
  }
  return articleRecords;
}

function uniqueValue(values) {
  return new Set(values).size;
}

function statusCountsFor(expectedRecords) {
  return expectedRecords.reduce((counts, { row }) => {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    return counts;
  }, {});
}

function verifyMiniFixture(tempRoot) {
  const historical = rows.filter(({ row }) => row.url?.includes(":3912/") || row.url?.includes(":3913/"));
  assert.equal(historical.length, 2, "fixture must use the preserved 3912/3913 history pair");
  const [failedSource, passedSource] = historical;
  assert.equal(failedSource.row.status, "failed");
  assert.equal(passedSource.row.status, "passed");
  assert.equal(failedSource.row.testId, passedSource.row.testId, "the two historical rows must share one Test ID");

  const fixtureRows = historical.map((source, index) => {
    const screenshot = `screenshots/${index === 0 ? "failed" : "passed"}.png`;
    const screenshotPath = path.resolve(galleryDir, source.row.screenshot);
    assert(fs.existsSync(screenshotPath), `historical screenshot must exist: ${source.row.screenshot}`);
    fs.mkdirSync(path.join(tempRoot, "screenshots"), { recursive: true });
    fs.copyFileSync(screenshotPath, path.join(tempRoot, screenshot));
    return {
      ordinal: index + 1,
      row: { ...source.row, spec: "fixtures/duplicate-run.spec.ts", screenshot },
    };
  });
  const ndjson = `${fixtureRows.map(({ row }) => JSON.stringify(row)).join("\n")}\n`;
  const firstDir = path.join(tempRoot, "mini-a");
  const secondDir = path.join(tempRoot, "mini-b");
  prepareGeneratorDirectory(firstDir, ndjson);
  prepareGeneratorDirectory(secondDir, ndjson);
  fs.cpSync(path.join(tempRoot, "screenshots"), path.join(firstDir, "screenshots"), { recursive: true });
  fs.cpSync(path.join(tempRoot, "screenshots"), path.join(secondDir, "screenshots"), { recursive: true });
  const first = runGenerator(firstDir);
  const second = runGenerator(secondDir);
  assert.deepEqual(first.html, second.html, "two same-ID historical runs must generate deterministic HTML bytes");
  assert.deepEqual(first.markdown, second.markdown, "two same-ID historical runs must generate deterministic Markdown bytes");
  const markdown = first.markdown.toString("utf8");
  const articles = assertRowMapping(first.html.toString("utf8"), markdown, fixtureRows, firstDir);
  assert.equal(new Set(articles.map((article) => article.id)).size, 2, "fixture run records must have independent anchors");
  assert(first.html.toString("utf8").includes("2 条历史运行记录"));
  assert(first.html.toString("utf8").includes("1 个独立用例"));
  assert(markdown.includes("2 条历史运行记录"));
  assert(markdown.includes("1 个不同 Test ID"));
  return {
    records: fixtureRows.length,
    uniqueTestIds: 1,
    statuses: fixtureRows.map(({ row }) => row.status),
    anchors: articles.map((article) => article.id),
    deterministic: true,
  };
}

function verifyFullIndexDeterminism(tempRoot) {
  const ndjson = sourceIndexBytes.toString("utf8");
  const firstDir = path.join(tempRoot, "full-a");
  const secondDir = path.join(tempRoot, "full-b");
  prepareGeneratorDirectory(firstDir, ndjson);
  prepareGeneratorDirectory(secondDir, ndjson);
  const first = runGenerator(firstDir);
  const second = runGenerator(secondDir);
  assert.deepEqual(first.html, second.html, "full-index gallery must generate identical bytes twice");
  assert.deepEqual(first.markdown, second.markdown, "full-index Markdown must generate identical bytes twice");
  const articleRecords = assertRowMapping(first.html.toString("utf8"), first.markdown.toString("utf8"), rows, galleryDir);
  assert.deepEqual(first.html, fs.readFileSync(path.join(galleryDir, "E2E-GALLERY.html")), "checked-in gallery must equal deterministic generated bytes");
  assert.deepEqual(first.markdown, fs.readFileSync(path.join(galleryDir, "E2E-CASE-INDEX.md")), "checked-in Markdown index must equal deterministic generated bytes");

  const failed3912 = rows.find(({ row }) => row.url?.includes(":3912/"));
  const passed3913 = rows.find(({ row }) => row.url?.includes(":3913/"));
  assert(failed3912 && passed3913, "both historical 3912/3913 records must remain in the source index");
  assert.equal(failed3912.row.status, "failed");
  assert.equal(passed3913.row.status, "passed");
  const anchorFor = ({ row, ordinal }) => `record-${encodeURIComponent(row.spec ?? "")}--${encodeURIComponent(row.testId ?? "")}--${ordinal}`;
  const failArticle = articleRecords.find((article) => article.id === anchorFor(failed3912));
  const passArticle = articleRecords.find((article) => article.id === anchorFor(passed3913));
  assert.notEqual(failArticle.id, passArticle.id, "3912 FAIL and 3913 PASS must have distinct anchors");
  assert.equal(failArticle.screenshot, failed3912.row.screenshot, "3912 failure screenshot path must remain unchanged");
  assert.equal(passArticle.screenshot, passed3913.row.screenshot, "3913 pass screenshot path must remain unchanged");
  assert(fs.existsSync(path.resolve(galleryDir, failArticle.screenshot)), "3912 failure screenshot must exist");
  assert(fs.existsSync(path.resolve(galleryDir, passArticle.screenshot)), "3913 pass screenshot must exist");
  assert(first.markdown.toString("utf8").includes(`E2E-GALLERY.html#${failArticle.id}`));
  assert(first.markdown.toString("utf8").includes(`E2E-GALLERY.html#${passArticle.id}`));

  return {
    records: rows.length,
    uniqueTestIds: uniqueTestIds.size,
    specs: uniqueSpecs.size,
    statuses: statusCounts,
    screenshotRows: rows.filter(({ row }) => row.screenshot).length,
    missingScreenshotRows: rows.filter(({ row }) => !row.screenshot).length,
    articleCount: articleRecords.length,
    articleIdsUnique: new Set(articleRecords.map((article) => article.id)).size === articleRecords.length,
    3912: { status: failed3912.row.status, anchor: failArticle.id, screenshot: failArticle.screenshot, exists: true },
    3913: { status: passed3913.row.status, anchor: passArticle.id, screenshot: passArticle.screenshot, exists: true },
    deterministic: true,
  };
}

async function reviewReportInBrowser(screenshotDir) {
  const requireFromFrontend = createRequire(path.join(root, "frontend/package.json"));
  const { chromium } = requireFromFrontend("@playwright/test");
  fs.mkdirSync(screenshotDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const requests = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    page.on("request", (request) => requests.push(request.url()));
    const galleryUrl = pathToFileURL(path.join(galleryDir, "E2E-GALLERY.html")).href;
    await page.goto(galleryUrl, { waitUntil: "domcontentloaded" });
    const expectedSummary = `${rows.length} 条历史运行记录`;
    assert((await page.locator("body").innerText()).includes(expectedSummary), "1024px view must render the historical record summary");
    assert.equal(await page.locator("article.case").count(), rows.length, "browser must render all record cards");
    await page.screenshot({ path: path.join(screenshotDir, "gallery-1024.png"), fullPage: false });

    await page.setViewportSize({ width: 1536, height: 960 });
    assert((await page.locator("body").innerText()).includes(expectedSummary), "1536px view must render the historical record summary");
    await page.screenshot({ path: path.join(screenshotDir, "gallery-1536.png"), fullPage: false });

    const records = [
      rows.find(({ row }) => row.url?.includes(":3912/")),
      rows.find(({ row }) => row.url?.includes(":3913/")),
    ];
    for (const record of records) {
      const anchor = `record-${encodeURIComponent(record.row.spec ?? "")}--${encodeURIComponent(record.row.testId ?? "")}--${record.ordinal}`;
      const article = parseArticles(fs.readFileSync(path.join(galleryDir, "E2E-GALLERY.html"), "utf8")).find((candidate) => candidate.id === anchor);
      assert(article, `browser preview record ${record.row.url} must have a unique card`);
      const card = page.locator(`article[id="${article.id}"]`);
      assert.equal(await card.count(), 1, `browser must locate one independent card for ${record.row.url}`);
      await card.scrollIntoViewIfNeeded();
      const imageLink = card.locator("a.thumb");
      assert.equal(await imageLink.getAttribute("href"), record.row.screenshot, "thumbnail must link to the original per-run screenshot");
      const [popup] = await Promise.all([page.waitForEvent("popup"), imageLink.click()]);
      await popup.waitForLoadState("load");
      assert(popup.url().endsWith(encodeURI(record.row.screenshot.split("/").at(-1))), "thumbnail click must open that row's original image");
      const loadedImageWidth = await popup.locator("img").evaluate((image) => image.naturalWidth).catch(() => 0);
      assert(loadedImageWidth > 0, `original screenshot must open as an image for ${record.row.url}`);
      await popup.close();
    }
    assert(requests.every((url) => url.startsWith("file://")), `report preview must not access network URLs: ${JSON.stringify(requests.filter((url) => !url.startsWith("file://")))}`);
    return {
      screenshots: ["gallery-1024.png", "gallery-1536.png"],
      requestCount: requests.length,
      nonFileRequests: requests.filter((url) => !url.startsWith("file://")),
    };
  } finally {
    await browser.close();
  }
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "t1223-verify-"));
let result;
try {
  const miniFixture = verifyMiniFixture(tempRoot);
  const fullIndex = verifyFullIndexDeterminism(tempRoot);
  const indexHashAfter = hash(fs.readFileSync(indexPath));
  assert.equal(indexHashAfter, sourceIndexHash, "scenario-index.ndjson must remain byte-identical during verification");
  const browser = await reviewReportInBrowser(here);
  result = {
    task: "T1223 verification gallery record identity",
    sourceIndexSha256: sourceIndexHash,
    generatorSha256: hash(fs.readFileSync(generatorPath)),
    miniFixture,
    fullIndex,
    indexUnchanged: true,
    browser,
  };
  fs.writeFileSync(path.join(here, "verification-result.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
