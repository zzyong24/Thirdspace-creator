import type {ProjectScriptContext} from "@creatoros/contract";
/** 仅落实已确认来源的填空操作；不选择、生成或改写内容。调用方只在首次载入使用。 */
export function fillScriptMetadata<T extends {title:string;summary:string;tags?:string[]}>(document:T,context:ProjectScriptContext|undefined):T {
 if(!context||context.state==="unavailable")return document;
 const patch:Partial<T>={};
 if(!document.title.trim()&&context.metadata.title.trim())Object.assign(patch,{title:context.metadata.title});
 if(!document.summary.trim()&&context.metadata.summary.trim())Object.assign(patch,{summary:context.metadata.summary});
 if(!document.tags?.length&&context.metadata.tags.length)Object.assign(patch,{tags:[...context.metadata.tags]});
 if(!Object.keys(patch).length)return document;
 return {...document,...patch,...(context.metadataSource?{metadataSource:context.metadataSource}:{})};
}
