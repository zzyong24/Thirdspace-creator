import "server-only";
import path from "node:path";
/** 只读预览标记，不能改变授权或数据读写规则。正式应用始终返回 false。 */
export function isIsolatedUiPreview(env:Readonly<Record<string,string|undefined>>=process.env):boolean {
 const data=env.CREATOROS_APP_DATA_DIR;
 return env.NODE_ENV==="development" && env.CREATOROS_DEV_MODE==="1" && env.CREATOROS_UI_PREVIEW==="1" && env.CREATOROS_DISABLE_SCHEDULER==="1" && Boolean(data) && path.basename(data!)==="preview-data" && path.basename(path.dirname(data!))==="work" && env.PGLITE_DATA_DIR===path.join(data!,"db");
}

export function hasPreviewSamples(groupId:string|null|undefined):boolean { return isIsolatedUiPreview() && groupId==="grp-d7efbb04-36"; }
