import {QrCode,Ecc} from '@rc-component/qrcode/lib/libs/qrcodegen';
import {buildShareModel} from './share-model';
import {displayNumber,beijingTime,type DailyReport} from './report-metrics';
import {PURCHASE_URL} from './purchase-qr';
export const WORKS_PER_POSTER=24;
const GROUP_SIZE=12;
const ink='#171a25',muted='#667085',purple='#6d4aff',green='#169b70';
// SEMANTIC_BOUNDARY_ALLOW: 只按真实作品数分页并计算共同零起点坐标，播放与阅读各用自己的轴。
export function posterCount(report:DailyReport){return Math.max(1,Math.ceil(report.works.length/WORKS_PER_POSTER));}
export function chartMaximum(values:Array<number|null>){const max=Math.max(0,...values.filter((x):x is number=>x!==null));return max>0?Math.ceil(max/(10**Math.floor(Math.log10(max))))*(10**Math.floor(Math.log10(max))):1;}
export async function drawSharePoster(report:DailyReport,page=0){
 await document.fonts.ready;
 const model=buildShareModel(report),works=model.highlights.slice(page*WORKS_PER_POSTER,(page+1)*WORKS_PER_POSTER);
 if(page<0||page>=posterCount(report))throw Error('战报页码无效');
 const groups=(['views','reads'] as const).flatMap(metric=>{const rows=works.filter(w=>w.metric===metric);return Array.from({length:Math.ceil(rows.length/GROUP_SIZE)},(_,i)=>({metric,rows:rows.slice(i*GROUP_SIZE,(i+1)*GROUP_SIZE)}));});
 const groupHeight=(size:number)=>370+Math.ceil(size/2)*80;
 const height=600+groups.reduce((n,g)=>n+groupHeight(g.rows.length)+24,0)+(groups.length?0:110)+204;
 const canvas=document.createElement('canvas');canvas.width=2160;canvas.height=height*3;
 const c=canvas.getContext('2d');if(!c)throw Error('当前环境无法生成战报');c.scale(3,3);
 const rect=(x:number,y:number,w:number,h:number,color:string,r=0)=>{c.fillStyle=color;if(r){c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}else c.fillRect(x,y,w,h);};
 const text=(s:string,x:number,y:number,size=16,color=ink,weight=400)=>{c.fillStyle=color;c.font=`${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;c.fillText(s,x,y);};
 const lines=(s:string,x:number,y:number,w:number,size=16,lineHeight=25,limit=2,color=ink,weight=400)=>{c.font=`${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;const rows:string[]=[];let line='';for(const ch of s){if(ch==='\n'||c.measureText(line+ch).width>w){rows.push(line);line=ch==='\n'?'':ch;}else line+=ch;}if(line)rows.push(line);rows.slice(0,limit).forEach((row,i)=>text(row+(i===limit-1&&rows.length>limit?'…':''),x,y+i*lineHeight,size,color,weight));};
 const stroke=(x1:number,y1:number,x2:number,y2:number,color:string,width=1)=>{c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.strokeStyle=color;c.lineWidth=width;c.stroke();};
 const qr=(url:string,x:number,y:number,target:number)=>{const q=QrCode.encodeText(url,Ecc.MEDIUM),cell=Math.floor(target/(q.size+8)),size=(q.size+8)*cell;rect(x,y,size,size,'#ffffff',6);for(let row=0;row<q.size;row++)for(let col=0;col<q.size;col++)if(q.getModule(col,row))rect(x+(col+4)*cell,y+(row+4)*cell,cell,cell,ink);return size;};
 rect(0,0,720,height,'#f8f9fc');text('✦',38,63,30,purple,700);text('CreatorOS',78,61,23,ink,650);text('我的创作成绩',221,61,15,muted);
 lines(model.accountName,40,135,470,37,44,2,ink,700);
 if(model.positioningOneLiner)lines(model.positioningOneLiner,40,217,470,17,26,2,muted);
 text(model.period.replaceAll('-','.'),40,281,16,muted);
 if(model.profileUrl){const size=qr(model.profileUrl,556,84,132);text(model.profilePlatform?`扫码关注我的${model.profilePlatform}`:'扫码查看创作主页',556,84+size+21,13,muted);}
 const compact=(value:number|null)=>value===null?'—':value>=10000?`${(value/10000).toFixed(2)}万`:value.toLocaleString('zh-CN');
 for(const [i,metric]of (['views','reads'] as const).entries()){const x=40+i*340,aggregate=model[metric];text(metric==='views'?'视频累计播放（次）':'文章累计阅读（次）',x,337,18,ink,600);text(compact(aggregate.value),x,415,54,purple,750);text(`已有 ${aggregate.coverage}/${aggregate.expected} 条${metric==='views'?'视频':'文章'}数据`,x,456,14,muted);}
 const stats=[['发布作品',displayNumber(model.count),ink],['作品带来关注',displayNumber(model.followers.value),green],['累计互动',displayNumber(model.interactions.value),ink]];
 stats.forEach(([label,value,color],i)=>{const x=42+i*222;text(value!,x,524,35,color,700);text(label!,x,555,16,muted);if(i<2)stroke(x+194,493,x+194,558,'#e4e7ec');});
 let y=590,index=page*WORKS_PER_POSTER;
 for(const {metric,rows:group}of groups){
  const h=groupHeight(group.length),title=metric==='views'?'视频播放':'文章阅读';rect(24,y,672,h,'#ffffff',16);
  text(`${title} · 作品比较`,45,y+40,23,ink,650);text(`累计值（次） · 按同一指标排列 · 作品编号为横轴`,45,y+70,14,muted);
  const left=90,top=y+142,w=544,hChart=180,step=w/group.length;
  const hasMeasured=group.some(work=>work[metric]!==null),max=Math.max(4,chartMaximum(model.highlights.filter(work=>work.metric===metric).map(work=>work[metric])));
  text('次',45,top-17,12,muted);
  for(let tick=0;tick<=4;tick++){const lineY=top+hChart*(1-tick/4);stroke(left,lineY,left+w,lineY,'#eaecf0');if(hasMeasured)text((max*tick/4).toLocaleString('zh-CN',{maximumFractionDigits:2}),39,lineY+4,12,muted);}
  if(!hasMeasured)text('暂无指标快照，不绘制条形',left+100,top+86,16,muted);
  for(const [i,work]of group.entries()){
   const x=left+step*(i+0.5),barW=Math.min(36,step*0.6),value=work[metric];
   if(value!==null){const barH=value/max*hChart;if(value>0)rect(x-barW/2,top+hChart-barH,barW,barH,purple,3);text(value.toLocaleString('zh-CN'),x-barW/2,top+hChart-barH-9,12,ink);}else text('—',x-6,top+hChart-8,12,muted);
   text(String(index+i+1).padStart(2,'0'),x-8,top+hChart+23,12,muted);
  }
  group.forEach((work,i)=>{const x=45+(i%2)*324,rowY=top+hChart+59+Math.floor(i/2)*80;text(String(index+i+1).padStart(2,'0'),x,rowY,12,purple,600);lines(work.title,x+30,rowY,272,12,18,2,ink);text(`${work.platform?`${work.platform} · `:''}带来关注 ${displayNumber(work.followers)}`,x+30,rowY+37,12,muted);text(work.capturedAt?`指标截至 ${beijingTime(work.capturedAt)}`:"尚未采集指标快照",x+30,rowY+55,12,muted);});
  index+=group.length;y+=h+24;
 }
 if(!groups.length){text('这个时间段还没有发布作品',42,y+45,22,muted);y+=110;}
 text('所选期间发布作品的累计表现 · 北京时间',40,y+8,13,muted);
 text(`数据读取于 ${beijingTime(model.generatedAt)}${posterCount(report)>1?` · 第 ${page+1}/${posterCount(report)} 张`:''}`,40,y+31,13,muted);
 text(`关注数据 ${model.followers.coverage}/${model.count} 条 · 互动指标 ${model.interactions.coverage}/${model.interactions.expected} 项；仅汇总已采集数据`,40,y+55,12,muted);
 stroke(40,y+80,680,y+80,'#e4e7ec');text('✦ CreatorOS',40,y+127,24,purple,650);text('CreatorOS · AI 创作工作台',40,y+159,15,muted);
 const purchaseSize=qr(PURCHASE_URL,536,y+93,96);text('了解创作工具',536,y+93+purchaseSize+15,12,muted);text(PURCHASE_URL,40,y+184,12,muted);
 return canvas;
}
