import 'server-only';

interface ProjectReader<Project> {
  getProject(input:{params:{projectId:string};query:undefined;body:undefined}):Promise<Project>;
  listProjects(input:{params:undefined;query:{page:number;pageSize:number};body:undefined}):Promise<unknown>;
}

/** 明确ID先走原归属端口；只有旧标题链接需要列表兼容，列表不能替代详情验证。 */
export async function resolveProjectRoute<Project extends {id:string;title:string}>(param:string,client:ProjectReader<Project>):Promise<Project> {
  try {return await client.getProject({params:{projectId:param},query:undefined,body:undefined});}
  catch(originalError){
    const slug=param.toLowerCase(),seen=new Set<string>();
    for(let page=1;;page++){
      let rows:readonly {id:string;title:string}[];
      try {rows=await client.listProjects({params:undefined,query:{page,pageSize:100},body:undefined}) as typeof rows;}
      catch {throw originalError;}
      const candidate=rows.find(project=>project.id===param||slugifyTitle(project.title)===slug);
      if(candidate)return client.getProject({params:{projectId:candidate.id},query:undefined,body:undefined});
      const fresh=rows.some(project=>!seen.has(project.id));rows.forEach(project=>seen.add(project.id));
      if(rows.length<100||!fresh)throw originalError;
    }
  }
}

// SEMANTIC_BOUNDARY_ALLOW: 仅兼容既有URL标题slug，不判断内容或账号归属。
function slugifyTitle(title:string):string {
  return title.replace(/[^\x20-\x7E]/g,' ').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}
