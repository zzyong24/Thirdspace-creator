import * as React from "react";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { ProductionScriptTranscript } from "./production-script-transcript";
afterEach(cleanup);
const header =
  "<!-- markdown-state:body -->\n## V1 <!-- markdown-state:track:track-one -->\n<!-- markdown-state:scope:unchanged -->\n";
const source = (media: string, asset = media) =>
  `### ${asset} <!-- markdown-state:source:${encodeURIComponent(media)}:${encodeURIComponent(asset)} -->\n`;
const clip = (n: number, id: string, start: number, end: number, rate = 1) =>
  `[c${n}] ${Math.round((end - start) / rate)}t source=${start}..${end}t rate=${rate} <!-- markdown-state:item:${encodeURIComponent(id)} -->\n`;
const a =
  source("media-a", "asset-a") +
  clip(1, "element-a", 0, 240000) +
  "[s1] 第一段真实文字\n[silence=60000t] <!-- markdown-state:range:120000..180000 -->\n[s2] 后面的词\n保留未知附件\n";
const b =
  source("media-b", "asset-b") +
  clip(2, "element-b", 120000, 360000) +
  "[s1] 第二个原片文字\n";
const again =
  source("media-a", "asset-a") +
  clip(3, "element-c", 360000, 480000) +
  "[s3] 同原片再次出现\n";
it("用真实文字和秒数展示A-B-A，隐藏语法和内部身份，silence不宣称声学静音", () => {
  render(
    <ProductionScriptTranscript
      markdown={header + a + "[gap 120000t]\n" + b + again}
      onChange={vi.fn()}
      onLocate={vi.fn()}
    />,
  );
  expect(screen.getByText("第一段真实文字")).toBeInTheDocument();
  expect(screen.getByText("第二个原片文字")).toBeInTheDocument();
  expect(screen.getByText("同原片再次出现")).toBeInTheDocument();
  expect(screen.getByText("未转录区间 · 0.5 秒")).toBeInTheDocument();
  expect(screen.getByText("成片 3–5 秒 · 原片 1–3 秒")).toBeInTheDocument();
  for (const raw of [
    "markdown-state",
    "[c1]",
    "[s1]",
    "source=",
    "element-a",
    "asset-a",
    "media-a",
    "保留未知附件",
  ])
    expect(document.body.textContent).not.toContain(raw);
});
it("选中词句只划去已知原行，完整保留silence/gap/未知行和CRLF", () => {
  const md = (header + a + "[gap 120000t]\n" + b).replace(/\n/g, "\r\n"),
    change = vi.fn();
  render(
    <ProductionScriptTranscript
      markdown={md}
      onChange={change}
      onLocate={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByLabelText("选择片段 1 的词句 1"));
  fireEvent.click(screen.getByRole("button", { name: "删除所选词句" }));
  expect(change).toHaveBeenCalledWith(
    md.replace("[s1] 第一段真实文字", "~~[s1] 第一段真实文字~~"),
  );
  expect(change.mock.calls[0][0]).toContain(
    "[silence=60000t] <!-- markdown-state:range:120000..180000 -->\r\n",
  );
});
it("跨source移动只在同track交换整组并补精确来源，gap与所有外部未知内容保留", () => {
  const md =
      header +
      a +
      "[gap 120000t]\n" +
      b +
      again +
      "<!-- 未知外部保护 -->\n## V2 <!-- markdown-state:track:track-two -->\n" +
      source("media-d") +
      clip(4, "element-d", 0, 120000) +
      "[s1] 另一轨\n",
    change = vi.fn();
  render(
    <ProductionScriptTranscript
      markdown={md}
      onChange={change}
      onLocate={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "下移片段 1" }));
  const next = change.mock.calls[0][0];
  expect(next.indexOf("[c2]")).toBeLessThan(next.indexOf("[c1]"));
  expect(next.indexOf("[c1]")).toBeLessThan(next.indexOf("[c3]"));
  expect(next.indexOf("[gap 120000t]")).toBeGreaterThan(next.indexOf("[c2]"));
  expect(next.indexOf("[gap 120000t]")).toBeLessThan(next.indexOf("[c1]"));
  expect(next.slice(0, next.indexOf("[c2]"))).toContain(
    source("media-b", "asset-b"),
  );
  expect(
    next.slice(next.indexOf("[gap 120000t]"), next.indexOf("[c1]")),
  ).toContain(source("media-a", "asset-a"));
  for (const preserved of [
    "保留未知附件",
    "<!-- 未知外部保护 -->",
    "[silence=60000t] <!-- markdown-state:range:120000..180000 -->",
  ])
    expect(next).toContain(preserved);
  expect(screen.getByRole("button", { name: "上移片段 4" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "下移片段 3" })).toBeDisabled();
});
it("整片删除只标记c行，重复保完整source和子行，不编新ID或删未知内容", () => {
  const md = header + a,
    change = vi.fn(),
    view = render(
      <ProductionScriptTranscript
        markdown={md}
        onChange={change}
        onLocate={vi.fn()}
      />,
    );
  fireEvent.click(screen.getByRole("button", { name: "删除片段 1" }));
  expect(change).toHaveBeenLastCalledWith(
    md.replace(
      clip(1, "element-a", 0, 240000).trim(),
      `~~${clip(1, "element-a", 0, 240000).trim()}~~`,
    ),
  );
  view.rerender(
    <ProductionScriptTranscript
      markdown={md}
      onChange={change}
      onLocate={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "重复片段 1" }));
  const copy = change.mock.calls.at(-1)![0];
  expect(copy.match(/\[c1\]/g)).toHaveLength(2);
  expect(copy.match(/保留未知附件/g)).toHaveLength(2);
  expect(
    copy.match(/markdown-state:source:media-a:asset-a/g)!.length,
  ).toBeGreaterThanOrEqual(2);
});
it("已删词可明确恢复；无转录显示精确片段范围而不造文字", () => {
  const md =
      header +
      source("media-a") +
      clip(1, "element-a", 0, 120000) +
      "~~[s1] 用户已删的词~~\n" +
      clip(2, "element-b", 240000, 360000),
    change = vi.fn();
  render(
    <ProductionScriptTranscript
      markdown={md}
      onChange={change}
      onLocate={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "恢复片段 1 的词句 1" }));
  expect(change).toHaveBeenCalledWith(
    md.replace("~~[s1] 用户已删的词~~", "[s1] 用户已删的词"),
  );
  expect(
    screen.getByText("暂无词句转录，可按片段范围操作。"),
  ).toBeInTheDocument();
});
it("定位数学仅120000ticks和真实rate，词精确位置只来自父级回执", () => {
  const md =
      header +
      "[gap 120000t]\n" +
      source("真实media", "真实asset") +
      clip(1, "真实element", 240000, 720000, 2) +
      "[s1] 真实词\n[s2] 连续后词\n",
    locate = vi.fn(),
    resolve = vi.fn(() => ({
      sourceTick: 300000,
      nativeTick: 150000,
      tokenId: "真实token",
    }));
  render(
    <ProductionScriptTranscript
      markdown={md}
      onChange={vi.fn()}
      onLocate={locate}
      resolveToken={resolve}
    />,
  );
  expect(resolve).toHaveBeenCalledWith({
    mediaId: "真实media",
    assetId: "真实asset",
    segmentId: 1,
    elementId: "真实element",
    sourceStart: 240000,
    sourceEnd: 720000,
    rate: 2,
    nativeStart: 120000,
  });
  fireEvent.click(screen.getByRole("button", { name: "定位片段 1 的词句 1" }));
  expect(locate).toHaveBeenCalledWith({
    elementId: "真实element",
    sourceTick: 300000,
    nativeTick: 150000,
    tokenId: "真实token",
  });
});
it("缺真实词证据只定位所在片段；非法回执不产生猜测时码", () => {
  const md =
      header +
      "[gap 120000t]\n" +
      source("media-a") +
      clip(1, "element-a", 240000, 720000, 2) +
      "[s1] 第一词\n[s2] 不能猜第二词\n",
    locate = vi.fn();
  render(
    <ProductionScriptTranscript
      markdown={md}
      onChange={vi.fn()}
      onLocate={locate}
      resolveToken={() => ({
        sourceTick: 999999,
        nativeTick: 123456,
        tokenId: "bad",
      })}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "定位片段 1 的词句 2 所在片段" }),
  );
  expect(locate).toHaveBeenCalledWith({
    elementId: "element-a",
    sourceTick: 240000,
    nativeTick: 120000,
  });
  expect(
    screen.getByText("没有可验证的词句定位，定位按钮打开所在片段。"),
  ).toBeInTheDocument();
});
it("disabled锁所有显式操作，未知source/clip不制造可写控件", () => {
  const change = vi.fn(),
    locate = vi.fn();
  render(
    <ProductionScriptTranscript
      markdown={header + a + "### 未识别来源\n[c9] broken\n未知尾行"}
      onChange={change}
      onLocate={locate}
      disabled
    />,
  );
  for (const button of screen.getAllByRole("button"))
    expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "删除片段 1" }));
  expect(change).not.toHaveBeenCalled();
  expect(locate).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "删除片段 9" })).toBeNull();
});

