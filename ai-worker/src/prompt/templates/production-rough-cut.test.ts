import {it,expect} from 'vitest';
import {getOfficialSkillBase} from '../registry';
import {PRODUCTION_ROUGH_CUT_TEMPLATE} from './production-rough-cut';
it('协议3显式选择独立Skill版本，旧v2模板与默认base保持原值',()=>{
 const before=JSON.stringify(PRODUCTION_ROUGH_CUT_TEMPLATE),legacy=getOfficialSkillBase('production.rough-cut');
 const current=getOfficialSkillBase('production.rough-cut',{protocolVersion:3});
 expect(current?.baseVersion).toBe('v3');expect(current?.template).toContain('pause_gap');expect(current?.template).toContain('不确定时保留');
 expect(getOfficialSkillBase('production.rough-cut')).toEqual(legacy);expect(legacy?.baseVersion).toBe('v2');expect(JSON.stringify(PRODUCTION_ROUGH_CUT_TEMPLATE)).toBe(before);
});
