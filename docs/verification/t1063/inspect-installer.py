from pathlib import Path
import sys,struct,json,hashlib
p=Path(sys.argv[1]); h=hashlib.sha256()
with p.open('rb') as f:
 for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
with p.open('rb') as f: data=f.read(4*1024*1024)
assert data[:2]==b'MZ', 'missing DOS header'
pe=struct.unpack_from('<I',data,60)[0]
assert data[pe:pe+4]==b'PE\0\0', 'missing PE signature'
machine=struct.unpack_from('<H',data,pe+4)[0]
optional=pe+24; magic=struct.unpack_from('<H',data,optional)[0]
assert magic in (0x10b,0x20b), 'unknown PE optional header'
directories=optional+(96 if magic==0x10b else 112)
certificate_offset,certificate_size=struct.unpack_from('<II',data,directories+8*4)
versions=[]; cursor=0
while True:
 pos=data.find(b'\xbd\x04\xef\xfe',cursor)
 if pos<0: break
 cursor=pos+4
 if pos+52>len(data): continue
 info=struct.unpack_from('<13I',data,pos)
 if info[1] not in (0,0x10000): continue
 fmt=lambda a,b: f'{a>>16}.{a&65535}.{b>>16}.{b&65535}'
 versions.append({'file_version':fmt(info[2],info[3]),'product_version':fmt(info[4],info[5]),'structure_version':info[1],'offset':pos})
print(json.dumps({'path':str(p.resolve()),'size_bytes':p.stat().st_size,'sha256':h.hexdigest(),'format':'PE','machine':hex(machine),'fixed_version_info':versions,'authenticode_certificate_table':{'offset':certificate_offset,'size':certificate_size,'present':certificate_size>0}},ensure_ascii=False,indent=2))