it("长转录按需展开，不为首屏解析全部词定位；展开仍定位真实父回执", () => {
  const words = Array.from(
      { length: 150 },
      (_, i) => `[s${i + 1}] 真实词${i + 1}\n`,
    ).join(""),
    resolve = vi.fn(() => null);
  render(
    <ProductionScriptTranscript
      markdown={
        header + source("media-a") + clip(1, "element-a", 0, 240000) + words
      }
      onChange={vi.fn()}
      onLocate={vi.fn()}
      resolveToken={resolve}
    />,
  );
  expect(screen.queryByText("真实词150")).toBeNull();
  expect(resolve).toHaveBeenCalledTimes(100);
  fireEvent.click(
    screen.getByRole("button", { name: "显示片段 1 的更多词句" }),
  );
  expect(screen.getByText("真实词150")).toBeInTheDocument();
});
it.each([24, 30])(
  "帧率说明%s不参与协议运算，非帧格点的120000ticks仍原样定位与修改",
  (fps) => {
    const md =
        `<!-- 原设置fps=${fps} -->\n` +
        header +
        "[gap 17t]\n" +
        source("media-a") +
        clip(1, "element-a", 12347, 13348),
      locate = vi.fn(),
      change = vi.fn();
    render(
      <ProductionScriptTranscript
        markdown={md}
        onChange={change}
        onLocate={locate}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "定位片段 1" }));
    expect(locate).toHaveBeenCalledWith({
      elementId: "element-a",
      sourceTick: 12347,
      nativeTick: 17,
    });
    fireEvent.click(screen.getByRole("button", { name: "删除片段 1" }));
    expect(change.mock.calls[0][0]).toContain(`<!-- 原设置fps=${fps} -->`);
    expect(change.mock.calls[0][0]).toContain("source=12347..13348t");
    expect(change.mock.calls[0][0]).toContain("[gap 17t]");
  },
);
