/** T-839：读取真实渲染任务记录和只读数据库快照，用当前模板重建同一条 157 秒时间线。 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { videoRenderProps, type VideoRenderProps } from "@creatoros/contract";
import { generateVideoRenderHtml } from "../src/modules/execution/video-render/template";

const [taskRecordFile, databasePath, mediaRoot, outputHtml, talkingHeadPreview] = process.argv.slice(2);
if (!taskRecordFile || !databasePath || !mediaRoot || !outputHtml) {
  throw new Error(
    "用法: tsx t839-real-timeline-preview.ts <task-record.json> <pglite-db> <media-root> <output.html>",
  );
}

type TaskRecord = {
  task?: Array<{
    input_data?: {
      spec?: { params?: { props?: unknown } };
    };
  }>;
};

const record = JSON.parse(readFileSync(resolve(taskRecordFile), "utf8")) as TaskRecord;
const rawProps = record.task?.[0]?.input_data?.spec?.params?.props;
const props = videoRenderProps.parse(rawProps);
const assetIds = [props.talkingHead.file, ...props.broll.map((item) => item.file)];

const db = new PGlite(resolve(databasePath));
const result = await db.query<{ id: string; storage_key: string; mime_type: string }>(
  `select a.id, f.storage_key, f.mime_type
     from assets a
     join asset_files f on f.id = a.current_file_id
    where a.id = any($1)`,
  [assetIds],
);
await db.close();

const files = new Map(
  result.rows.map((row) => {
    const localFile = resolve(mediaRoot, row.storage_key);
    if (!existsSync(localFile)) throw new Error(`真实素材不存在: ${row.id}`);
    return [row.id, { url: pathToFileURL(localFile).href, mimeType: row.mime_type }];
  }),
);
for (const assetId of assetIds) {
  if (!files.has(assetId)) throw new Error(`数据库快照缺少真实素材: ${assetId}`);
}

const mappedProps: VideoRenderProps = {
  ...props,
  talkingHead: {
    ...props.talkingHead,
    file: talkingHeadPreview
      ? pathToFileURL(resolve(talkingHeadPreview)).href
      : files.get(props.talkingHead.file)!.url,
  },
  broll: props.broll.map((item) => ({
    ...item,
    file: files.get(item.file)!.url,
  })),
};
const imageFiles = new Set(
  result.rows
    .filter((row) => row.mime_type.startsWith("image/"))
    .map((row) => files.get(row.id)!.url),
);

writeFileSync(
  resolve(outputHtml),
  generateVideoRenderHtml(mappedProps, {
    gsapSrc: new URL("../node_modules/gsap/dist/gsap.min.js", import.meta.url).href,
    mediaPrefix: "",
    imageFiles,
  }),
  "utf8",
);

console.log(resolve(outputHtml));
