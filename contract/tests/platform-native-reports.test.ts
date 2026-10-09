import {describe,expect,it} from 'vitest';
import {platformNativeReportPayload} from '../src/resources/platform-native-reports';
const report=()=>({platform:'wechatVideo',kind:'channelsWorks',scope:'workSelection',selection:{startDate:'2026-09-09',endDate:'2026-10-08',timeZone:'Asia/Shanghai',meaning:'publishedDates'},accumulation:'sourceUnspecified',sourcePath:'/platform/statistic/post',filename:'视频数据.csv',sha256:'a'.repeat(64),receivedBytes:120,tables:[{key:'works',label:'单篇视频',columns:[{key:'视频ID',label:'视频ID',unit:'opaqueId'},{key:'完播率',label:'完播率',unit:'ratio'},{key:'平均播放时长',label:'平均播放时长',unit:'seconds'}],rows:[[{raw:'export/test',value:'export/test'},{raw:'0%',value:0},{raw:'-',value:null}]]}]});
describe('微信原生报表契约',()=>{
 it('保留ID、真实0、未知与独立单位',()=>expect(platformNativeReportPayload.parse(report()).tables[0].rows[0][2].value).toBeNull());
 it('拒绝错平台类别、维度及假单位值',()=>{expect(platformNativeReportPayload.safeParse({...report(),platform:'wechatOfficial'}).success).toBe(false);expect(platformNativeReportPayload.safeParse({...report(),scope:'accountDaily'}).success).toBe(false);const r=report();r.tables[0].rows[0][1].value=20;expect(platformNativeReportPayload.safeParse(r).success).toBe(false);});
 it('拒绝含会话参数的来源、路径文件名及乱序日期',()=>{for(const patch of [{sourcePath:'/platform/statistic/post?token=secret'},{filename:'../a.csv'},{selection:{...report().selection,startDate:'2026-10-10'}}])expect(platformNativeReportPayload.safeParse({...report(),...patch}).success).toBe(false);});
 it('同一报表多个区块合计最多10000行，不以每表上限放大内存',()=>{const r=report();r.tables=[{...r.tables[0],key:'first',rows:Array.from({length:5001},()=>r.tables[0].rows[0])},{...r.tables[0],key:'second',rows:Array.from({length:5000},()=>r.tables[0].rows[0])}];expect(platformNativeReportPayload.safeParse(r).success).toBe(false);});
 it('不接受行列长度错位',()=>{const r=report();r.tables[0].rows[0].pop();expect(platformNativeReportPayload.safeParse(r).success).toBe(false);});
});
