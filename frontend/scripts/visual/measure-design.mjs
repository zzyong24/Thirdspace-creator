// measure-design.mjs — sample specific design coordinates
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";

const DESIGN = process.argv[2];
if (!DESIGN) {
  console.error("Usage: node measure-design.mjs <path-to-png>");
  process.exit(2);
}

const png = PNG.sync.read(readFileSync(DESIGN));
const { width, data } = png;

function pixelAt(x, y) {
  const idx = (y * width + x) * 4;
  return [data[idx], data[idx + 1], data[idx + 2]];
}

function hex([r, g, b]) {
  return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`;
}

// Multi-point scan to find a column with persistent vertical line
function findVerticalLine(yMin, yMax) {
  // for each x in 0..300, count "dark" pixels (border line)
  const darkCounts = new Array(300).fill(0);
  for (let x = 0; x < 300; x++) {
    for (let y = yMin; y < yMax; y++) {
      const px = pixelAt(x, y);
      if (px[0] < 230 && px[1] < 230 && px[2] < 230) {
        darkCounts[x]++;
      }
    }
  }
  let maxX = -1;
  let maxCount = 0;
  for (let x = 200; x < 300; x++) {
    if (darkCounts[x] > maxCount) {
      maxCount = darkCounts[x];
      maxX = x;
    }
  }
  return { maxX, maxCount };
}

const ve = findVerticalLine(80, 950);
console.log(`Vertical line candidates at x=${ve.maxX}, dark count=${ve.maxCount}/${950-80}`);

// Sample header area for height — find where sidebar-bg starts (below header)
function findHeaderEndX() {
  // walk down at x=100 (sidebar text region); find first y where pixel is darker
  for (let y = 0; y < 200; y++) {
    const px = pixelAt(100, y);
    // sidebar items have dark text or muted bg
    if (px[0] < 230) return y;
  }
  return -1;
}
const he = findHeaderEndX();
console.log(`Header ends at y=${he}`);

// Get card pixel patterns
function sampleBox(x1, y1, x2, y2) {
  const counts = new Map();
  for (let y = y1; y < y2; y++) {
    for (let x = x1; x < x2; x++) {
      const px = pixelAt(x, y);
      const k = hex(px);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  // top 5 most common
  const sorted = [...counts.entries()].sort((a,b) => b[1]-a[1]).slice(0, 8);
  return sorted.map(([k, c]) => `${k}=${c}`);
}

// Sample the AI card region (sidebar bottom)
console.log("\n=== Sidebar AI card region (~y=850-980) ===");
console.log(sampleBox(15, 850, 215, 980).join(" "));

console.log("\n=== Sidebar bg region (mid sidebar) ===");
console.log(sampleBox(15, 200, 215, 700).join(" "));

console.log("\n=== Header region (top) ===");
console.log(sampleBox(224, 0, 1536, 80).join(" "));

console.log("\n=== Page canvas region (right of sidebar) ===");
console.log(sampleBox(280, 100, 1530, 950).join(" "));

console.log("\n=== Sidebar active-nav bg region (top of nav, around y=80-110) ===");
console.log(sampleBox(15, 80, 215, 120).join(" "));
