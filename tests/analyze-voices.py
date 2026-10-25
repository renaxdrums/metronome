"""Check annotated vowel landmarks and unchanged shipped recordings."""
import pathlib,wave,json,hashlib,numpy as np
root=pathlib.Path(__file__).resolve().parents[1]
annotations=json.loads((root/'tests/voice-anchors.json').read_text(encoding='utf-8'))
folders={'male':'voice-men-en','female':'voice-female-en'}
def smooth(x,sigma=8):
 t=np.arange(-32,33);k=np.exp(-t*t/(2*sigma*sigma));k/=k.sum()
 return np.convolve(np.pad(x,(32,32),mode='reflect'),k,'valid')
results=[]
for a in annotations:
 p=root/'assets/voices'/folders[a['gender']]/f"{a['number']:02}.wav"
 with wave.open(str(p)) as w:
  assert w.getnchannels()==1 and w.getsampwidth()==2 and w.getframerate()==48000
  x=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(float)/32768
 freq=np.fft.rfftfreq(len(x),1/48000);spec=np.fft.rfft(x)
 mask=np.minimum(np.clip((freq-300)/120,0,1),np.clip((2500-freq)/375,0,1))
 mid=np.fft.irfft(spec*mask,n=len(x))
 env=smooth(np.sqrt(np.maximum(0,np.convolve(mid*mid,np.ones(480)/480,'same')))[::48])
 slope=np.gradient(env);lo,hi=a['region_ms'];hi=min(hi,len(slope))
 if a.get('landmark')=='consonant_onset':
  blocks=np.sqrt(np.mean(x[:len(x)//48*48].reshape(-1,48)**2,axis=1))
  measured=int(np.flatnonzero(blocks>.002)[0])
 else:measured=int(lo+np.argmax(slope[lo:hi]))
 err=measured-a['anchor_ms']
 assert abs(err)<=1,(a,measured)
 sha=hashlib.sha256(p.read_bytes()).hexdigest()
 assert sha==a['sha256'],f"Sample changed; recalibration required: {p}"
 results.append(dict(gender=a['gender'],number=a['number'],annotated_ms=a['anchor_ms'],measured_ms=measured,error_ms=err,sha256=sha,duration_ms=len(x)/48))
out=root/'tests/results';out.mkdir(exist_ok=True)
(out/'sample-analysis.json').write_text(json.dumps(results,indent=2)+'\n')
print(f"{len(results)} vowel landmarks verified; maximum error {max(abs(r['error_ms']) for r in results)} ms.")
