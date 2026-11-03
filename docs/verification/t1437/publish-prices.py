from pathlib import Path
from decimal import Decimal
from html import escape as esc
import json,re,subprocess,xml.etree.ElementTree as E
ROOT=Path(__file__).resolve().parent
MODELS={
 'claude-haiku-5-5':('Claude Haiku 5.5','0.45','4.5折',[('0—100,000 Tokens','Input(0-100000)','Output(0-100000)'),('≥100,001 Tokens','Input(≥100001)','Output(≥100001)')]),
 'gemini-3.8-flash':('Gemini 3.8 Flash','0.42','4.2折',[('标准计费','Input','Output')]),
 'gpt-6.1-sol':('GPT 6.1 Sol','0.42','4.2折',[('0—272,000 Tokens','输入价格(0-272000)','输出价格(0-272000)'),('≥272,001 Tokens','输入价格(≥272001)','输出价格(≥272001)')]),
 'kimi-k3':('Kimi K3','0.65','6.5折',[('标准计费','输入价格','输出价格')]),
 'minimax-m3':('MiniMax M3','0.65','6.5折',[('0—512,000 Tokens','输入价格(0-512000)','输出价格(0-512000)'),('≥512,001 Tokens','输入价格(≥512001)','输出价格(≥512001)')]),
 'deepseek-v4.1-flash':('DeepSeek V4.1 Flash','0.60','6折',[('标准计费','Input','Output')])}
source=json.loads((ROOT/'omnihi-public-price-source.json').read_text());data={m['model']:m for m in source['models']}
checks=[]
def money(raw,multiplier='1'):
 match=re.fullmatch(r'([$¥])(\d+(?:\.\d+)?)/Mts',raw);assert match,raw
 amount=Decimal(match[2])*Decimal(multiplier)
 text=format(amount,'f');text=text.rstrip('0').rstrip('.') if '.' in text else text
 checks.append({'source':raw,'multiplier':multiplier,'result':match[1]+text,'value':str(amount)})
 return match[1]+text
rows=[];cache=[]
for model,(name,ratio,label,tiers) in MODELS.items():
 d=dict(data[model]['rows'][1:])
 for tier,inputkey,outputkey in tiers:
  rows.append([name+'（'+model+'）',tier,money(d[inputkey])+' / '+money(d[outputkey]),label,money(d[inputkey],ratio)+' / '+money(d[outputkey],ratio)])
 for key,raw in data[model]['rows'][1:]:
  if not key.lower().startswith('cached'):continue
  namekey=key.replace('Cached reads','缓存读取').replace('Cached Reads','缓存读取').replace('Cached Writes','缓存写入')
  cache.append([name+'（'+model+'）',namekey,money(raw),label,money(raw,ratio)])
def table(head,rows):
 return '<table><thead><tr>'+''.join('<th>'+esc(x)+'</th>' for x in head)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+esc(x)+'</td>' for x in row)+'</tr>' for row in rows)+'</tbody></table>'
body='<p><b>文本模型现支持下列6款，按指定折扣展示价格。</b>4.5折＝原价×45%，4.2折＝原价×42%，6.5折＝原价×65%，6折＝原价×60%。Image 2不参与本次折扣，保持原价。</p>'
body+='<p><b>计费单位：</b>下列文本与缓存单价均为每百万Tokens；$为美元，¥为人民币，分别保留目录原币种，不按固定汇率混算。输入与输出分别计费，并非整次调用只收其中一项。长上下文按对应输入Token范围选档。</p>'
body+='<p><b>价格口径：</b>原价取自2026年11月3日核对的<a href="https://omnihi.ai/market-list">当前模型服务目录</a>，折后价按CreatorOS本次确认折扣计算。这里的“原价”指该服务目录报价；实际可用模型、用量与最终结算请以“AI额度与消耗/积分充值”页面及实时账单为准，目录变化后应重新核对。</p>'
body+='<h3>文本输入与输出价格</h3>'+table(['模型与Model ID','输入Token范围','目录原价（输入 / 输出）','CreatorOS折扣','折后价（输入 / 输出）'],rows)
body+='<h3>缓存价格与阶梯</h3><p>缓存是否命中、是否发生写入，以模型服务实际用量为准。5m、1h保留目录的缓存规格标签；未列出的缓存类型不按0元推算。</p>'+table(['模型与Model ID','缓存计费项/范围','目录原价','CreatorOS折扣','折后价'],cache)
body+='<p><b>图片编辑：</b><code>openai/gpt-image-2-edit</code>（GPT Image 2）无新增折扣，本次不调整其当前价格；不同图片尺寸、质量和调用规格的价格，请在实际充值/计费页查看。不把图片按张计费与文本按Token计费混在一起。</p>'
body+='<p><b>模型来源：</b>上述折扣说明针对官方模型服务。使用自己的API Key或本地Codex时，按对应服务和账户规则使用，不套用本表报价；视频与语音转文字的既有价格本次不调整。</p>'
body+='<h3>历史模型与价格截图（仅留档）</h3><p>下方旧图不代表当前模型清单或当前报价；请以上方新表及应用实时页面为准。</p>'
(ROOT/'PRICE_TABLE.xml').write_text(body+'\n');(ROOT/'PRICE_CALCULATIONS.json').write_text(json.dumps({'discounts':{k:{'name':v[0],'multiplier':v[1],'label':v[2]} for k,v in MODELS.items()},'imageEdit':'不打折、不调整原价','summaryRows':rows,'cacheRows':cache,'calculations':checks},ensure_ascii=False,indent=2)+'\n')
for name,doc,anchor in [('trial','IUYFdrytdoT2emxg8xzcc1NnnPN','doxcn1gEDL77mrgOYa7bnwFnegg'),('guide','Us4ddaMjeokvvZxNmOxcu9oinZe','doxcnNyOgKDNvNe81hneEuRf6pd')]:
 r=subprocess.run(['lark-cli','docs','+fetch','--doc',doc,'--detail','full','--as','user'],capture_output=True,text=True,check=True);before=json.loads(r.stdout);Path('/tmp/creatoros-price-'+name+'-before.json').write_text(r.stdout)
 tree=E.fromstring('<root>'+before['data']['document']['content']+'</root>');resources=[{'tag':e.tag,**e.attrib} for e in tree.iter() if e.tag in ('img','source','cite','whiteboard','sheet','bitable','synced_reference')]
 (ROOT/(name+'-before-resources.json')).write_text(json.dumps({'documentId':doc,'revisionId':before['data']['document']['revision_id'],'resources':resources},ensure_ascii=False,indent=2)+'\n')
 for command,content in [('block_insert_after',body),('block_replace','<h2>当前支持模型、折扣与折后价｜2026年11月3日</h2>')]:
  r=subprocess.run(['lark-cli','docs','+update','--doc',doc,'--command',command,'--block-id',anchor,'--content',content,'--as','user'],capture_output=True,text=True)
  (ROOT/(name+'-'+command+'.json')).write_text(r.stdout or r.stderr)
  assert r.returncode==0,(name,command,r.stderr)
  reply=json.loads(r.stdout);assert reply.get('ok') and reply['data']['result']=='success',reply
  print(name,command,'成功',flush=True)
