from pathlib import Path
import subprocess,json,hashlib
root=Path(__file__).resolve().parent;rows=[]
for p in sorted(root.glob('candidate-*.mp4')):
 old=root/p.name.replace('candidate-','old-')
 def probe(file):
  info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(file)],timeout=120))
  return [{k:x.get(k) for k in ['codec_name','codec_type','width','height','nb_frames','duration']} for x in info['streams']]
 def decode(file):return subprocess.check_output(['ffmpeg','-v','error','-i',str(file),'-f','rawvideo','-pix_fmt','rgb24','-'],timeout=120)
 pixels=decode(p);original=decode(old);streams=probe(p)
 assert pixels==original and streams==probe(old),p.name
 rows.append({'file':p.name,'old':old.name,'all12FramesRgbBytesEqual':True,'rgbBytes':len(pixels),'rgbSha256':hashlib.sha256(pixels).hexdigest(),'streams':streams})
assert len(rows)==4,len(rows)
(root/'candidate-vs-old-decode.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'status':'PASS','files':len(rows),'allFramesAndStreamsMatch':True}))
