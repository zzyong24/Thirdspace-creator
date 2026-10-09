import {expect,it} from 'vitest';
import {supportsPrivateCollection} from './private-collector-admission.service';
it.each(['wechatOfficial','wechatVideo'])('T1110 %s只准入真实已支持的self.metrics，不授予评论、流量或内容补全能力',platform=>{expect(supportsPrivateCollection(platform,'self.metrics')).toBe(true);for(const kind of ['self.traffic','comments','self.detail','topic.daily'])expect(supportsPrivateCollection(platform,kind)).toBe(false);});
it('T1110创作公众号alias不被当作已接入的采集身份',()=>{expect(supportsPrivateCollection('wechatOfficialAccount','self.metrics')).toBe(false);});
