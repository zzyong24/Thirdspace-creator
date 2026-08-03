import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("./", import.meta.url);
const html = await readFile(new URL("./index.html", root), "utf8");

const localAssets = [
  ...html.matchAll(/(?:src|href)=["']([^"']+\.(?:png|jpe?g|webp|svg|ico))["']/gi),
]
  .map((match) => match[1])
  .filter((path) => !/^https?:\/\//i.test(path))
  .map((path) => path.replace(/^\//, ""));

test("官网引用的图片资源都真实存在且不是空文件", async () => {
  assert.ok(localAssets.length > 0, "官网至少应引用一张图片");
  for (const path of new Set(localAssets)) {
    const info = await stat(new URL(path, root));
    assert.ok(info.isFile(), `${path} 不是文件`);
    assert.ok(info.size > 128, `${path} 是空文件或异常占位文件`);
  }
});

test("官网图片扩展名与实际文件格式一致", async () => {
  for (const path of new Set(localAssets)) {
    const bytes = await readFile(new URL(path, root));
    const extension = path.split(".").pop().toLowerCase();
    const isPng = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isWebp = bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
    const isSvg = bytes.subarray(0, 512).toString("utf8").includes("<svg");

    const matches =
      extension === "png" ? isPng
        : ["jpg", "jpeg"].includes(extension) ? isJpeg
          : extension === "webp" ? isWebp
            : extension === "svg" ? isSvg
              : true;
    assert.ok(matches, `${path} 的扩展名与真实文件格式不一致`);
  }
});

test("官网正文不依赖滚动动画才能看见", () => {
  assert.doesNotMatch(
    html,
    /\.rv\s*\{[^}]*opacity\s*:\s*0/i,
    "正文默认隐藏会导致长页截图、深链接或脚本异常时出现整页空白",
  );
});
