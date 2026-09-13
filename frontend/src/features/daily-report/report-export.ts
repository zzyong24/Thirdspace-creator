import {totals,displayNumber,metricValue,type DailyReport} from "./report-metrics";
import {PURCHASE_QR,PURCHASE_URL} from "./purchase-qr";
/** 输出当前页真实快照，不抓取网络图片，也不依赖预览服务。 */
export async function exportDailyReport(report:DailyReport){
 await document.fonts.ready;
 const rows=report.works.slice(0,12),height=880+rows.length*114;
 const canvas=document.createElement("canvas");canvas.width=1440;canvas.height=height*2;
 const context=canvas.getContext("2d");if(!context)throw new Error("当前环境无法生成图片");const c=context;c.scale(2,2);
 c.fillStyle="#f8f9fc";c.fillRect(0,0,720,height);
 function text(value:string,x:number,y:number,size=22,color="#20222e"){c.fillStyle=color;c.font=`${size}px sans-serif`;c.fillText(value,x,y);}
 function fit(value:string,max=630){while(c.measureText(value).width>max&&value.length>1)value=value.slice(0,-2)+"…";return value;}
 text("CreatorOS · 运营日报",40,60,24,"#7953ff");text(report.date,40,118,42);
 text(fit(`${report.accountName?report.accountName+" · ":""}发布 ${report.works.length} 条作品`),40,164,24);text("作品累计表现 · 北京时间",40,198,18,"#667085");
 totals(report).forEach((m,i)=>{const x=40+(i%3)*220,y=268+Math.floor(i/3)*106;text(m.label,x,y,18,"#667085");text(displayNumber(m.value),x,y+40,32);text(`${m.coverage}/${report.works.length} 条有数据`,x,y+65,14,"#667085");});
 text("作品表现",40,490,28);
 rows.forEach((w,i)=>{const y=542+i*114;c.font="22px sans-serif";text(fit(w.title),40,y);text(`播放 ${displayNumber(metricValue(w.metrics,["views","plays"]))}  ·  点赞 ${displayNumber(metricValue(w.metrics,["likes","digg"]))}`,40,y+38,20,"#667085");});
 const bottom=height-230;text(rows.length<report.works.length?`展示前 ${rows.length} 条作品，完整数据请查看日报。`:"让每一条内容，都有下一步。",40,bottom,21);
 text("CreatorOS 编导 / 运营智能体",40,bottom+49,21);text("扫码了解产品",40,bottom+85,18,"#667085");text(PURCHASE_URL,40,bottom+119,17,"#667085");
 const scale=4,left=535,top=bottom+15;c.fillStyle="#fff";c.fillRect(left-16,top-16,148,148);c.fillStyle="#7953ff";for(const [x,y]of PURCHASE_QR)c.fillRect(left+x*scale,top+y*scale,scale,scale);
 text(`数据读取于 ${new Date(report.generatedAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})}`,40,height-28,16,"#667085");
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("图片生成失败")),"image/png"));
 const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`CreatorOS-运营日报-${report.date}.png`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
