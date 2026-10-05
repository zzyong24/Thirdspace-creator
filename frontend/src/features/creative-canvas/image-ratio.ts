/** SEMANTIC_BOUNDARY_ALLOW: 只比较用户明确比例与已解码图片的像素几何，不选择创作风格。允许约1像素取整差异。 */
export function imageRatioStatus(width:number,height:number,requestedRatio?:string){
 const parts=requestedRatio?.split(":").map(Number);const valid=parts?.length===2&&parts.every(n=>Number.isFinite(n)&&n>0);
 const gcd=(a:number,b:number):number=>b?gcd(b,a%b):a;
 const divisor=gcd(width,height)||1;
 return {actualRatio:`${width/divisor}:${height/divisor}`,matched:valid?Math.abs(width*parts![1]!-height*parts![0]!)<=Math.max(...parts!):null};
}
