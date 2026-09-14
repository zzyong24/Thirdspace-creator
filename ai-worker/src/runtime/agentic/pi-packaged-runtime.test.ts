import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { __setPiSdkForTest, isPiAgenticRuntimeAvailable } from './pi-engine';
let root: string | undefined;
afterEach(()=>{__setPiSdkForTest(undefined);vi.restoreAllMocks();vi.unstubAllEnvs();if(root)rmSync(root,{recursive:true,force:true});});
function fixture(source: string) {
 root=mkdtempSync(join(tmpdir(),'Pi 分层 '));mkdirSync(join(root,'layers/core/pi'),{recursive:true});
 writeFileSync(join(root,'layers/core/pi/pi-bundle.mjs'),source);
 vi.stubEnv('CREATOROS_RUNTIME_ROOT',root);vi.spyOn(process,'cwd').mockReturnValue(root);__setPiSdkForTest(undefined);
}
it('从安装包分层目录加载Pi，不要求node_modules',async()=>{
 fixture('export function createAgentSession(){};export class ModelRegistry{};export class AuthStorage{};export class SessionManager{};export class DefaultResourceLoader{}');
 expect(await isPiAgenticRuntimeAvailable()).toBe(true);
});
it('安装包Pi接口不完整不能假就绪',async()=>{
 fixture('export function createAgentSession(){}');
 expect(await isPiAgenticRuntimeAvailable()).toBe(false);
});
