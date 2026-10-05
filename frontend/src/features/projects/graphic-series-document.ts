import type {GraphicPostDocument} from '@creatoros/contract';
type ImageUse=GraphicPostDocument['imageUses'][number];

// SEMANTIC_BOUNDARY_ALLOW: These operations follow user-selected IDs and order;
// they neither infer page meaning nor decide visual quality.
export function normalizeGraphicImages(document:GraphicPostDocument):GraphicPostDocument {
 const pages=new Map((document.cardBriefs??[]).map((card,index)=>[card.cardId,index]));
 const cover=document.imageUses.filter(image=>image.role==='cover');
 const bound=document.imageUses.filter(image=>image.role==='card'&&image.cardId&&pages.has(image.cardId))
  .sort((a,b)=>pages.get(a.cardId!)!-pages.get(b.cardId!)!);
 const unbound=document.imageUses.filter(image=>image.role==='card'&&(!image.cardId||!pages.has(image.cardId)));
 return {...document,imageUses:[...cover,...bound,...unbound].map((image,order)=>({...image,order}))};
}
export function graphicDeliveryImages(document:GraphicPostDocument):ImageUse[] {
 const ordered=normalizeGraphicImages(document).imageUses;
 const pages=ordered.filter(image=>image.role!=='cover');
 // SEMANTIC_BOUNDARY_ALLOW: 只省略封面与页图的重复用途，保留用户明确的每页和旧照片顺序。
 return ordered.filter(image=>image.role!=='cover'||!pages.some(page=>page.assetId===image.assetId&&page.assetFileId===image.assetFileId));
}
export function setGraphicCover(document:GraphicPostDocument,image:Pick<ImageUse,'assetId'|'assetFileId'>):GraphicPostDocument {
 return normalizeGraphicImages({...document,imageUses:[{assetId:image.assetId,assetFileId:image.assetFileId,role:'cover',order:0},...document.imageUses.filter(item=>item.role!=='cover')]});
}
export function replaceGraphicPageImage(document:GraphicPostDocument,cardId:string,image:Pick<ImageUse,'assetId'|'assetFileId'>):GraphicPostDocument {
 if(!document.cardBriefs?.some(card=>card.cardId===cardId))throw new Error('目标页已不存在，请重新读取作品。');
 return normalizeGraphicImages({...document,imageUses:[...document.imageUses.filter(item=>!(item.role==='card'&&item.cardId===cardId)),{...image,role:'card',cardId,order:0}]});
}
export function deleteGraphicPage(document:GraphicPostDocument,cardId:string):GraphicPostDocument {
 return normalizeGraphicImages({...document,cardBriefs:(document.cardBriefs??[]).filter(card=>card.cardId!==cardId),
  imageUses:document.imageUses.filter(image=>!(image.role==='card'&&image.cardId===cardId)),
  ...(document.designs?{designs:document.designs.filter(design=>!(design.target.kind==='card'&&design.target.cardId===cardId))}:{})});
}
export function moveGraphicPage(document:GraphicPostDocument,cardId:string,step:number):GraphicPostDocument {
 const cards=[...(document.cardBriefs??[])],index=cards.findIndex(card=>card.cardId===cardId),target=index+step;
 if(index<0||target<0||target>=cards.length)return document;
 [cards[index],cards[target]]=[cards[target]!,cards[index]!];
 return normalizeGraphicImages({...document,cardBriefs:cards});
}
