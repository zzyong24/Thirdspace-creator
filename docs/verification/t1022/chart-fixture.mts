/** 隔离界面验收数据；不代表外部平台采集或发布成功。只允许本任务 /tmp 测试库。 */
import {createDb} from '../../../backend/src/db';
const dataDir='/tmp/creatoros-t1022-runtime/db';
const opened=await createDb({dataDir});
try{
 const result=await opened.client.query<{id:string;user_id:string}>("SELECT id,user_id FROM account_groups WHERE name=$1",['账号组验收 · 主品牌']);
 if(result.rows.length!==1)throw Error('临时主组必须唯一');
 const group=result.rows[0]!;
 const projects=await opened.client.query<{id:string}>("SELECT id FROM projects WHERE user_id=$1 AND group_id=$2 AND title=$3",[group.user_id,group.id,'账号组验收 · 多平台内容']);
 if(projects.rows.length!==1)throw Error('必须保留实际UI创建的主项目');
 const projectId=projects.rows[0]!.id;
 const accounts=await opened.client.query<{id:string;platform:string;account_handle:string}>("SELECT a.id,a.platform,a.account_handle FROM platform_accounts a JOIN account_group_memberships m ON m.platform_account_id=a.id AND m.user_id=a.user_id WHERE a.user_id=$1 AND m.group_id=$2 AND m.left_at IS NULL ORDER BY a.platform,a.id",[group.user_id,group.id]);
 const end=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()-86400000));
 const dates=Array.from({length:7},(_,i)=>new Date(Date.parse(end+'T02:00:00+08:00')-(6-i)*86400000).toISOString());
 const totals=[[1000,2000,3400,6200,8300,14300,18000],[0,200,600,900,1100,1600,2400],[100,500,1200,2400,3300,4200,7100],[200,400,800,1800,2700,3900,5300],[30,200,350,800,1500,2700,4100],[300,800,1500,2100,4500,6500,12000]];
 const facts=[];
 await opened.client.transaction(async tx=>{
  for(let index=0;index<accounts.rows.length;index++){
   const account=accounts.rows[index]!,values=totals[index%totals.length]!;
   const outputId=`chart-fixture-output-${index}`,pubId=`chart-fixture-publication-${index}`,revId=`chart-fixture-revision-${index}`;
   const title=`同一期内容的${account.platform==='douyin'?'抖音':account.platform==='kuaishou'?'快手':account.platform==='wechatOfficial'?'公众号':account.platform==='wechatVideo'?'视频号':'小红书'}版本`;
   await tx.query("INSERT INTO content_outputs(id,project_id,title,content_type,status,created_at,updated_at) VALUES($1,$2,$3,$4,'active',$5,$5) ON CONFLICT(id) DO NOTHING",[outputId,projectId,title,account.platform==='wechatOfficial'?'article':'video',dates[0]]);
   await tx.query("INSERT INTO publications(id,user_id,group_id,account_id,content_output_id,platform,account_reference,status,current_revision_id,external_id,published_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,'published',$8,$9,$10,$10,$10) ON CONFLICT(id) DO NOTHING",[pubId,group.user_id,group.id,account.id,outputId,account.platform,account.account_handle,revId,`chart-fixture-external-${index}`,dates[0]]);
   await tx.query("INSERT INTO publication_revisions(id,user_id,publication_id,title,description,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING",[revId,group.user_id,pubId,title,'同一内容按平台呈现，保留每个平台的独立数据。',dates[0]]);
   for(let day=0;day<dates.length;day++){
    const raw=account.platform==='wechatOfficial'?{reads:values[day],likes:30+day*2,watching:12+day,shares:day*3,followers:2100}:{views:values[day],likes:30+day*5,comments:day*4,shares:day*3,followers:1200+index*250,finish_rate:37.2,finish_rate_denominator:values[day],finish_rate_definition:'completed_video_views/total_video_views'};
    await tx.query("INSERT INTO metric_snapshots(id,user_id,group_id,account_id,publication_id,captured_at,source,raw_metrics,created_at) VALUES($1,$2,$3,$4,$5,$6,'isolated-ui-chart-fixture',$7,$6) ON CONFLICT(publication_id,source,captured_at) DO NOTHING",[`chart-fixture-snapshot-${index}-${day}`,group.user_id,group.id,account.id,pubId,dates[day],JSON.stringify(raw)]);
   }
   facts.push({accountId:account.id,platform:account.platform,publicationId:pubId,dates:dates.map(d=>d.slice(0,10)),cumulative:values,daily:values.slice(1).map((n,i)=>n-values[i]!)});
  }
 });
 console.log(JSON.stringify({provenance:'仅隔离测试库的界面数据，不是平台真实采集或发布证据',dataDir,groupId:group.id,projectId,endDate:end,facts},null,2));
}finally{await opened.client.close();}
