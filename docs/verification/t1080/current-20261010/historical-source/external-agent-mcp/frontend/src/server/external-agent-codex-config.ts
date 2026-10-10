import "server-only";
import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run=promisify(execFile);
const name=(id:string)=>{if(!/^pair-[a-z0-9-]{36}$/.test(id))throw Error("INVALID_CONNECTION_ID");return `creatoros-${id}`;};
function launcher():string {
  if(platform()==="win32"){
    if(!process.env.LOCALAPPDATA)throw Error("CLI_COMMAND_UNAVAILABLE");
    return join(process.env.LOCALAPPDATA,"CreatorOS","bin","creatoros.cmd");
  }
  return join(homedir(),".local","bin","creatoros");
}

/** 官方 Codex CLI 自己修改其 MCP 配置；只增删当前连接命名条目，不解析或重写其它 TOML。 */
export async function installCodexConnection(id:string):Promise<void>{
  const command=launcher();await access(command).catch(()=>{throw Error("CLI_COMMAND_UNAVAILABLE");});
  await run("codex",["mcp","add",name(id),"--",command,"mcp","serve","--paired",id],{timeout:20000});
}
export async function removeCodexConnection(id:string):Promise<void>{
  await run("codex",["mcp","remove",name(id)],{timeout:20000});
}
