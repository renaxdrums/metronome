package com.renaxdrums.metronome;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.*;
import android.view.WindowManager;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Toast;
import android.widget.FrameLayout;
import java.io.*;
import java.util.*;
import org.json.JSONObject;

/** Local HTTPS asset origin; no file:// access and no JavascriptInterface. */
public final class MainActivity extends Activity {
  private static final String ORIGIN="https://appassets.androidplatform.net";
  private static final String SITE="https://renaxdrums.github.io/metronome/";
  private static final int OPEN_FILE=10,SAVE_FILE=11,EXPORT_CHUNK=64*1024;
  private WebView web;
  private ValueCallback<Uri[]> fileCallback;
  private File exportFile;
  private OutputStream exportWriter;
  private String exportId,exportName,exportMime;
  private long exportSize,exportReceived;
  private int exportSequence;
  private boolean savingExport;
  private boolean destroyed;
  private WebMessagePort nativePort;

  @Override public void onCreate(Bundle state){
    super.onCreate(state);
    getWindow().setStatusBarColor(Color.rgb(28,33,39));
    getWindow().setNavigationBarColor(Color.rgb(28,33,39));
    web=new WebView(this);web.setBackgroundColor(Color.rgb(28,33,39));
    FrameLayout root=new FrameLayout(this);root.addView(web,new FrameLayout.LayoutParams(-1,-1));
    root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener(){@Override public WindowInsets onApplyWindowInsets(View view,WindowInsets insets){view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;}});
    setContentView(root);
    WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);
    s.setAllowFileAccess(false);s.setAllowContentAccess(true);
    s.setAllowFileAccessFromFileURLs(false);s.setAllowUniversalAccessFromFileURLs(false);
    s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setSafeBrowsingEnabled(true);
    s.setMediaPlaybackRequiresUserGesture(true);s.setSupportMultipleWindows(false);
    WebView.setWebContentsDebuggingEnabled(false);
    CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
    web.setWebViewClient(new WebViewClient(){
      @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){
        Uri u=r.getUrl();String host=u.getHost();
        if(!"https".equals(u.getScheme()))return denied();
        if("appassets.androidplatform.net".equals(host))return asset(u);
        if(!allowedHost(host))return denied();
        return null;
      }
      @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){
        Uri u=r.getUrl();
        if((ORIGIN+"/open-website").equals(u.toString())){openSite();return true;}
        if(r.isForMainFrame()&&!(ORIGIN+"/app/index.html").equals(u.toString())){
          if(r.hasGesture()&&"https".equals(u.getScheme()))openExternal(u);
          return true;
        }
        return !"https".equals(u.getScheme());
      }
      @Override public void onPageFinished(WebView v,String url){if((ORIGIN+"/app/index.html").equals(url))installPort();}
    });
    web.setWebChromeClient(new WebChromeClient(){
      @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> callback,FileChooserParams params){
        if(!(ORIGIN+"/app/index.html").equals(v.getUrl()))return false;
        if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;
        Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT);pick.addCategory(Intent.CATEGORY_OPENABLE);
        pick.setType("*/*");pick.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"application/json","audio/*"});
        try{startActivityForResult(pick,OPEN_FILE);}catch(Exception error){fileCallback.onReceiveValue(null);fileCallback=null;}
        return true;
      }
    });
    web.setDownloadListener(new DownloadListener(){@Override public void onDownloadStart(String url,String agent,String disposition,String mime,long length){
      if(url.startsWith("https://")&&allowedHost(Uri.parse(url).getHost()))openExternal(Uri.parse(url));
    }});
    web.loadUrl(ORIGIN+"/app/index.html");

  }
  private boolean allowedHost(String h){
    return h!=null&&(h.equals("cdn.jsdelivr.net")||h.equals("fonts.googleapis.com")||h.equals("fonts.gstatic.com")||h.equals("huggingface.co")||h.endsWith(".huggingface.co")||h.endsWith(".hf.co"));
  }
  private WebResourceResponse denied(){return new WebResourceResponse("text/plain","UTF-8",403,"Forbidden",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
  private WebResourceResponse asset(Uri uri){
    String p=uri.getPath();
    if(p==null||!p.startsWith("/app/")||p.contains("..")||p.indexOf('\\')>=0||p.indexOf('\0')>=0)return denied();
    String file=p.substring(5);if(file.isEmpty())file="index.html";
    try{
      InputStream input=getAssets().open("site/"+file);
      String mime=URLConnectionMime(file);Map<String,String> headers=new HashMap<>();
      headers.put("X-Content-Type-Options","nosniff");headers.put("Cache-Control","no-cache");
      return new WebResourceResponse(mime,mime.startsWith("text/")||mime.contains("javascript")||mime.contains("json")?"UTF-8":null,200,"OK",headers,input);
    }catch(IOException error){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
  }
  private String URLConnectionMime(String file){
    if(file.endsWith(".js")||file.endsWith(".mjs"))return "text/javascript";
    if(file.endsWith(".css"))return "text/css";if(file.endsWith(".html"))return "text/html";
    if(file.endsWith(".json")||file.endsWith(".webmanifest"))return "application/json";
    if(file.endsWith(".svg"))return "image/svg+xml";if(file.endsWith(".wasm"))return "application/wasm";
    if(file.endsWith(".wav"))return "audio/wav";if(file.endsWith(".mp3"))return "audio/mpeg";
    if(file.endsWith(".woff2"))return "font/woff2";if(file.endsWith(".woff"))return "font/woff";
    String mime=java.net.URLConnection.guessContentTypeFromName(file);return mime==null?"application/octet-stream":mime;
  }
  private void reply(WebMessagePort port,String id,int seq,boolean ok,boolean cancelled){
    try{port.postMessage(new WebMessage(new JSONObject().put("id",id).put("seq",seq).put("ok",ok).put("cancelled",cancelled).toString()));}catch(Exception ignored){}
  }
  private void clearExport(){
    if(exportWriter!=null)try{exportWriter.close();}catch(IOException ignored){}
    exportWriter=null;
    if(exportFile!=null)exportFile.delete();
    exportFile=null;exportId=null;exportName=null;exportMime=null;
    exportSize=0;exportReceived=0;exportSequence=0;
  }
  private void receiveExport(WebMessagePort port,JSONObject data) throws Exception {
    String kind=data.optString("kind"),id=data.optString("id");int seq=data.optInt("seq",-1);
    if(id.isEmpty()||id.length()>80)throw new IOException("Invalid transfer identifier");
    if("abort".equals(kind)){if(id.equals(exportId)&&!savingExport)clearExport();return;}
    if("begin".equals(kind)){
      if(exportId!=null||savingExport){reply(port,id,seq,false,false);return;}
      String mime=data.getString("mime"),name=data.getString("name");
      double size=data.getDouble("size");
      if(seq!=0||!Arrays.asList("application/json","audio/mpeg","audio/wav","audio/mp3","audio/midi").contains(mime)||!Double.isFinite(size)||size<0||size>9007199254740991d||size!=Math.floor(size))throw new IOException("Invalid export");
      name=name.replaceAll("[\\\\/\\p{Cntrl}]","_");if(name.length()>120)name=name.substring(0,120);if(name.isEmpty())name="renax-export";
      exportId=id;exportName=name;exportMime=mime;exportSize=(long)size;exportReceived=0;exportSequence=0;
      exportFile=File.createTempFile("renax-export-",".tmp",getCacheDir());
      exportWriter=new BufferedOutputStream(new FileOutputStream(exportFile),EXPORT_CHUNK);
      reply(port,id,seq,true,false);return;
    }
    if(!id.equals(exportId)||savingExport){reply(port,id,seq,false,false);return;}
    if(seq!=exportSequence+1||exportWriter==null)throw new IOException("Invalid transfer order");
    if("chunk".equals(kind)){
      String encoded=data.getString("data");if(encoded.length()>(EXPORT_CHUNK+2)/3*4)throw new IOException("Chunk too large");
      byte[] bytes=Base64.decode(encoded,Base64.NO_WRAP);
      if(bytes.length==0||bytes.length>EXPORT_CHUNK||bytes.length>exportSize-exportReceived)throw new IOException("Invalid chunk size");
      exportWriter.write(bytes);exportReceived+=bytes.length;exportSequence=seq;
      reply(port,id,seq,true,false);return;
    }
    if(!"finish".equals(kind)||exportReceived!=exportSize)throw new IOException("Incomplete export");
    exportWriter.close();exportWriter=null;exportSequence=seq;savingExport=true;
    // Android 15 maps audio/midi to .rtx; keep the supplied .mid filename.
    Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT);save.addCategory(Intent.CATEGORY_OPENABLE);
    save.setType("audio/midi".equals(exportMime)?"application/octet-stream":exportMime);save.putExtra(Intent.EXTRA_TITLE,exportName);
    try{startActivityForResult(save,SAVE_FILE);}catch(Exception error){savingExport=false;throw error;}
    // The finish acknowledgement follows the actual save or picker cancellation.
  }
  private void installPort(){
    if(savingExport)return;
    clearExport();if(nativePort!=null)nativePort.close();
    final String nonce=UUID.randomUUID().toString();final WebMessagePort[] ports=web.createWebMessageChannel();nativePort=ports[0];
    nativePort.setWebMessageCallback(new WebMessagePort.WebMessageCallback(){@Override public void onMessage(WebMessagePort port,WebMessage message){
      JSONObject data=null;
      try{
        if(!(ORIGIN+"/app/index.html").equals(web.getUrl()))return;
        String raw=message.getData();if(raw==null||raw.length()>EXPORT_CHUNK*2)return;
        data=new JSONObject(raw);
        if("screen".equals(data.optString("kind"))){if(data.optBoolean("keep"))getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);return;}
        receiveExport(port,data);
      }catch(Exception error){
        if(data!=null){String id=data.optString("id");reply(port,id,data.optInt("seq",-1),false,false);if(id.equals(exportId)&&!savingExport)clearExport();}
      }
    }});
    try{
      ByteArrayOutputStream source=new ByteArrayOutputStream();
      try(InputStream input=getAssets().open("site/android-native-bridge.js")){byte[] buffer=new byte[4096];int count;while((count=input.read(buffer))!=-1)source.write(buffer,0,count);}
      String script=source.toString("UTF-8")+"("+JSONObject.quote(nonce)+","+EXPORT_CHUNK+","+JSONObject.quote(ORIGIN+"/open-website")+");";
      web.evaluateJavascript(script,new ValueCallback<String>(){@Override public void onReceiveValue(String ignored){if(!destroyed)web.postWebMessage(new WebMessage("renax-native:"+nonce,new WebMessagePort[]{ports[1]}),Uri.parse(ORIGIN));}});
    }catch(IOException error){Toast.makeText(this,"Export indisponible",Toast.LENGTH_SHORT).show();}
  }
  private void saveExportResult(int result,Intent data){
    if(!savingExport||exportFile==null)return;
    final WebMessagePort port=nativePort;final String id=exportId;final int seq=exportSequence;
    final Uri uri=data==null?null:data.getData();
    if(result!=RESULT_OK||uri==null||!"content".equals(uri.getScheme())){
      savingExport=false;clearExport();reply(port,id,seq,true,true);return;
    }
    final File file=exportFile;exportFile=null;
    new Thread(new Runnable(){@Override public void run(){
      boolean success=false;
      try{try(InputStream input=new BufferedInputStream(new FileInputStream(file));OutputStream output=getContentResolver().openOutputStream(uri,"wt")){
        if(output==null)throw new IOException("No output stream");
        byte[] buffer=new byte[EXPORT_CHUNK];int count;while((count=input.read(buffer))!=-1)output.write(buffer,0,count);
        output.flush();
      }success=true;}catch(Exception ignored){}finally{file.delete();}
      final boolean saved=success;
      runOnUiThread(new Runnable(){@Override public void run(){savingExport=false;clearExport();if(!destroyed){reply(port,id,seq,saved,false);if(!saved)Toast.makeText(MainActivity.this,"Enregistrement impossible",Toast.LENGTH_SHORT).show();}}});
    }},"renax-native-export").start();
  }
  private void openSite(){openExternal(Uri.parse(SITE));}
  private void openExternal(Uri uri){try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception ignored){}}
  @Override protected void onActivityResult(int request,int result,Intent data){
    super.onActivityResult(request,result,data);
    if(request==OPEN_FILE&&fileCallback!=null){Uri uri=data==null?null:data.getData();fileCallback.onReceiveValue(result==RESULT_OK&&uri!=null&&"content".equals(uri.getScheme())?new Uri[]{uri}:null);fileCallback=null;}
    if(request==SAVE_FILE)saveExportResult(result,data);
  }
  @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
  @Override protected void onPause(){web.onPause();super.onPause();}
  @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
  @Override protected void onDestroy(){destroyed=true;clearExport();if(fileCallback!=null)fileCallback.onReceiveValue(null);if(nativePort!=null)nativePort.close();web.destroy();super.onDestroy();}
}
