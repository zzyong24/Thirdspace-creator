import DOMPurify from 'dompurify';
export function sanitizeHTMLToDom(html:string){return DOMPurify.sanitize(html,{RETURN_DOM_FRAGMENT:true,ADD_ATTR:['style','data-noterelay-source','data-noterelay-image-key']});}
export async function requestUrl(_input:unknown):Promise<never>{throw new Error('图片未登记到当前稿件，请从素材库选用。');}
