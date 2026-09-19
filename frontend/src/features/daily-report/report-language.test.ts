import {describe,it,expect} from 'vitest';
import {reportUserText,userFacingAnalysis} from './report-language';
const report:any={accountId:'acct-ae1a8346-9',accountName:'作者',works:[{publicationId:'pub-ed64285a-78',projectId:'project-ed64285a-63',title:'记录成长'}]};
describe('运营分析用户话术',()=>{
 it('只翻译内部字段与精确ID，保留数字及真实产品名称',()=>{const text=reportUserText('pub-ed64285a-78《记录成长》 profile_visits 9、Hook、Position；GitHub/App Store，90.3%。',report);expect(text).toBe('《记录成长》 主页访问 9、开头吸引力、账号定位；GitHub/App Store，90.3%。');});
 it('展示转换不改变分析绑定或原存储对象',()=>{const input:any={publicationId:'untouched',headline:'Hook',summary:'profile_visits 9',positioning:{observation:'Position',suggestion:'GitHub'},works:[{publicationId:'pub-ed64285a-78',observation:'pub-ed64285a-78',hypothesis:'待验证',experiment:'follower_gain 0'}],experiments:[]};const output=userFacingAnalysis(input,report)!;expect(output.works[0].publicationId).toBe('pub-ed64285a-78');expect(output.works[0].observation).toBe('《记录成长》');expect(input.headline).toBe('Hook');expect(output.summary).toBe('主页访问 9');});
 it('阶段方向里的内部字段也转换成用户能理解的文字',()=>{const input:any={headline:'建议',summary:'摘要',directions:[{title:'提升 Hook',evidence:'pub-ed64285a-78 的 profile_visits 9',recommendation:'改进 Position',nextStep:'先看 follower_gain',signal:'观察 CTR'}],positioning:{observation:'',suggestion:''},works:[],experiments:[]};const output=userFacingAnalysis(input,report)!;expect(output.directions?.[0].title).toBe('提升 开头吸引力');expect(output.directions?.[0].evidence).toBe('《记录成长》 的 主页访问 9');expect(input.directions[0].title).toBe('提升 Hook');});
});
