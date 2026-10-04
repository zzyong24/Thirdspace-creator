import {imageSize} from "image-size";

export type AssetGenerationMode="text_to_image"|"image_to_image"|"text_to_video"|"image_to_video";
export type AssetModelIdentity={provider:string;model:string};

// SEMANTIC_BOUNDARY_ALLOW: 只约束供应商适配器已实现的协议和模型，不做创作语义判断。
export function supportsAssetGenerationMode(spec:AssetModelIdentity,mode:AssetGenerationMode){
 const provider=spec.provider.toLowerCase(),model=spec.model.toLowerCase();
 if(mode==="image_to_image"||mode==="text_to_image")return provider==="openai"||(provider==="minimax"&&["image-01","image-01-live"].includes(model));
 if(mode==="image_to_video")return provider==="minimax"&&["minimax-h3","minimax-h3-max","minimax-hailuo-2.3","minimax-hailuo-2.3-fast","minimax-hailuo-02"].includes(model);
 return provider==="minimax"&&["minimax-h3","minimax-h3-max","minimax-hailuo-2.3","minimax-hailuo-2.3-fast","minimax-hailuo-02"].includes(model);
}
export function capabilityForAssetMode(mode:AssetGenerationMode):"image.generate"|"image.edit"|"video.generate"{
 return mode==="image_to_image"?"image.edit":mode.endsWith("_image")?"image.generate":"video.generate";
}
export function referenceImageAllowed(spec:AssetModelIdentity,mode:AssetGenerationMode,mimeType:string,bytes:Uint8Array){
 const byteLength=bytes.byteLength;
 if(!["image/jpeg","image/png","image/webp"].includes(mimeType)||byteLength<=0||byteLength>20*1024*1024)return false;
 if(mode==="image_to_image"&&spec.provider.toLowerCase()==="minimax")return mimeType!=="image/webp"&&byteLength<10*1024*1024;
 if(mode==="image_to_video"&&spec.provider.toLowerCase()==="minimax"){
  const h3=spec.model.toLowerCase().startsWith("minimax-h3");
  if(!h3&&byteLength>=20*1024*1024)return false;
  try{
   const image=imageSize(bytes),width=image.width,height=image.height;
   if(!width||!height||image.type!==({"image/jpeg":"jpg","image/png":"png","image/webp":"webp"} as Record<string,string>)[mimeType])return false;
   const ratio=width/height;
   return ratio>=0.4&&ratio<=2.5&&(h3?width>=256&&height>=256&&width<=5760&&height<=5760:Math.min(width,height)>300);
  }catch{return false;}
 }
 return true;
}
/** 仅返回适配器已有协议允许的比例，未知渠道不推断能力。 */
export function assetGenerationAspectRatios(spec:AssetModelIdentity,mode:AssetGenerationMode):string[]|undefined {
 if(!supportsAssetGenerationMode(spec,mode))return undefined;
 const provider=spec.provider.toLowerCase(),model=spec.model.toLowerCase();
 if(provider==="openai"&&mode.endsWith("_image"))return ["1:1","9:16","3:4","2:3","16:9","4:3","3:2"];
 if(provider==="minimax"&&mode.endsWith("_image"))return ["1:1","16:9","4:3","3:2","2:3","3:4","9:16","21:9"];
 if(provider==="minimax"&&model.startsWith("minimax-h3")&&mode==="text_to_video")return ["21:9","16:9","4:3","1:1","3:4","9:16"];
 return undefined;
}
export function assetGenerationParameterError(spec:AssetModelIdentity,mode:AssetGenerationMode,input:{prompt:string;durationSec?:number;resolution?:string;aspectRatio?:string}):string|null{
 const provider=spec.provider.toLowerCase(),model=spec.model.toLowerCase();
 if(provider==="minimax"&&mode.endsWith("_image")&&input.prompt.length>1500)return "MiniMax 生图描述不能超过 1500 字";
 if(provider==="minimax"&&mode.endsWith("_image")&&input.aspectRatio&&!["1:1","16:9","4:3","3:2","2:3","3:4","9:16","21:9"].includes(input.aspectRatio))return "MiniMax 图片模型不支持该画幅";
 if(provider==="minimax"&&mode.endsWith("_video")&&input.prompt.length>(model.startsWith("minimax-h3")?7000:2000))return "当前 MiniMax 视频模型的生成描述过长";
 if(provider==="openai"&&input.aspectRatio&&!["1:1","9:16","3:4","2:3","16:9","4:3","3:2"].includes(input.aspectRatio))return "当前图片模型不支持该画幅";
 if(provider==="minimax"&&model.startsWith("minimax-h3")&&mode==="image_to_video"&&input.aspectRatio)return "首帧图生视频的画幅由图片决定，请清除手动画幅";
 if(provider==="minimax"&&model.startsWith("minimax-h3")&&mode==="text_to_video"&&input.aspectRatio&&!["21:9","16:9","4:3","1:1","3:4","9:16"].includes(input.aspectRatio))return "MiniMax H3 视频模型不支持该画幅";
 if(provider==="minimax"&&mode.endsWith("_video")){
  const duration=input.durationSec??6,resolution=input.resolution??"768P";
  if(model==="minimax-h3" && (!Number.isInteger(duration)||duration<4||duration>15||!["768P","2K"].includes(resolution)))return "MiniMax H3 支持 4–15 秒、768P 或 2K";
  if(model==="minimax-h3-max" && (!Number.isInteger(duration)||duration<5||duration>15||resolution!=="768P"))return "MiniMax H3 Max 支持 5–15 秒、768P";
  if(!model.startsWith("minimax-h3")&&(![6,10].includes(duration)||resolution!=="768P"||Boolean(input.aspectRatio)))return "当前视频模型只支持 6 或 10 秒、768P，画幅由模型决定";
 }
 return null;
}
