"""Compare saved Android MP3 audio to the real recorded/neural source waveform."""
from pathlib import Path
import array, base64, hashlib, json, subprocess
import numpy as np


def waveform_match(filename, source):
    decoded=subprocess.run(['ffmpeg','-v','error','-i',str(filename),'-f','f32le','-ac','1','-ar','48000','-'],capture_output=True,check=True,timeout=30).stdout
    signal=np.frombuffer(decoded,dtype='<f4').astype(np.float64)
    raw=base64.b64decode(source['pcm']);reference=np.frombuffer(raw,dtype='<f4').astype(np.float64)
    def require(condition,message):
        if not condition:raise AssertionError(message)
    require(np.isfinite(signal).all() and np.isfinite(reference).all(),'Non-finite exported audio')
    require(len(reference)>1000 and len(signal)>len(reference),'Missing speech samples')
    rate=source['rate'];count=round(len(reference)*48000/rate)
    reference=np.interp(np.arange(count)*rate/48000,np.arange(len(reference)),reference)
    reference-=reference.mean();energy=float(reference@reference)
    require(energy>1e-8,'Silent reference speech')
    n=1<<(len(signal)+len(reference)-1).bit_length()
    correlation=np.fft.irfft(np.fft.rfft(signal,n)*np.conj(np.fft.rfft(reference,n)),n)[:len(signal)-len(reference)+1]
    cumulative=np.r_[0.,np.cumsum(signal*signal)]
    window_energy=cumulative[len(reference):]-cumulative[:-len(reference)]
    valid=window_energy>max(1e-9,float(window_energy.max())*1e-3)
    scores=np.full(len(correlation),-1.,dtype=np.float64)
    scores[valid]=np.clip(correlation[valid]/np.sqrt(window_energy[valid]*energy),-1.,1.)
    index=int(np.argmax(scores));score=float(scores[index])
    require(score>.65,'Saved MP3 does not contain the expected voice waveform: correlation='+str(score))
    return {'normalized_waveform_correlation':score,'speech_position_seconds':index/48000,'reference_pcm_sha256':hashlib.sha256(raw).hexdigest(),'reference_samples':source['samples'],'decoded_samples':len(signal),'decoded_peak':float(np.max(np.abs(signal)))}


def run_export_checks(api, save_picker, out):
    js, wait, tap, nav, set_value, check, require=api

    def export_audio(kind):
        nav('tracks');original=js('JSON.parse(JSON.stringify(RENAX_SONGS.library))')
        bank='voiceMale' if kind=='male' else 'voiceFemale' if kind=='female' else 'clic'
        guide=kind in ['fr','en'];title='QA export '+kind
        js('''(()=>{const m=createMeasure(4,4,120);m.beatSubdivisions=[1,1,1,1];m.beatStates=[[1],[0],[0],[0]];const s={id:'qa-export-'''+kind+'''',name:'''+json.dumps(title)+''',amorce:'''+json.dumps(guide)+''',sections:[{id:'qa-export-section',label:'Intro',count:1,amorceLanguage:'''+json.dumps(kind if guide else 'fr')+''',measure:m}]};RENAX_SONGS.replaceLibrary({version:1,activeProfile:'qa-export-profile',profiles:[{id:'qa-export-profile',name:'QA',songs:[s]}]},true);RENAX_SONGS.restoreNavigation({pane:'songs',view:'playlist',profile:'qa-export-profile',song:null});return true})()''')
        try:
            set_value('#soundBank',bank);set_value('#volumeSlider',80,'input')
            js('''(()=>{window.__qaExportReference={pending:true};const encode=(pcm,rate)=>{const bytes=new Uint8Array(pcm.buffer,pcm.byteOffset,pcm.byteLength);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return {pcm:btoa(binary),rate,samples:pcm.length}};'''+('''RENAX_AMORCE.prepare(RENAX_SONGS.library.profiles[0].songs[0]).then(plan=>{const s=plan.speeches[0];__qaExportReference=encode(s.pcm,s.sampleRate)},e=>__qaExportReference={error:String(e.stack)});''' if guide else '''prepareAllVoiceAudio().then(()=>{const b=VOICE_METRONOME_BUFFERS['''+json.dumps('male' if kind=='male' else 'female')+''']['1'];__qaExportReference=encode(b.getChannelData(0),b.sampleRate)},e=>__qaExportReference={error:String(e.stack)});''')+'''return true})()''')
            reference=wait('window.__qaExportReference',lambda x:not x.get('pending'),timeout=240)
            require(not reference.get('error'),reference.get('error'))
            tap('#mp3ExportOpen')
            require(js('document.querySelector("#mp3ExportSong").options[0].textContent')==title,'Export dialog did not refresh after library edit')
            set_value('#mp3ExportLevel','original' if kind in ['male','fr'] else 'boost')
            tap('#mp3ExportSave')
            wait('!!document.querySelector("#mp3ExportDownload")&&!document.querySelector("#mp3ExportDownload").hidden',timeout=180)
            filename=js('document.querySelector("#mp3ExportDownload").download');tap('#mp3ExportDownload');data=save_picker(filename)
            result=waveform_match(out/filename,reference)
            tap('#mp3ExportDialog .mp3-actions button:last-child');wait('!document.querySelector("#mp3ExportDialog")')
            return dict(result,kind=kind,bytes=len(data),native_picker=True,level='original' if kind in ['male','fr'] else 'boost')
        finally:
            js('(()=>{document.querySelector("#mp3ExportDialog")?.close();RENAX_SONGS.replaceLibrary('+json.dumps(original)+''',true);RENAX_SONGS.restoreNavigation({pane:'songs',view:'playlist',profile:RENAX_SONGS.library.activeProfile,song:null});return true})()''')
            set_value('#soundBank','userMetroclic')

    for kind in ['male','female','fr','en']:
        check('native_mp3_contains_'+kind+'_voice_waveform',lambda kind=kind:export_audio(kind))
