import json, subprocess, pathlib, xml.etree.ElementTree as E
ROOT=pathlib.Path(__file__).resolve().parent
DOCS={'trial':'IUYFdrytdoT2emxg8xzcc1NnnPN','guide':'Us4ddaMjeokvvZxNmOxcu9oinZe'}
reports={}
for label,doc in DOCS.items():
 r=subprocess.run(['lark-cli','docs','+fetch','--doc',doc,'--detail','full','--as','user'],capture_output=True,text=True,check=True)
 d=json.loads(r.stdout);assert d.get('ok') is True
 content=d['data']['document']['content'];pathlib.Path('/tmp/creatoros-feishu-'+label+'-after.json').write_text(r.stdout)
 tree=E.fromstring('<root>'+content+'</root>');text=''.join(tree.itertext())
 res=[{'tag':x.tag,**dict(x.attrib)} for x in tree.iter() if x.tag in ('img','source','cite','whiteboard','sheet','bitable','synced_reference')]
 original=json.loads((ROOT/(label+'-original-resources.json')).read_text())['resources']
 assert all(x in res for x in original), 'original resources changed: '+label
 for required in ['2026年11月3日','1.2.0','账号组','官方模型','公众号','小红书']:
  assert required in text, (label,required)
 for removed in ['股东默认收到的是','更换为“内置模型版”激活码','绑定账号。','CreatorOS v1.0 安装包','正式安装包正在同步','先确认模型配置和抖音账号绑定']:
  assert removed not in text, (label,removed)
 reports[label]={'document_id':doc,'revision_id':d['data']['document']['revision_id'],'original_resource_count':len(original),'original_resources_preserved':True,'current_resource_count':len(res),'resources':res}
 if label=='trial':
  for name in ['creatoros-creator-overview.webp','creatoros-positioning.webp','creatoros-script-workbench.webp']:
   assert any(x.get('name')==name for x in res), name
  assert 'https://my.feishu.cn/wiki/QY1owmFUjit7VgkpmQ1chGPCnTR' in content
 else:
  expected={'CreatorOS_1.2.0_aarch64.dmg':887811054,'CreatorOS_1.2.0_x64-setup.exe':913251151}
  for name,size in expected.items():
   matches=[x for x in res if x['tag']=='source' and x.get('name')==name and int(x.get('size','0'))==size]
   assert len(matches)==1, (name,matches)
   reports[label].setdefault('current_installers',[]).extend(matches)
  children=list(tree);mac=next(i for i,x in enumerate(children) if x.tag=='h3' and ''.join(x.itertext())=='Mac Apple芯片｜当前下载');win=next(i for i,x in enumerate(children) if x.tag=='h3' and ''.join(x.itertext())=='Windows x64｜当前下载');hist=next(i for i,x in enumerate(children) if x.tag=='h2' and ''.join(x.itertext())=='历史安装包（仅留档）')
  for a,b,name in [(mac,win,'CreatorOS_1.2.0_aarch64.dmg'),(win,hist,'CreatorOS_1.2.0_x64-setup.exe')]:
   assert any(y.tag=='source' and y.get('name')==name and int(y.get('size','0'))==expected[name] for x in children[a+1:b] for y in x.iter()),name+' outside current download section'
  assert '未做Windows代码签名' in text and 'Apple公证' in text
(ROOT/'READBACK.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2)+'\n')
print('两篇文档回读通过，全部原资源保留，三张真实截图和两份新包均位于正确下载区。')
