import {expect,it} from "vitest";
import {ENDPOINTS} from "../src";
const capability={available:false,reason:"真实端口尚未装配"};
const row={platform:"douyin",bind:{available:true,reason:"已装配扫码登录端口",method:"qr"},collect:{available:true,reason:"已装配真实采集端口"},publish:capability,draft:capability,manual:{available:true,reason:"真实账号登记已可用"}};
it("能力列表是独立只读接口，五类能力和缺失原因可以分别呈现",()=>{const endpoint=ENDPOINTS.getPlatformAccountCapabilities;expect(endpoint).toMatchObject({id:"accounts.bindingCapabilities",method:"GET",path:"/accounts/binding-capabilities",isList:true});expect(endpoint.response.parse(row)).toEqual(row);});
it("未装配能力不能省略原因或伪造绑定方式",()=>{const schema=ENDPOINTS.getPlatformAccountCapabilities.response;expect(schema.safeParse({...row,publish:{available:false}}).success).toBe(false);expect(schema.safeParse({...row,bind:{...row.bind,method:"fake"}}).success).toBe(false);expect(schema.safeParse({...row,collect:{available:false,reason:""}}).success).toBe(false);});
