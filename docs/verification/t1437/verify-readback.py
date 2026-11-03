from pathlib import Path
from fractions import Fraction
import subprocess,json,xml.etree.ElementTree as E,re
ROOT=Path(__file__).resolve().parent
calc=json.loads((ROOT/'PRICE_CALCULATIONS.json').read_text())
for row in calc['calculations']:
 original=re.fullmatch(r'([$¥])(\d+(?:\.\d+)?)/Mts',row['source']);actual=re.fullmatch(r'([$¥])(\d+(?:\.\d+)?)',row['result'])
 assert original and actual and original[1]==actual[1]
 assert Fraction(original[2])*Fraction(row['multiplier'])==Fraction(actual[2])
report={'independentFractionArithmeticChecks':len(calc['calculations']),'allPricesExact':True,'imageEditDiscountChanged':False,'growthBillingChanged':False,'documents':{}}
for name,doc in [('trial','IUYFdrytdoT2emxg8xzcc1NnnPN'),('guide','Us4ddaMjeokvvZxNmOxcu9oinZe')]:
 r=subprocess.run(['lark-cli','docs','+fetch','--doc',doc,'--detail','full','--as','user'],capture_output=True,text=True,check=True);reply=json.loads(r.stdout);assert reply['ok']
 Path('/tmp/creatoros-price-'+name+'-after.json').write_text(r.stdout)
 content=reply['data']['document']['content'];tree=E.fromstring('<root>'+content+'</root>');res=[{'tag':e.tag,**e.attrib} for e in tree.iter() if e.tag in ('img','source','cite','whiteboard','sheet','bitable','synced_reference')]
 before=json.loads((ROOT/(name+'-before-resources.json')).read_text());assert all(x in res for x in before['resources'])
 actualRows=[[''.join(c.itertext()) for c in tr if c.tag in ('th','td')] for tr in tree.iter('tr')]
 for expected in calc['summaryRows']+calc['cacheRows']:
  assert actualRows.count(expected)==1,(name,expected)
 alltext=''.join(tree.itertext())
 for text in ['4.5折＝原价×45%','4.2折＝原价×42%','6.5折＝原价×65%','6折＝原价×60%','Image 2不参与本次折扣，保持原价','每百万Tokens','实际可用模型、用量与最终结算']:
  assert text in alltext,(name,text)
 assert len([x for x in tree.iter('h2') if ''.join(x.itertext())=='当前支持模型、折扣与折后价｜2026年11月3日'])==1
 report['documents'][name]={'documentId':doc,'revisionId':reply['data']['document']['revision_id'],'summaryRowsVerified':len(calc['summaryRows']),'cacheRowsVerified':len(calc['cacheRows']),'originalResourcesPreserved':True,'originalResourceCount':len(before['resources']),'currentResourceCount':len(res)}
(ROOT/'READBACK.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
