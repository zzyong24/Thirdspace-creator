/** WebKit 要求 write 在点击栈内调用；数据只在保存和版本校验完成后交付。 */
export async function writePreparedClipboard(types:readonly string[],prepare:()=>Promise<Record<string,Blob>>):Promise<void>{
 if(typeof ClipboardItem==='undefined'||!navigator.clipboard?.write)throw new Error('当前环境不支持富文本复制，请使用“复制纯文本”或导出文件。');
 const prepared=Promise.resolve().then(prepare);
 const data=Object.fromEntries(types.map(type=>{
  const blob=prepared.then(result=>{
   const value=result[type];if(!(value instanceof Blob)||value.type!==type)throw new Error('复制内容的文件类型不符。');return value;
  });
  // write/ClipboardItem 同步拒绝时浏览器可能未订阅数据；仍由下方 allSettled 回报失败。
  void blob.catch(()=>{});return [type,blob];
 }));
 let writing:Promise<void>;
 try{writing=navigator.clipboard.write([new ClipboardItem(data)]);}catch(error){writing=Promise.reject(error);}
 const outcomes=await Promise.allSettled([prepared,...Object.values(data),writing]);
 const failure=outcomes.find(result=>result.status==='rejected');if(failure?.status==='rejected')throw failure.reason;
}
