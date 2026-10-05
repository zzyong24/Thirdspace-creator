import type {ArticleDocument,GraphicPostDocument,NoteRelayLayout} from '@creatoros/contract';
export type ImageRef={assetId:string;assetFileId:string};
export type Projection={title:string;markdown:string;images:ImageRef[]};
export function assetSource(image:ImageRef){return `creatoros-asset:${image.assetId}:${image.assetFileId}`;}
export function defaultLayout(platform:'wechat'|'rednote'):NoteRelayLayout{return {schemaVersion:1,editor:'noterelay',editorVersion:'0.1.8',themeId:platform==='wechat'?'moyu-green':'default',authorName:'',authorBio:'',variables:{},fontSize:16,splitHeading:2,templateId:'default',imageWidths:{},imageRadii:{}};}
const imageNode=(image:ImageRef)=>`![图片](${assetSource(image)})`;
// SEMANTIC_BOUNDARY_ALLOW: 仅投影用户已选的精确素材引用与显式段落顺序，不判断内容、匹配素材或选择风格。
// 代码示例是原文，不能把其中的图片语法当成正式素材。
function mapOutsideCode(value: string, transform: (text: string) => string): string {
 let result = '', text = '';
 let fence: {character: string; length: number} | undefined;
 const flush = () => {
  const runs = [...text.matchAll(/`+/g)];
  let offset = 0;
  for (let i = 0; i < runs.length; i++) {
   const opening = runs[i]!;
   const closingIndex = runs.findIndex((run, j) => j > i && run[0].length === opening[0].length);
   if (closingIndex < 0) continue;
   const closing = runs[closingIndex]!;
   result += transform(text.slice(offset, opening.index));
   offset = closing.index + closing[0].length;
   result += text.slice(opening.index, offset);
   i = closingIndex;
  }
  result += transform(text.slice(offset));
  text = '';
 };
 for (const line of value.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
  const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*?)(?:\n)?$/);
  if (fence) {
   result += line;
   if (marker && marker[1]![0] === fence.character && marker[1]!.length >= fence.length && !marker[2]!.trim()) fence = undefined;
  } else if (marker) {
   flush();
   fence = {character: marker[1]![0]!, length: marker[1]!.length};
   result += line;
  } else if (/^(?: {4}|\t)/.test(line)) {
   flush();
   result += line;
  } else {
   text += line;
  }
 }
 flush();
 return result;
}
function cleanMarkdown(value: string, images: ImageRef[]) {
 const allowed = new Set(images.map(assetSource));
 const sources = new Set<string>();
 const image = (src: string, alt: string) => {
  if (!allowed.has(src)) return '';
  sources.add(src);
  return `![${alt}](${src})`;
 };
 const body = mapOutsideCode(value, text => text
  .replace(/^<!-- creatoros-section:[^\n>]+ -->\s*$/gm, '')
  .replace(/<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi, (_all, _q, src: string) => image(src, '图片'))
  .replace(/(?<!\\)!\[([^\]]*)\]\(([^)\s]+)(?:\s+[^)]*)?\)/g, (_all, alt: string, src: string) => image(src, alt)));
 return {body, sources};
}
function unique(images:ImageRef[]){return [...new Map(images.map(image=>[assetSource(image),{assetId:image.assetId,assetFileId:image.assetFileId}])).values()];}
export function projectArticle(doc:ArticleDocument):Projection{
 const images=unique([...doc.imageUses,...(doc.coverImageUse?[doc.coverImageUse]:[])]);
 const parts=[doc.title?`# ${doc.title}`:'',doc.coverImageUse?imageNode(doc.coverImageUse):''];
 for(const section of [...doc.sections].sort((a,b)=>a.order-b.order)){
  const {body,sources}=cleanMarkdown(section.body,images);parts.push(`${'#'.repeat(section.headingLevel??2)} ${section.heading}\n\n${body}`);
  for(const image of doc.imageUses.filter(image=>image.sectionId===section.sectionId))if(!sources.has(assetSource(image)))parts.push(imageNode(image));
 }
 return {title:doc.title,markdown:parts.filter(Boolean).join('\n\n'),images};
}
export function projectGraphic(doc:GraphicPostDocument):Projection{
 const images=unique(doc.imageUses);const {body,sources:consumed}=cleanMarkdown(doc.body,images);
 const ordered=doc.imageUses.map((image,index)=>({image,index})).sort((a,b)=>a.image.order-b.image.order||a.index-b.index).map(({image})=>image);
 const used=new Set<ImageRef>();const take=(image:ImageRef)=>{if(consumed.has(assetSource(image))||used.has(image))return '';used.add(image);return imageNode(image);};
 const parts:string[]=[];const covers=ordered.filter(image=>image.role==='cover').map(take).filter(Boolean);if(covers.length)parts.push(covers.join('\n\n'));
 const main=[doc.title?`# ${doc.title}`:'',body].filter(Boolean).join('\n\n');if(main)parts.push(main);
 for(const card of doc.cardBriefs??[]){const {body:text,sources}=cleanMarkdown(card.body,images);for(const source of sources)consumed.add(source);parts.push([card.title?`## ${card.title}`:'',text,...ordered.filter(image=>image.role!=='cover'&&image.cardId===card.cardId).map(take)].filter(Boolean).join('\n\n'));}
 for(const image of ordered.filter(image=>image.role!=='cover')){const node=take(image);if(node)parts.push(node);}
 return {title:doc.title,markdown:parts.filter(Boolean).join('\n\n---\n\n'),images};
}
