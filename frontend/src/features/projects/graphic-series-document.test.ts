import {describe,expect,it} from 'vitest';
import type {GraphicPostDocument} from '@creatoros/contract';
import {deleteGraphicPage,graphicDeliveryImages,moveGraphicPage,replaceGraphicPageImage,setGraphicCover} from './graphic-series-document';

const first={assetId:'a',assetFileId:'fa',role:'card' as const,cardId:'page-a',order:0};
const second={assetId:'b',assetFileId:'fb',role:'card' as const,cardId:'page-b',order:1};
const oldPhoto={assetId:'photo',assetFileId:'photo-v1',role:'card' as const,order:2};
const doc:GraphicPostDocument={schemaVersion:1,title:'作品',body:'原正文',summary:'',tags:[],sourceRefs:[],ruleSnapshotRef:null,
 cardBriefs:[{cardId:'page-a',title:'一',body:'一',sourceRefs:[]},{cardId:'page-b',title:'二',body:'二',sourceRefs:[]}],imageUses:[first,second,oldPhoto]};
describe('组图稿面明确操作',()=>{
 it('设为封面复制精确用途，原页绑定与其他页不变；交付去重并按页序',()=>{
  const next=setGraphicCover(doc,second);
  expect(next.imageUses.filter(image=>image.role==='card').map(({order,...image})=>image)).toEqual([first,second,oldPhoto].map(({order,...image})=>image));
  expect(next.imageUses[0]).toEqual({assetId:'b',assetFileId:'fb',role:'cover',order:0});
  expect(graphicDeliveryImages(next).map(image=>image.assetFileId)).toEqual(['fa','fb','photo-v1']);
  expect(doc.imageUses).toEqual([first,second,oldPhoto]);
 });
 it('移动真实页保留身份及文件，派生图片顺序；未知旧照片保留',()=>{
  const next=moveGraphicPage(doc,'page-b',-1);
  expect(next.cardBriefs?.map(card=>card.cardId)).toEqual(['page-b','page-a']);
  expect(graphicDeliveryImages(next).map(image=>image.assetFileId)).toEqual(['fb','fa','photo-v1']);
 });
 it('局部替换只动指定页，历史文件对象仍存在且旧照片不被猜页',()=>{
  const next=replaceGraphicPageImage(doc,'page-a',{assetId:'new',assetFileId:'exact-new'});
  expect(next.imageUses).toMatchObject([{assetId:'new',assetFileId:'exact-new',cardId:'page-a'},second,oldPhoto]);
  expect(doc.imageUses[0]).toEqual(first);
  expect(()=>replaceGraphicPageImage(doc,'missing',{assetId:'new',assetFileId:'new'})).toThrow();
 });
 it('删页明确同时移除绑定图及design，保留封面用途、其余页、未绑定照片',()=>{
  const withDesign={...setGraphicCover(doc,first),designs:[{target:{kind:'card' as const,cardId:'page-a'},document:{editor:'kuaitu' as const,revision:'r',nativeDocument:{},mediaRefs:[]}}]};
  const next=deleteGraphicPage(withDesign,'page-a');
  expect(next.cardBriefs?.map(card=>card.cardId)).toEqual(['page-b']);
  expect(next.designs).toEqual([]);
  expect(next.imageUses.some(image=>image.role==='card'&&image.cardId==='page-a')).toBe(false);
  expect(graphicDeliveryImages(next).map(image=>image.assetFileId)).toEqual(['fa','fb','photo-v1']);
 });
});

it('两个不同页与未绑定照片使用同文件仍保留每页，只有重复封面用途省去',()=>{const shared={...doc,imageUses:[first,{...first,cardId:'page-b',order:1},{...first,cardId:undefined,order:2}]};expect(graphicDeliveryImages(setGraphicCover(shared,first))).toHaveLength(3);expect(graphicDeliveryImages(setGraphicCover(shared,first)).map(image=>image.cardId)).toEqual(['page-a','page-b',undefined]);});
