export function splitByHeading(markdown: string, level: 1 | 2): string[] {
  const lines = markdown.split("\n");
  const pages: string[] = [];
  let current: string[] = [];
  let fence: "```" | "~~~" | undefined;
  const heading = new RegExp(`^ {0,3}#{${level}}(?!#)[ \\t]+.+?(?:[ \\t]+#+)?[ \\t]*$`);
  for (const line of lines) {
    const fenceMatch = line.match(/^ {0,3}(```|~~~)/)?.[1] as "```" | "~~~" | undefined;
    if (fenceMatch) fence = fence ? (fence === fenceMatch ? undefined : fence) : fenceMatch;
    const isPageHeading = !fence && heading.test(line);
    const keepWithLeadingTitle = level === 2 && isPageHeading && containsOnlyLeadingH1(current);
    if (isPageHeading && current.some((item) => item.trim()) && !keepWithLeadingTitle) {
      pages.push(current.join("\n").trim());
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.some((item) => item.trim())) pages.push(current.join("\n").trim());
  return (pages.length ? pages : [markdown]).flatMap(splitByHorizontalRule);
}

function containsOnlyLeadingH1(lines: string[]): boolean {
  const content = lines.filter((line) => line.trim());
  return content.length === 1 && /^ {0,3}#(?!#)[ \t]+.+?(?:[ \t]+#+)?[ \t]*$/.test(content[0] ?? "");
}

export function paginateByCapacity(pages: string[], fontSize: number, aspectRatio: number, template: "default" | "notes"): string[] {
  // aspectRatio is width / height. A larger value means a shorter card and therefore less room.
  const ratioFactor = Math.max(.68, Math.min(1.15, .75 / Math.max(.6, aspectRatio)));
  const baseCapacity = (template === "notes" ? 360 : 350) * Math.pow(16 / Math.max(14, fontSize), 1.65) * ratioFactor;
  return pages.flatMap((page) => splitLongPage(page, Math.round(baseCapacity)));
}

function splitLongPage(page: string, capacity: number): string[] {
  const blocks = page.split(/\n{2,}/).filter((block) => block.trim());
  if (!blocks.length) return [page];
  const heading = blocks[0].match(/^ {0,3}(#{1,2})[ \t]+(.+)$/);
  const headingBlock = heading?.[0];
  const bodyBlocks = heading ? blocks.slice(1) : blocks;
  const chunks: string[][] = [];
  let current: string[] = headingBlock ? [headingBlock] : [];
  let used = headingBlock ? blockWeight(headingBlock) : 0;
  for (const rawBlock of bodyBlocks) {
    for (const block of breakOversizedBlock(rawBlock, Math.max(120, capacity - 80))) {
      const weight = blockWeight(block);
      if (current.length > (headingBlock ? 1 : 0) && used + weight > capacity) {
        chunks.push(current);
        current = headingBlock ? [continuationHeading(headingBlock, chunks.length)] : [];
        used = current.length ? blockWeight(current[0]) : 0;
      }
      current.push(block);
      used += weight;
    }
  }
  if (current.length) chunks.push(current);
  return chunks.map((chunk) => chunk.join("\n\n").trim()).filter(Boolean);
}

function breakOversizedBlock(block: string, capacity: number): string[] {
  if (blockWeight(block) <= capacity || /^```|^~~~|^!\[/.test(block.trim())) return [block];
  const sentences = block.split(/(?<=[。！？.!?；;])\s*/).filter(Boolean);
  if (sentences.length <= 1) {
    const parts: string[] = [];
    for (let index = 0; index < block.length; index += Math.max(80, capacity)) parts.push(block.slice(index, index + Math.max(80, capacity)));
    return parts;
  }
  const parts: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && blockWeight(current + sentence) > capacity) { parts.push(current); current = ""; }
    current += sentence;
  }
  if (current) parts.push(current);
  return parts;
}

function continuationHeading(heading: string, index: number): string {
  return heading.replace(/^([ \t]*#{1,2}[ \t]+)(.+?)(?:（续(?:\s*\d+)?）)?$/, (_all, prefix: string, title: string) => `${prefix}${title}（续${index > 1 ? ` ${index}` : ""}）`);
}

function blockWeight(block: string): number {
  if (/^!\[/.test(block.trim())) return 260;
  if (/^```|^~~~/.test(block.trim())) return block.length * 1.35 + 70;
  if (/^#{1,6}\s/.test(block.trim())) return block.length * 1.25 + 42;
  return block.replace(/\s+/g, "").length + (block.match(/\n/g)?.length ?? 0) * 18 + 18;
}

function splitByHorizontalRule(page: string): string[] {
  const lines = page.split("\n");
  const heading = lines.find((line) => /^ {0,3}#{1,2}(?!#)[ \t]+/.test(line));
  const result: string[] = [];
  let current: string[] = [];
  let fence: "```" | "~~~" | undefined;
  for (const line of lines) {
    const fenceMatch = line.match(/^ {0,3}(```|~~~)/)?.[1] as "```" | "~~~" | undefined;
    if (fenceMatch) fence = fence ? (fence === fenceMatch ? undefined : fence) : fenceMatch;
    const isRule = !fence && /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line);
    if (isRule && current.some((item) => item.trim())) {
      result.push(current.join("\n").trim());
      current = heading ? [heading] : [];
    } else current.push(line);
  }
  if (current.some((item) => item.trim()) && !(current.length === 1 && current[0] === heading)) result.push(current.join("\n").trim());
  return result.length ? result : [page];
}
