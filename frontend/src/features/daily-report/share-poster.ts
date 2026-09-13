import {QrCode,Ecc} from '@rc-component/qrcode/lib/libs/qrcodegen';
import {buildShareModel} from './share-model';
import {displayNumber,beijingTime,type DailyReport} from './report-metrics';
import {PURCHASE_URL} from './purchase-qr';
export const WORKS_PER_POSTER=24;
const GROUP_SIZE=12;
const ink='#191b2a',muted='#737c93',purple='#7653ff',green='#169b70';
// SEMANTIC_BOUNDARY_ALLOW: 按作品数分页与双轴缩放，仅展示真实数值，不推断内容表现。
export function posterCount(report:DailyReport){return Math.max(1,Math.ceil(report.works.length/WORKS_PER_POSTER));}
export function chartMaximum(values:Array<number|null>){const max=Math.max(0,...values.filter((x):x is number=>x!==null));return max>0?Math.ceil(max/(10**Math.floor(Math.log10(max))))*(10**Math.floor(Math.log10(max))):1;}
export async function drawSharePoster(report:DailyReport,page=0){
 await document.fonts.ready;
 const model=buildShareModel(report),works=model.highlights.slice(page*WORKS_PER_POSTER,(page+1)*WORKS_PER_POSTER);
 if(page<0||page>=posterCount(report))throw Error('战报页码无效');
 const groups=Array.from({length:Math.ceil(works.length/GROUP_SIZE)},(_,i)=>works.slice(i*GROUP_SIZE,(i+1)*GROUP_SIZE));
 const groupHeight=(size:number)=>370+Math.ceil(size/2)*65;
 const height=600+groups.reduce((n,g)=>n+groupHeight(g.length)+24,0)+(groups.length?0:110)+204;
 const canvas=document.createElement('canvas');canvas.width=2160;canvas.height=height*3;
 const c=canvas.getContext('2d');if(!c)throw Error('当前环境无法生成战报');c.scale(3,3);
 const rect=(x:number,y:number,w:number,h:number,color:string,r=0)=>{c.fillStyle=color;if(r){c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}else c.fillRect(x,y,w,h);};
 const text=(s:string,x:number,y:number,size=16,color=ink,weight=400)=>{c.fillStyle=color;c.font=`${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;c.fillText(s,x,y);};
 const lines=(s:string,x:number,y:number,w:number,size=16,lineHeight=25,limit=2,color=ink,weight=400)=>{c.font=`${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;const rows:string[]=[];let line='';for(const ch of s){if(ch==='\n'||c.measureText(line+ch).width>w){rows.push(line);line=ch==='\n'?'':ch;}else line+=ch;}if(line)rows.push(line);rows.slice(0,limit).forEach((row,i)=>text(row+(i===limit-1&&rows.length>limit?'…':''),x,y+i*lineHeight,size,color,weight));};
 const stroke=(x1:number,y1:number,x2:number,y2:number,color:string,width=1)=>{c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.strokeStyle=color;c.lineWidth=width;c.stroke();};
 const qr=(url:string,x:number,y:number,target:number)=>{const q=QrCode.encodeText(url,Ecc.MEDIUM),cell=Math.floor(target/(q.size+8)),size=(q.size+8)*cell;rect(x,y,size,size,'#ffffff',6);for(let row=0;row<q.size;row++)for(let col=0;col<q.size;col++)if(q.getModule(col,row))rect(x+(col+4)*cell,y+(row+4)*cell,cell,cell,ink);return size;};
 rect(0,0,720,height,'#f7f6ff');
 const glow=c.createLinearGradient(0,0,720,490);glow.addColorStop(0,'#ebe7ff');glow.addColorStop(0.7,'#faf9ff');glow.addColorStop(1,'#efedff');c.fillStyle=glow;c.fillRect(0,0,720,490);
 text('✦',38,63,30,purple,700);text('CreatorOS',78,61,23,ink,650);text('我的创作成绩',221,61,15,muted);
 lines(model.accountName,40,135,470,37,44,2,ink,700);
 if(model.positioningOneLiner)lines(model.positioningOneLiner,40,217,470,17,26,2,muted);
 text(model.period.replaceAll('-','.'),40,281,16,muted);
 if(model.profileUrl){const size=qr(model.profileUrl,556,84,132);text('扫码关注我的抖音',556,84+size+21,13,muted);}
 text('作品累计播放',40,337,20,ink,600);
 const total=model.views.value;const totalText=total!==null&&total>=10000?`${(total/10000).toFixed(2)}万`:displayNumber(total);
 text(totalText,36,426,76,purple,750);
 if(model.views.coverage<model.count)text(`已有 ${model.views.coverage}/${model.count} 条作品的播放数据`,42,457,14,muted);
 const stats=[['发布作品',displayNumber(model.count),ink],['作品带来关注',displayNumber(model.followers.value),green],['累计互动',displayNumber(model.interactions.value),ink]];
 stats.forEach(([label,value,color],i)=>{const x=42+i*222;text(value!,x,524,35,color,700);text(label!,x,555,16,muted);if(i<2)stroke(x+194,493,x+194,558,'#dfdcef');});
 let y=590;
 const maxViews=chartMaximum(model.highlights.map(w=>w.views)),maxFollows=chartMaximum(model.highlights.map(w=>w.followers));
 for(const [groupIndex,group]of groups.entries()){
  const h=groupHeight(group.length);rect(24,y,672,h,'#ffffff',18);
  text('每条作品的成绩',45,y+40,23,ink,650);
  text('播放量与带来关注 · 按累计播放排列',45,y+68,14,muted);
  rect(45,y+92,9,9,purple,3);text('播放量（左轴）',62,y+101,13,muted);rect(210,y+92,9,9,green,3);text('带来关注（右轴）',227,y+101,13,muted);
  const left=85,top=y+150,w=536,hChart=180,step=w/group.length;
  text('次',45,top-17,12,muted);text('人',657,top-17,12,muted);
  for(let tick=0;tick<=3;tick++){const lineY=top+hChart*(1-tick/3);stroke(left,lineY,left+w,lineY,'#ebeef5');const label=maxViews*tick/3;text(label>=10000?`${(label/10000).toFixed(1)}万`:Math.round(label).toLocaleString('zh-CN'),39,lineY+4,11,muted);text((maxFollows*tick/3).toFixed(maxFollows<3?1:0),635,lineY+4,11,muted);}
  let previous:{x:number;y:number}|null=null;
  for(const [i,work]of group.entries()){
   const x=left+step*(i+0.5),barW=Math.min(36,step*0.6),index=page*WORKS_PER_POSTER+groupIndex*GROUP_SIZE+i;
   if(work.views!==null){const barH=work.views/maxViews*hChart;rect(x-barW/2,top+hChart-barH,barW,Math.max(1,barH),purple,3);text(work.views.toLocaleString('zh-CN'),x-barW/2,top+hChart-barH-9,10,ink);}else text('暂无',x-11,top+hChart-8,10,muted);
   text(String(index+1).padStart(2,'0'),x-8,top+hChart+23,12,muted);
   if(work.followers!==null){const point={x,y:top+hChart-work.followers/maxFollows*hChart};if(previous)stroke(previous.x,previous.y,point.x,point.y,green,2.5);c.beginPath();c.arc(point.x,point.y,3.5,0,Math.PI*2);c.fillStyle=green;c.fill();previous=point;}else previous=null;
  }
  group.forEach((work,i)=>{const index=page*WORKS_PER_POSTER+groupIndex*GROUP_SIZE+i,x=45+(i%2)*324,rowY=top+hChart+59+Math.floor(i/2)*65;text(String(index+1).padStart(2,'0'),x,rowY,12,purple,600);lines(work.title,x+30,rowY,272,12,18,2,ink);text(`带来关注 ${displayNumber(work.followers)}`,x+30,rowY+37,11,muted);});
  y+=h+24;
 }
 if(!groups.length){text('这个时间段还没有发布作品',42,y+45,22,muted);y+=110;}
 text('所选期间发布作品的累计表现 · 北京时间',40,y+8,13,muted);
 text(`数据读取于 ${beijingTime(model.generatedAt)}${posterCount(report)>1?` · 第 ${page+1}/${posterCount(report)} 张`:''}`,40,y+31,13,muted);
 text(`关注数据 ${model.followers.coverage}/${model.count} 条 · 互动指标 ${model.interactions.coverage}/${model.interactions.expected} 项；仅汇总已采集数据`,40,y+55,12,muted);
 stroke(40,y+80,680,y+80,'#dfdcef');text('✦ CreatorOS',40,y+127,24,purple,650);text('CreatorOS · AI 创作工作台',40,y+159,15,muted);
 const purchaseSize=qr(PURCHASE_URL,536,y+93,96);text('了解创作工具',536,y+93+purchaseSize+15,12,muted);
 text(PURCHASE_URL,40,y+184,12,muted);
 return canvas;
}
