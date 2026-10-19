# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: performance.spec.cjs >> T1316 本地可逆操作：脚本撤回与文字工程播放保存
- Location: ../docs/verification/t1316/public/runner/local-performance-7790/local-operations.cjs:4:41

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('[data-native-root="opencut"]').getByRole('button', { name: '默认文字', exact: true })
Expected: 1
Received: 2
Timeout:  120000ms

Call log:
  - Expect "toHaveCount" with timeout 120000ms
  - waiting for locator('[data-native-root="opencut"]').getByRole('button', { name: '默认文字', exact: true })
    241 × locator resolved to 2 elements
        - unexpected value "2"

```

# Test source

```ts
  1  | 'use strict';
  2  | const {test,expect}=require('@playwright/test');
  3  | const {open,rpc,save,data,out}=require('./support.cjs');
  4  | module.exports=function registerLocal(){test('T1316 本地可逆操作：脚本撤回与文字工程播放保存',async()=>{
  5  |  test.setTimeout(28800000);const h=await open('production'),p=h.page,n=p.locator('[data-native-root="opencut"]');
  6  |  const samples=[];async function timed(label,event,selector,action,observe){await p.evaluate(({event,selector})=>{window.__manualLocalTiming={timeOrigin:performance.timeOrigin,start:null};const f=e=>{if(e.composedPath().some(x=>x instanceof Element&&x.matches(selector))){window.__manualLocalTiming.start=performance.now();document.removeEventListener(event,f,true);}};document.addEventListener(event,f,true);},{event,selector});await action();await observe();const x=await p.evaluate(()=>({...window.__manualLocalTiming,observedAt:performance.now()}));expect(x.start).not.toBeNull();const r={label,...x,elapsedUpperBoundMs:x.observedAt-x.start,meaning:'真实UI事件→所列状态经Playwright观察成功的上界，含工具观察开销；非Tab耗时'};samples.push(r);save(label,r);}
  7  |  try{
  8  |  await n.locator('.native-workbench').waitFor({timeout:120000});await expect(p.getByRole('button',{name:'保存工程',exact:true})).toBeEnabled();
  9  |  const host=await p.locator('div[aria-label="视频剪辑工作台"]').elementHandle();
  10 |  const baseline=await rpc('outputs.production.editor.get',{params:{outputId:data.outputs.video.id}}),scriptBefore=await rpc('artifacts.get',{params:{artifactId:data.artifactId}}),prefsBefore=await rpc('settings.preferences.get');save('before',{baseline,scriptBefore,prefsBefore});
  11 |  await p.locator('[data-testid="stage-segment-script"]').click();const body=p.locator('[data-slot="script-section-body"]');await expect(body).toBeVisible();const text=await body.inputValue();await body.focus();await body.press('Meta+ArrowDown');let selection=await body.evaluate(el=>({start:el.selectionStart,end:el.selectionEnd,length:el.value.length}));if(selection.start!==text.length||selection.end!==text.length){await body.press('Control+End');selection=await body.evaluate(el=>({start:el.selectionStart,end:el.selectionEnd,length:el.value.length}));}save('script-selection-before-type',selection);expect(selection.start).toBe(text.length);expect(selection.end).toBe(text.length);
  12 |  await timed('script-edit','input','[data-slot="script-section-body"]',()=>p.keyboard.insertText(' 临时'),()=>expect(body).toHaveValue(text+' 临时'));
  13 |  await timed('script-undo','keydown','[data-slot="script-section-body"]',()=>body.press('Meta+z'),()=>expect(body).toHaveValue(text));
  14 |  const scriptAfterUndo=await rpc('artifacts.get',{params:{artifactId:data.artifactId}});expect(scriptAfterUndo.currentVersionId).toBe(scriptBefore.currentVersionId);save('script-original-version-restored',{before:scriptBefore,after:scriptAfterUndo,actualValueRestored:true,preferencesUnchanged:JSON.stringify(prefsBefore)===JSON.stringify(await rpc('settings.preferences.get'))});
  15 |  await p.locator('[data-testid="stage-segment-production"]').click();await expect(n.locator('.native-workbench')).toBeVisible();expect(await host.evaluate(el=>el.isConnected)).toBe(true);expect(await p.locator('div[aria-label="视频剪辑工作台"]').evaluate((el,old)=>el===old,host)).toBe(true);
  16 |  const play=n.getByRole('button',{name:'播放',exact:true}),tc=n.locator('button[title="Click to edit time"]'),beforeTime=await tc.innerText();
  17 |  await timed('video-play-progress','click','[aria-label="播放"]',()=>play.click(),()=>expect(tc).not.toHaveText(beforeTime));await n.getByRole('button',{name:'暂停',exact:true}).click();save('native-playback',{beforeTime,afterTime:await tc.innerText(),hasMedia:false,scene:'原UI手工黑底默认文字5秒场景，不代表真实媒体解码'});
  18 |  await n.getByText('素材与属性',{exact:true}).click();await n.getByRole('button',{name:'文字',exact:true}).click();const card=n.locator('div.group.relative').filter({hasText:'默认文字'});await expect(card).toHaveCount(1);await card.hover();const clips=n.getByRole('button',{name:'默认文字',exact:true});await expect(clips).toHaveCount(1);
  19 |  await timed('video-add-text','click','div.group.relative button',()=>card.locator('button').click(),async()=>{await expect(clips).toHaveCount(2);await expect(p.getByText('有未保存修改',{exact:true})).toBeVisible();});
> 20 |  await n.focus();await timed('video-undo','keydown','[data-native-root="opencut"]',()=>n.press('Control+z'),()=>expect(clips).toHaveCount(1));
     |                                                                                                                               ^ Error: expect(locator).toHaveCount(expected) failed
  21 |  await timed('video-redo','keydown','[data-native-root="opencut"]',()=>n.press('Control+Shift+z'),()=>expect(clips).toHaveCount(2));
  22 |  const button=p.getByRole('button',{name:'保存工程',exact:true});await timed('video-save','click','section[aria-label="视频剪辑工作台"] > header > div:last-child > button:first-child',()=>button.click(),()=>expect(p.getByText('已保存',{exact:true})).toBeVisible());const saved=await rpc('outputs.production.editor.get',{params:{outputId:data.outputs.video.id}});expect(saved.revision).toBeGreaterThan(baseline.revision);
  23 |  await n.focus();await n.press('Control+z');await expect(clips).toHaveCount(1);await button.click();await expect(p.getByText('已保存',{exact:true})).toBeVisible();const restored=await rpc('outputs.production.editor.get',{params:{outputId:data.outputs.video.id}});const elements=d=>d.plan.referenceEditor.nativeDocument.scenes.flatMap(s=>[...s.tracks.main.elements,...s.tracks.overlay.flatMap(t=>t.elements),...s.tracks.audio.flatMap(t=>t.elements)]);expect(elements(restored)).toEqual(elements(baseline));
  24 |  const scriptFinal=await rpc('artifacts.get',{params:{artifactId:data.artifactId}});expect(scriptFinal.currentVersionId).toBe(scriptBefore.currentVersionId);expect(await rpc('settings.preferences.get')).toEqual(prefsBefore);save('local-operation-results',{samples,baseline,saved,restored,scriptBefore,scriptFinal,scriptVersionUnchanged:true,originalNativeElementsRestored:true,mediaDecoded:false,modelRequests:0,measurementScope:'小型手工文字样本，独立操作观察上界；非完整第三工厂case或复杂媒体性能'});await p.screenshot({path:out+'/local-operations-final.png',fullPage:false});
  25 |  }catch(e){save('local-operation-failure',{name:e.name,message:e.message,samples,url:p.url()});const body=p.locator('[data-slot="script-section-body"]');if(await body.isVisible()){const actualBeforeUndo=await body.inputValue();await body.press('Meta+z');const actualAfterUndo=await body.inputValue();save('failure-script-ui-undo',{actualBeforeUndo,actualAfterUndo,artifact:await rpc('artifacts.get',{params:{artifactId:data.artifactId}}),versions:await rpc('artifacts.versions.list',{params:{artifactId:data.artifactId},query:{page:1,pageSize:100}})});}await p.screenshot({path:out+'/local-operations-failure.png',fullPage:false}).catch(()=>{});throw e;}finally{await h.close();}
  26 |  });};
  27 | 
```