import * as fs from "node:fs/promises";
import * as nodePath from "node:path";
import {homedir} from "node:os";
import type {RequestContext} from "@creatoros/contract";
import {normalizeLocalPath,sensitivePathReason,isProbablyBinary,MAX_LOCAL_READ_BYTES,MAX_LOCAL_DIR_ENTRIES} from "./local-read-security";
import {searchLocalByBasename,defaultSearchRoots,localBasename,type LocalSearchFs} from "./local-name-search";

export interface LocalReadGrantPorts {
  checkGrant(userId:string,path:string):"dir"|"once"|null;
  consumeOnce(userId:string,path:string):void;
  listAlwaysDirs(userId:string):string[];
}
// 同一宿主进程共享队列，防止并行工具调用重复使用同一份一次授权。
const reads = new Map<string,Promise<void>>();
async function serializeRead<T>(userId:string,path:string,signal:AbortSignal|undefined,run:()=>Promise<T>):Promise<T>{
  const key=JSON.stringify([userId,path]);
  const previous=reads.get(key)??Promise.resolve();
  const work=previous.then(()=>{signal?.throwIfAborted();return run();});
  const current=work.then(()=>undefined,()=>undefined);
  reads.set(key,current);
  void current.then(()=>{if(reads.get(key)===current)reads.delete(key);});
  if(!signal)return work;
  // 调用方立即响应取消；队列占位仍跟随真实 IO 结束，后继不能抢跑。
  let onAbort!:()=>void;
  const cancelled=new Promise<never>((_resolve,reject)=>{
    onAbort=()=>reject(signal.reason);
    signal.addEventListener("abort",onAbort,{once:true});
    if(signal.aborted)onAbort();
  });
  try{return await Promise.race([work,cancelled]);}
  finally{signal.removeEventListener("abort",onAbort);}
}
/** 宿主提供现有授权表；读取与审批判定共用路径边界，不另建授权或持久状态。 */
export function createLocalReadHost(grants:LocalReadGrantPorts, environment:{
  fs?:Pick<typeof fs,"realpath"|"stat"|"readdir"|"readFile">;
  homedir?:()=>string;
}={}){
  const fsp=environment.fs??fs, getHome=environment.homedir??homedir;
  const {checkGrant:checkLocalReadGrant,consumeOnce:consumeLocalReadOnceGrant,listAlwaysDirs:listLocalReadAlwaysDirs}=grants;
  return {
    // [T-253] local.read 端口 —— 编导读本机文件的全链:归一/realpath 穿越防护 → 敏感 denylist
    // 硬拒(授权之上,无论授权与否)→ 授权表(未授权 → needApproval 渲确认卡;授权经
    // /api/v1/local/read-grant 写入)→ 大小 1MB/二进制门 → 文本全文 or 目录清单。
    readLocalFile: async (
      ctx: RequestContext,
      input: { path: string; signal?: AbortSignal },
    ) => {
      ctx={...ctx};input={...input};
      input.signal?.throwIfAborted();
      const home = getHome();
      // [T-262] 文件名搜索兜底:精确路径解析不到(相对无法归一 / realpath miss)→ 提取 basename 在
      // **scoped 目录集**(用户「总是允许该目录」授权过的目录 + 常用目录 Desktop/Documents/ThirdSpace)
      // 按名搜同名文件(scoped 非全盘、守 denylist、限深度/结果数/节点数)。唯一命中 → nameMatch(走既有
      // 授权门读该真实路径);多命中 → nameCandidates(候选选择态);零命中 → null(调用方回落诚实
      // 「不存在」)。目标名本身敏感(passwd/.env/*key*…)→ 不搜(搜到也会被拒),直接回落。
      const nameSearchFallback = async (
        rawPath: string,
      ): Promise<
        | {
            status: "nameMatch";
            requestedName: string;
            path: string;
            size: number | null;
            type: string;
          }
        | {
            status: "nameCandidates";
            requestedName: string;
            items: Array<{ path: string; size: number | null; type: string }>;
            truncated: boolean;
          }
        | null
      > => {
        const wanted = localBasename(rawPath);
        if (!wanted || sensitivePathReason(wanted)) return null;
        const roots = [
          ...listLocalReadAlwaysDirs(ctx.userId),
          ...defaultSearchRoots(home),
        ];
        const searchFs: LocalSearchFs = {
          readdir: async (dir) => {
            input.signal?.throwIfAborted();
            const ds = await fsp.readdir(dir, { withFileTypes: true });
            input.signal?.throwIfAborted();
            return ds.map((d) => ({
              name: d.name,
              isDir: d.isDirectory(),
              isFile: d.isFile(),
              isSymlink: d.isSymbolicLink(),
            }));
          },
          fileSize: async (p) => {
            input.signal?.throwIfAborted();
            try {
              return Number((await fsp.stat(p)).size);
            } catch {
              return null;
            }
          },
        };
        const { items, truncated } = await searchLocalByBasename({
          roots,
          targetName: wanted,
          fs: searchFs,
          isSensitive: (p) => sensitivePathReason(p) != null,
          signal: input.signal,
        });
        if (items.length === 0) return null;
        if (items.length === 1) {
          const h = items[0]!;
          return {
            status: "nameMatch",
            requestedName: wanted,
            path: h.path,
            size: h.size,
            type: h.type,
          };
        }
        return { status: "nameCandidates", requestedName: wanted, items, truncated };
      };
      const normalized = normalizeLocalPath(input.path, home);
      if (!normalized) {
        // [T-262] 相对/无法归一 → 先按名搜兜底(basename 常仍可用,如 `scripts/xxx.md`→`xxx.md`)。
        const fb = await nameSearchFallback(input.path);
        if (fb) return fb;
        return {
          status: "denied" as const,
          path: input.path,
          reason:
            "路径必须是绝对路径(以 / 开头,或 ~ 开头的家目录路径)—— 相对路径无法确定基准;也没在你已授权/常用目录里找到同名文件。请给绝对路径,或直接把内容粘贴进来。",
        };
      }
      // 敏感硬门第一遍:对归一路径检查(realpath 之前就能挡住明着写的敏感路径)。
      const reason1 = sensitivePathReason(normalized);
      if (reason1) {
        return { status: "denied" as const, path: normalized, reason: reason1 };
      }
      // realpath 复检(symlink 防绕:软链把 ~/.ssh/id_rsa 伪装成 note.txt 也会被第二遍抓住)。
      let real: string;
      try {
        real = await fsp.realpath(normalized);
        input.signal?.throwIfAborted();
      } catch {
        input.signal?.throwIfAborted();
        // [T-262] 绝对路径不存在 → 按名搜兜底(唯一 nameMatch / 多命中 nameCandidates);零命中才诚实抛。
        const fb = await nameSearchFallback(normalized);
        if (fb) return fb;
        throw new Error(
          `路径不存在或不可访问:${normalized}(也没在你已授权/常用目录里找到同名文件「${localBasename(normalized)}」)`,
        );
      }
      const reason2 = sensitivePathReason(real);
      if (reason2) {
        return { status: "denied" as const, path: real, reason: reason2 };
      }
      return serializeRead(ctx.userId,real,input.signal,async()=>{
        const st = await fsp.stat(real);
        input.signal?.throwIfAborted();
        const isDir = st.isDirectory();
        // 授权表:未授权 → needApproval(前端渲「允许一次/总是允许该目录/拒绝」确认卡)。
        const grant = checkLocalReadGrant(ctx.userId, real);
        if (!grant) {
          return {
            status: "needApproval" as const,
            path: real,
            size: isDir ? null : Number(st.size),
            type: isDir
              ? "directory"
              : nodePath.extname(real).replace(/^\./, "") || "file",
          };
        }
        if (isDir) {
          // 目录 listing:名字 + 类型 + 大小(上限 MAX_LOCAL_DIR_ENTRIES 条,防超大目录炸上下文)。
          const dirents = await fsp.readdir(real, { withFileTypes: true });
          input.signal?.throwIfAborted();
          const entries: Array<{
            name: string;
            kind: "file" | "dir";
            size: number | null;
          }> = [];
          for (const d of dirents.slice(0, MAX_LOCAL_DIR_ENTRIES)) {
            input.signal?.throwIfAborted();
            let size: number | null = null;
            if (d.isFile()) {
              try {
                size = Number((await fsp.stat(nodePath.join(real, d.name))).size);
              } catch {
                size = null;
              }
            }
            entries.push({
              name: d.name,
              kind: d.isDirectory() ? "dir" : "file",
              size,
            });
          }
          input.signal?.throwIfAborted();
          if (grant === "once") consumeLocalReadOnceGrant(ctx.userId, real);
          return {
            status: "dir" as const,
            path: real,
            entries,
            total: dirents.length,
          };
        }
        // 文件:大小上限(1MB 文本)→ 二进制探测 → utf8 解码全文(窗口截断在工具 execute 侧)。
        if (Number(st.size) > MAX_LOCAL_READ_BYTES) {
          return {
            status: "denied" as const,
            path: real,
            reason: `文件 ${(Number(st.size) / 1024 / 1024).toFixed(1)}MB,超过本地读取上限 1MB —— 请裁剪后再读,或直接把它上传到素材库(素材上传支持到 20MB)。`,
          };
        }
        const bytes = await fsp.readFile(real, {signal: input.signal});
        input.signal?.throwIfAborted();
        if (isProbablyBinary(new Uint8Array(bytes))) {
          return {
            status: "denied" as const,
            path: real,
            reason:
              "这是二进制文件(非文本),对话内读取只支持文本 —— 建议直接把它上传到素材库(图/视频/文档走既有上传链)。",
          };
        }
        input.signal?.throwIfAborted();
        if (grant === "once") consumeLocalReadOnceGrant(ctx.userId, real);
        return {
          status: "file" as const,
          path: real,
          name: nodePath.basename(real),
          fullText: bytes.toString("utf8"),
        };
      });
    },
    // [T-263] local.read 授权**判定**(HITL 门用)—— 与 readLocalFile 的「执行读取」拆开:只跑
    // 「归一/realpath 穿越防护 → 敏感 denylist → 授权表查询」,**不读文件内容、不消费一次授权**
    // (真读时 readLocalFile 会再查一遍授权表并消费)。三态:
    //   denied      = 归一失败 / 敏感硬门(无论授权与否);
    //   needApproval = 路径已解析但未授权 → HITL 门返 'user-approval' 挂起弹卡;
    //   granted     = 已授权(免卡)**或路径尚无法解析**(realpath 失败等)→ 放行,让 readLocalFile
    //                 执行时按四态权威处理(不存在 → 它抛错转 error;不弹一张读不到的授权卡)。
    decideLocalReadAccess: async (
      ctx: RequestContext,
      input: { path: string },
    ) => {
      ctx={...ctx};input={...input};
      const normalized = normalizeLocalPath(input.path, getHome());
      if (!normalized) {
        // [T-262] 相对/无法归一的路径:不在判定期硬拒 —— 放行让 readLocalFile 执行时做文件名搜索兜底
        // (提取 basename 在授权/常用目录搜同名,搜到 → needApproval/候选卡;零命中 → 诚实回落)。
        // 安全不松:搜索 scoped 非全盘 + denylist 硬拒 + 搜到的路径读取仍走本授权门(真读时复检授权表)。
        return { status: "granted" as const };
      }
      const reason1 = sensitivePathReason(normalized);
      if (reason1) return { status: "denied" as const, reason: reason1 };
      // realpath 失败(不存在/不可访问)→ 不在判定期弹卡:交给 readLocalFile 执行时如实抛「不存在」。
      let real: string;
      try {
        real = await fsp.realpath(normalized);
      } catch {
        return { status: "granted" as const };
      }
      const reason2 = sensitivePathReason(real);
      if (reason2) return { status: "denied" as const, reason: reason2 };
      // 授权表:命中(once/dir)→ granted(免卡);未命中 → needApproval(HITL 挂起弹卡)。
      const grant = checkLocalReadGrant(ctx.userId, real);
      return grant
        ? { status: "granted" as const }
        : { status: "needApproval" as const };
    },
  };
}
