import assert from "node:assert/strict";
import { JSDOM } from "/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/frontend/node_modules/jsdom/lib/api.js";
const dom = new JSDOM('<!doctype html><html><body><input id="outside"><div id="surface"></div></body></html>', { url: "http://127.0.0.1:4318/projects/real-host-route" });
const win = dom.window;
for (const key of ["window", "document", "navigator", "location", "localStorage", "sessionStorage", "HTMLElement", "Element", "HTMLCanvasElement", "Image", "HTMLImageElement", "HTMLVideoElement", "HTMLMediaElement", "SVGElement", "AbortController", "AbortSignal", "Node", "NodeFilter", "DocumentFragment", "FocusEvent", "ShadowRoot", "CustomEvent", "Event", "KeyboardEvent", "MouseEvent", "MutationObserver", "DOMRect", "getComputedStyle"]) Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? win : win[key] });
Object.assign(globalThis, { AudioBuffer: class {
}, ResizeObserver: class {
  observe() {
  }
  unobserve() {
  }
  disconnect() {
  }
}, requestAnimationFrame: () => 1, cancelAnimationFrame: () => {
} });
win.requestAnimationFrame = () => 1;
win.cancelAnimationFrame = () => {
};
win.matchMedia = () => ({ matches: false, addEventListener() {
}, removeEventListener() {
}, addListener() {
}, removeListener() {
} });
win.HTMLElement.prototype.scrollIntoView = () => {
};
const context = new Proxy({ measureText: () => ({ width: 10 }), getImageData: () => ({ data: new Uint8ClampedArray(4) }), canvas: null }, { get: (target, key) => key in target ? target[key] : () => {
}, set: (target, key, value) => {
  target[key] = value;
  return true;
} });
win.HTMLCanvasElement.prototype.getContext = () => context;
win.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,fixture";
win.HTMLCanvasElement.prototype.toBlob = (callback) => callback(new Blob(["fixture"], { type: "image/png" }));
class FakeOffscreenCanvas {
  width;
  height;
  constructor(w, h) {
    this.width = w;
    this.height = h;
  }
  getContext() {
    return context;
  }
  convertToBlob() {
    return Promise.resolve(new Blob(["fixture"], { type: "image/png" }));
  }
}
Object.assign(globalThis, { OffscreenCanvas: FakeOffscreenCanvas });
const shadow = document.getElementById("surface").attachShadow({ mode: "open" }), container = document.createElement("div"), portalContainer = document.createElement("div");
shadow.append(container, portalContainer);
const nodeProcess = globalThis.process;
let result;
try {
  delete globalThis.process;
  const module = await import("/tmp/t1053-native-video/delivery/native/native.js");
  const abort = new AbortController();
  const handle = await module.mount(container, { owner: { accountId: "a", outputId: "o", sourceVersionId: "v" }, theme: { mode: "light", tokens: {}, fontFamily: "system-ui", fontSize: "14px", density: "comfortable" }, portalContainer, signal: abort.signal, onChanged() {
  }, onError() {
  }, importMedia: async () => ({ mediaId: "registered" }) });
  assert.equal(container.querySelectorAll("iframe").length, 0);
  assert.ok(container.textContent.includes("\u6B63\u5728\u8F7D\u5165\u89C6\u9891\u7A3F"));
  await handle.dispose();
  assert.equal(container.childElementCount, 0);
  assert.equal(portalContainer.childElementCount, 0);
  result = { status: "PASS", probe: "actual production OpenCut ESM import/mount/dispose without global process", fixture: "Node + jsdom\uFF0CResizeObserver/Canvas/OffscreenCanvas\u660E\u786Efixture\uFF1B\u672Aload\u5DE5\u7A0B\u6216\u8C03\u7528GPU" };
} catch (error) {
  result = { status: "FAIL", message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : "" };
} finally {
  globalThis.process = nodeProcess;
  dom.window.close();
}
console.log(JSON.stringify(result, null, 2));
if (result.status !== "PASS") process.exitCode = 1;
