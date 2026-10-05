// SEMANTIC_BOUNDARY_ALLOW: 仅把用户十进制秒数转换为整数微秒，不推断语义、时间码或素材选择。
export function parseProductionSeconds(value:string):number {
 const match=/^(?:(\d+)(?:\.(\d{0,6}))?|\.(\d{1,6}))$/.exec(value.trim());
 if(!match)throw Error("时间请使用最多六位小数的秒数");
 const ticks=BigInt(match[1]??"0")*BigInt(1000000)+BigInt((match[2]??match[3]??"").padEnd(6,"0"));
 if(ticks>BigInt(Number.MAX_SAFE_INTEGER))throw Error("时间超出可保存范围");
 return Number(ticks);
}
export function formatProductionSeconds(us:number):string {const ticks=BigInt(us),fraction=String(ticks%BigInt(1000000)).padStart(6,"0").replace(/0+$/,"");return `${ticks/BigInt(1000000)}${fraction?`.${fraction}`:""}`;}
