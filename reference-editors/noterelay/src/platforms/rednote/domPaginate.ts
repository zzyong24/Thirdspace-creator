export function contentOverflows(content: HTMLElement): boolean {
  if (content.scrollHeight > content.clientHeight + 1) return true;
  const boundary = content.getBoundingClientRect().bottom;
  return Array.from(content.children).some((child) => child.getBoundingClientRect().bottom > boundary + 0.5);
}

export function movableContentNodes(content: HTMLElement): HTMLElement[] {
  const children = Array.from(content.children) as HTMLElement[];
  const protectedHeadings = leadingHeadingCount(children);
  return children.filter((_child, index) => index >= protectedHeadings);
}

export function firstBodyNode(content: HTMLElement): ChildNode | null {
  const children = Array.from(content.children) as HTMLElement[];
  const protectedHeadings = leadingHeadingCount(children);
  return protectedHeadings ? children[protectedHeadings - 1]?.nextSibling ?? null : content.firstChild;
}

function leadingHeadingCount(children: HTMLElement[]): number {
  const first = children[0];
  if (!first || !/H[12]/.test(first.tagName)) return 0;
  return first.tagName === "H1" && children[1]?.tagName === "H2" ? 2 : 1;
}

export function compactTableToFit(content: HTMLElement, table: HTMLTableElement): boolean {
  for (const className of ["is-compact", "is-dense"]) {
    if (!table.classList.contains(className)) table.classList.add(className);
    if (!contentOverflows(content)) return true;
  }
  return !contentOverflows(content);
}

export function splitElementToFit(content: HTMLElement, element: HTMLElement): HTMLElement | undefined {
  const original = element.cloneNode(true) as HTMLElement;
  const structuredSuffix = splitStructuredElementToFit(content, element, original);
  if (structuredSuffix) return structuredSuffix;
  if (!canSplitByText(original)) return undefined;

  const textLength = textNodes(original).reduce((total, node) => total + (node.textContent?.length ?? 0), 0);
  if (textLength < 2) return undefined;

  let candidate = element;
  let low = 1;
  let high = textLength - 1;
  let best = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const prefix = cloneTextRange(original, 0, middle);
    candidate.replaceWith(prefix);
    candidate = prefix;
    if (contentOverflows(content)) {
      high = middle - 1;
    } else {
      best = middle;
      low = middle + 1;
    }
  }
  if (!best) {
    candidate.replaceWith(element);
    return undefined;
  }

  const safeBoundary = findSafeTextBoundary(original.textContent || "", best);
  const prefix = cloneTextRange(original, 0, safeBoundary);
  const suffix = cloneTextRange(original, safeBoundary, textLength);
  candidate.replaceWith(prefix);
  if (contentOverflows(content) || !(prefix.textContent || "").trim() || !(suffix.textContent || "").trim()) {
    prefix.replaceWith(element);
    return undefined;
  }
  return suffix;
}

function splitStructuredElementToFit(content: HTMLElement, element: HTMLElement, original: HTMLElement): HTMLElement | undefined {
  if ((original instanceof HTMLTableElement)) return splitTableToFit(content, element, original);
  if ((original instanceof HTMLUListElement) || (original instanceof HTMLOListElement)) return splitListToFit(content, element, original);
  return undefined;
}

function splitTableToFit(content: HTMLElement, element: HTMLElement, original: HTMLTableElement): HTMLElement | undefined {
  const rowCount = tableBodyRows(original).length;
  if (rowCount < 2) return undefined;
  return findStructuredSplit(content, element, rowCount, (start, end) => {
    const clone = original.cloneNode(true) as HTMLTableElement;
    const rows = tableBodyRows(clone);
    rows.forEach((row, index) => { if (index < start || index >= end) row.remove(); });
    return clone;
  }, true);
}

function splitListToFit(content: HTMLElement, element: HTMLElement, original: HTMLUListElement | HTMLOListElement): HTMLElement | undefined {
  const itemCount = directListItems(original).length;
  if (itemCount < 2) return undefined;
  const orderedStart = (original instanceof HTMLOListElement) ? original.start : 1;
  return findStructuredSplit(content, element, itemCount, (start, end) => {
    const clone = original.cloneNode(false) as HTMLUListElement | HTMLOListElement;
    directListItems(original).slice(start, end).forEach((item) => clone.appendChild(item.cloneNode(true)));
    if ((clone instanceof HTMLOListElement) && start > 0) clone.start = clone.reversed ? orderedStart - start : orderedStart + start;
    return clone;
  });
}

function findStructuredSplit(
  content: HTMLElement,
  element: HTMLElement,
  itemCount: number,
  cloneRange: (start: number, end: number) => HTMLElement,
  forceFirstItem = false
): HTMLElement | undefined {
  let candidate = element;
  let low = 1;
  let high = itemCount - 1;
  let best = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const prefix = cloneRange(0, middle);
    candidate.replaceWith(prefix);
    candidate = prefix;
    if (contentOverflows(content)) {
      high = middle - 1;
    } else {
      best = middle;
      low = middle + 1;
    }
  }
  if (!best) {
    if (forceFirstItem) {
      const prefix = cloneRange(0, 1);
      const suffix = cloneRange(1, itemCount);
      candidate.replaceWith(prefix);
      prefix.classList.add("is-forced-row");
      return suffix;
    }
    candidate.replaceWith(element);
    return undefined;
  }

  const prefix = cloneRange(0, best);
  const suffix = cloneRange(best, itemCount);
  candidate.replaceWith(prefix);
  if (contentOverflows(content)) {
    prefix.replaceWith(element);
    return undefined;
  }
  return suffix;
}

function tableBodyRows(table: HTMLTableElement): HTMLTableRowElement[] {
  return Array.from(table.tBodies).flatMap((body) => Array.from(body.rows));
}

function directListItems(list: HTMLUListElement | HTMLOListElement): HTMLLIElement[] {
  return Array.from(list.children).filter((child): child is HTMLLIElement => (child instanceof HTMLLIElement));
}

function canSplitByText(element: HTMLElement): boolean {
  return /^(P|PRE|BLOCKQUOTE|DIV)$/.test(element.tagName);
}

function findSafeTextBoundary(text: string, maximum: number): number {
  const floor = Math.max(1, maximum - 48);
  for (let index = maximum; index >= floor; index -= 1) {
    if (/[\s，。！？；、,.!?;：:）)\]}]/.test(text[index - 1] || "")) return index;
  }
  return maximum;
}

function cloneTextRange(source: HTMLElement, start: number, end: number): HTMLElement {
  const clone = source.cloneNode(false) as HTMLElement;
  const nodes = textNodes(source);
  if (!nodes.length || start >= end) return clone;
  const range = document.createRange();
  const startPoint = textOffsetPoint(nodes, start);
  const endPoint = textOffsetPoint(nodes, end);
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  clone.appendChild(range.cloneContents());
  return clone;
}

function textNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }
  return nodes;
}

function textOffsetPoint(nodes: Text[], offset: number): { node: Text; offset: number } {
  let remaining = offset;
  for (const node of nodes) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) return { node, offset: remaining };
    remaining -= length;
  }
  const last = nodes[nodes.length - 1];
  return { node: last, offset: last.textContent?.length ?? 0 };
}
