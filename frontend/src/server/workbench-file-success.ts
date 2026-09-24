import {createHash} from "node:crypto";
import type {NativeFileAction} from "./workbench-native-client";

const FILE_REPLACEMENT_GUIDANCE="files.write/files.edit 的 content 必须是完整文件，不支持分段追加或局部补丁。保留已有内容时，请先分页读回全文并合成完整正文，再以当前 version 作为 expectedVersion。";

/** SEMANTIC_BOUNDARY_ALLOW: 仅说明已确认文件操作的协议语义和字节事实，不判断正文是否完整或应当如何创作。
 * 仅接在 native 新执行成功之后；历史 settled 回执直接回放，不经本投影重新生成。
 */
export function projectFileSuccess(action:NativeFileAction,value:unknown):unknown {
  if(value===null || typeof value!=="object" || Array.isArray(value))return value;
  const metadata=value as Record<string,unknown>;
  if(action.kind==="write"){
    // 与传给 native 的 payload 使用同一份字节，避免写后额外 read/stat 的竞争与失败。
    const bytes=Buffer.from(action.contentBase64,"base64");
    return {...metadata,writeMode:"replace_all",size:bytes.length,hash:createHash("sha256").update(bytes).digest("hex"),
      guidance:`本版本文件完整内容等于本次 content；size/hash 对应本次已确认写入版本。${FILE_REPLACEMENT_GUIDANCE}`};
  }
  if(action.kind==="read" || action.kind==="stat")return {...metadata,guidance:FILE_REPLACEMENT_GUIDANCE};
  return value;
}
