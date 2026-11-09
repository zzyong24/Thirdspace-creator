import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
const state=vi.hoisted(()=>({home:'',spawn:vi.fn()}));
vi.mock('node:os',async original=>{const actual=await original();return {...actual,default:{...actual.default,homedir:()=>state.home},homedir:()=>state.home};});
vi.mock('node:child_process',async original=>{const actual=await original();const spawnSync=(...args)=>state.spawn(...args);return {...actual,default:{...actual.default,spawnSync},spawnSync};});
import {ensureFfmpegStatic,ensureFfprobeStatic} from './fetch-ffmpeg.mjs';
const bytes=Buffer.from('构建期资源测试字节');
beforeEach(()=>{state.home=mkdtempSync(join(tmpdir(),'静态工具 空格-'));state.spawn.mockReset();vi.stubEnv('CREATOROS_PACKAGE_BUILD_ONLY','1');vi.stubEnv('CREATOROS_FFMPEG_BUNDLE_SRC','');vi.stubEnv('CREATOROS_FFPROBE_BUNDLE_SRC','');vi.stubEnv('GH_TOKEN','');vi.stubEnv('GITHUB_TOKEN','');});afterEach(()=>{rmSync(state.home,{recursive:true,force:true});vi.unstubAllEnvs();});
it('公共ffprobe入口在curl56/504后从同一官方资源恢复，而不是丢失必需工具',()=>{
 state.spawn.mockImplementation((command,args)=>{const url=args.at(-1),out=args[args.indexOf('-o')+1];if(url.includes('github.com/eugeneware/ffmpeg-static/releases/download/'))return {status:56,stdout:'504'};if(url.includes('/releases/tags/')){writeFileSync(out,JSON.stringify({tag_name:'b6.0',assets:[{id:7,name:'ffprobe-darwin-arm64',size:bytes.length,url:'https://api.github.com/repos/eugeneware/ffmpeg-static/releases/assets/7',browser_download_url:'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffprobe-darwin-arm64',digest:null}]}));}else writeFileSync(out,bytes);return {status:0,stdout:'200'};});
 const file=ensureFfprobeStatic('aarch64-apple-darwin');expect(readFileSync(file)).toEqual(bytes);expect(state.spawn).toHaveBeenCalledTimes(3);
});
it.each([['aarch64-apple-darwin','darwin-arm64'],['x86_64-apple-darwin','darwin-x64'],['x86_64-pc-windows-msvc','win32-x64'],['x86_64-unknown-linux-gnu','linux-x64']])('原%s缓存成功样例继续可用，不发下载', (target,suffix)=>{const folder=join(state.home,'.cache/creatoros/ffmpeg-static/b6.0');mkdirSync(folder,{recursive:true});for(const [tool,ensure] of [['ffmpeg',ensureFfmpegStatic],['ffprobe',ensureFfprobeStatic]]){const path=join(folder,`${tool}-${suffix}${suffix==='win32-x64'?'.exe':''}`);writeFileSync(path,bytes);expect(ensure(target)).toBe(path);}expect(state.spawn).not.toHaveBeenCalled();});
it('原显式离线二进制仍可用，恢复逻辑不会覆盖或联网',()=>{const p=join(state.home,'离线 ffprobe');writeFileSync(p,bytes);vi.stubEnv('CREATOROS_FFPROBE_BUNDLE_SRC',p);expect(ensureFfprobeStatic('aarch64-apple-darwin')).toBe(p);expect(state.spawn).not.toHaveBeenCalled();});
