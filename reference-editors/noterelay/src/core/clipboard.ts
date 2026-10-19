import {rich, png, type Delivery} from "../../web/host-port";
export async function copyRichHtml(html: string, plainText: string, receive?: (delivery: Delivery) => void) {
  if (!receive) throw new Error('交付请求已失效'); receive(rich(html, plainText));
}
export async function copyPng(dataUrl: string, receive?: (delivery: Delivery) => void) {
  if (!receive) throw new Error('交付请求已失效'); receive(png(dataUrl));
}
