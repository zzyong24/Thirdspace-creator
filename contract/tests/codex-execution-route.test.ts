import {expect,it} from 'vitest';
import {userPreferenceResource} from '../src/resources/settings';
import {settingsOperations} from '../src/operations/settings';
it('T1238 公共设置必须支持Codex且首次读取为空',()=>{
 const pref=userPreferenceResource.parse({id:'pref-a',userId:'a',defaultHome:'dashboard',defaultCreationMode:'guided',defaultVisibility:'private',autosaveEnabled:true,fileNamingRule:'',analyticsEnabled:false});
 expect(pref.assistantExecutionEngine).toBeNull();
 expect(settingsOperations.patchPreferences.body.parse({assistantExecutionEngine:'codex'})).toEqual({assistantExecutionEngine:'codex'});
});
