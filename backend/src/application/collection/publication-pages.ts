/** 全页枚举真实作品；不按条数上限截断，不做内容排序判断。 */
export async function readAllPublicationPages<T>(read:(page:{limit:number;offset:number})=>Promise<T[]>):Promise<T[]>{
 const all:T[]=[];for(let offset=0;;offset+=200){const page=await read({limit:200,offset});all.push(...page);if(page.length<200)return all;}
}
