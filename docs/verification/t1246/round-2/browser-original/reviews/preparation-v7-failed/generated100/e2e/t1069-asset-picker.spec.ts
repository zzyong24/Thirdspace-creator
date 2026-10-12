import {randomUUID} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import type {Page} from '@playwright/test';
import {expect as baseExpect,test} from '../helpers/test-environment';
const expect=baseExpect.configure({timeout:120_000});
const fresh=()=>randomUUID();
async function dispatch<T>(page:Page,id:string,input:unknown,groupId?:string):Promise<T>{
 const response=await page.request.post('/api/v1/dispatch',{headers:{'content-type':'application/json',...(groupId?{'x-group-id':groupId}:{})},data:{id,input}});
 expect(response.ok(),`${id} status=${response.status()} ${await response.text()}`).toBe(true);return (await response.json()).data;
}
function crc32(bytes:Buffer){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(name:string,data:Buffer){const type=Buffer.from(name),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([length,type,data,crc]);}
// 合成 PNG 只用于真实图库、文件解码与作用域验收，不冒充用户本人照片。
function image(index:number){const header=Buffer.alloc(13);header.writeUInt32BE(32,0);header.writeUInt32BE(24,4);header[8]=8;header[9]=6;const pixels=Buffer.alloc(24*(1+32*4));for(let y=0;y<24;y++)for(let x=0;x<32;x++){const at=y*129+1+x*4;pixels[at]=index;pixels[at+1]=x*7;pixels[at+2]=y*10;pixels[at+3]=255;}return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);}
async function upload(page:Page,groupId:string,index:number,name:string){
 const bytes=image(index),start=await dispatch<{uploadId:string;uploadUrl:string}>(page,'assets.uploads.create',{body:{assetType:'image',mimeType:'image/png',fileSize:bytes.length,fileName:name}},groupId);
 const put=await page.request.put(start.uploadUrl,{headers:{'content-type':'image/png','x-group-id':groupId},data:bytes});expect(put.ok()).toBe(true);
 return await dispatch<{id:string;currentFileId:string}>(page,'assets.uploads.complete',{params:{uploadId:start.uploadId},body:{name}},groupId);
}
test('公共全库分页与模板照片选择：后页可见、搜索和取消保留精确照片',async({page,context,baseURL},testInfo)=>{
 test.setTimeout(259_200_000);page.setDefaultTimeout(120_000);page.setDefaultNavigationTimeout(120_000);context.setDefaultTimeout(120_000);
 await page.goto('/');const group=await dispatch<{id:string}>(page,'accountGroups.create',{body:{name:`中性图库-${fresh()}`,idempotencyKey:fresh()}});
 const prefix=`中性照片_${fresh()}`;let oldest:{id:string;currentFileId:string}|undefined;
 for(let index=0;index<140;index++){const asset=await upload(page,group.id,index,`${prefix}_${String(index).padStart(3,'0')}_完整长名称.png`);if(index===0)oldest=asset;}
 const ids:string[]=[];let cursor:string|null=null;
 do{const result:{items:Array<{id:string}>;nextCursor:string|null}=await dispatch<{items:Array<{id:string}>;nextCursor:string|null}>(page,'assets.search',{query:{query:prefix,assetTypes:['image'],limit:24,cursor}},group.id);ids.push(...result.items.map(item=>item.id));cursor=result.nextCursor;}while(cursor);
 expect(ids).toHaveLength(140);expect(new Set(ids).size).toBe(140);expect(ids.at(-1)).toBe(oldest!.id);
 const other=await dispatch<{id:string}>(page,'accountGroups.create',{body:{name:`隔离组-${fresh()}`,idempotencyKey:fresh()}});
 const separated=await dispatch<{items:unknown[]}>(page,'assets.search',{query:{query:prefix,assetTypes:['image'],limit:24}},other.id);expect(separated.items).toEqual([]);
 await context.addCookies([{name:'creatoros_current_group',value:encodeURIComponent(group.id),url:baseURL!}]);await page.addInitScript(id=>{localStorage.setItem('creatoros:current-group',id);localStorage.removeItem('creatoros:current-account');},group.id);
 await page.goto('/canvases?tab=cases');await page.getByRole('button',{name:/真人知识封面/}).click();
 await page.getByRole('button',{name:'本人照片（必选）',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 await dialog.getByRole('textbox',{name:'搜索素材'}).fill(`${prefix}_000`);await dialog.getByRole('button',{name:`预览 ${prefix}_000_完整长名称.png`}).click();
 await expect(dialog.locator('img')).toHaveCount(2);await expect.poll(()=>dialog.locator('img').evaluateAll(images=>images.every(image=>(image as HTMLImageElement).complete&&(image as HTMLImageElement).naturalWidth===32)),{timeout:120_000}).toBe(true);await page.setViewportSize({width:1366,height:900});await page.screenshot({path:testInfo.outputPath('picker-1366.png'),fullPage:true});
 await page.setViewportSize({width:1024,height:900});await page.screenshot({path:testInfo.outputPath('picker-1024.png'),fullPage:true});
 // 200%浏览器缩放对应的有效CSS视口；不用CSS zoom冒充原生浏览器缩放。
 await page.setViewportSize({width:683,height:450});
 await expect.poll(async()=>{const box=await dialog.boundingBox();return Boolean(box&&box.x>=0&&box.y>=0&&box.x+box.width<=683&&box.y+box.height<=450);},{timeout:120_000}).toBe(true);
 const confirmBox=await dialog.getByRole('button',{name:'使用此素材'}).boundingBox();expect(confirmBox).not.toBeNull();expect(confirmBox!.y).toBeGreaterThanOrEqual(0);expect(confirmBox!.y+confirmBox!.height).toBeLessThanOrEqual(450);
 await page.screenshot({path:testInfo.outputPath('picker-683x450-reflow.png'),fullPage:true});await page.setViewportSize({width:1366,height:900});
 await dialog.getByRole('button',{name:'使用此素材'}).click();await expect(dialog).not.toBeVisible();const field=page.getByRole('button',{name:'本人照片（必选）',exact:true});await expect(field).toContainText(`${prefix}_000_完整长名称.png`);
 await field.click();await dialog.getByRole('textbox',{name:'搜索素材'}).fill(`${prefix}_139`);await dialog.getByRole('button',{name:`预览 ${prefix}_139_完整长名称.png`}).click();await dialog.getByRole('button',{name:'取消',exact:true}).click();await expect(field).toContainText(`${prefix}_000_完整长名称.png`);
 await expect(field).toBeFocused();await field.press('Enter');await expect(dialog).toBeVisible();await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(field).toBeFocused();await expect(field).toContainText(`${prefix}_000_完整长名称.png`);
});
