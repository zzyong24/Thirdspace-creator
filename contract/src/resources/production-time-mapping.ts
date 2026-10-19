import {productionMainTrack,type ProductionMainTrack} from "./production-main-track";
// SEMANTIC_BOUNDARY_ALLOW: 精确有理数时间映射只落实用户指定的顺序和源范围，不做删留判断。
function gcd(a:bigint,b:bigint):bigint {while(b){const t=a%b;a=b;b=t;}return a;}
function roundUs(n:bigint,d:bigint):number {
 const value=(n*BigInt(1000000)+d/BigInt(2))/d;
 if(value>BigInt(Number.MAX_SAFE_INTEGER))throw new Error("主轨累计时长超出安全范围");
 return Number(value);
}
export function mapProductionMainTrack(input:ProductionMainTrack) {
 const track=productionMainTrack.parse(input),sources=new Map(track.sources.map(s=>[s.sourceId,s]));
 let n=BigInt(0),d=BigInt(1);
 return track.clips.map(clip=>{
  const source=sources.get(clip.sourceId)!,startUs=roundUs(n,d);
  const deltaN=BigInt(clip.sourceOutTicks-clip.sourceInTicks)*BigInt(source.timebase.num),deltaD=BigInt(source.timebase.den);
  n=n*deltaD+deltaN*d;d*=deltaD;const g=gcd(n,d);n/=g;d/=g;
  const endUs=roundUs(n,d);
  if(endUs<=startUs)throw new Error("片段小于输出时间精度，请调整范围；原稿已保留");
  return {...clip,assetId:source.assetId,assetFileId:source.assetFileId,fileDigest:source.fileDigest,probeDigest:source.probeDigest,startUs,endUs};
 });
}

